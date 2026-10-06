"""The SQL data model, on small hand-written event streams."""

import uuid
from datetime import UTC, datetime, timedelta

import pandas as pd
from sqlalchemy import text

from app.models import Event, Property, User

T0 = datetime(2026, 10, 1, 12, tzinfo=UTC)


def _insert(engine, *, users=(), properties=(), events=()):
    with engine.begin() as conn:
        if users:
            conn.execute(User.__table__.insert(), list(users))
        if properties:
            conn.execute(Property.__table__.insert(), list(properties))
        if events:
            conn.execute(Event.__table__.insert(), list(events))


def _property(pid: str, ptype: str) -> dict:
    return {
        "id": pid,
        "name": pid,
        "type": ptype,
        "description": "",
        "address": "1 St, Maadi, Cairo",
        "price": 1_000_000,
        "area": 1000,
        "bedrooms": 2,
        "bathrooms": 1,
        "rating": 4.0,
        "image_url": "x",
        "facilities": [],
        "created_at": T0,
    }


def _event(name, session, minute, props=None, *, user_id=None, platform="android"):
    return {
        "event_id": uuid.uuid4(),
        "event_name": name,
        "occurred_at": T0 + timedelta(minutes=minute),
        "received_at": T0,
        "clock_adjusted": False,
        "user_id": user_id,
        "anonymous_id": uuid.UUID(int=1),
        "session_id": session,
        "platform": platform,
        "app_version": "test",
        "properties": props or {},
    }


def test_property_funnel_counts_each_session_property_pair_once(clean):
    s = uuid.uuid4()
    _insert(
        clean,
        users=[{"id": "u1", "name": "U", "phone": None, "is_demo": True, "role": "user"}],
        properties=[_property("villa", "Villas"), _property("flat", "Apartments")],
        events=[
            _event(
                "property_impression", s, 1, {"property_id": "villa", "list": "home", "position": 0}
            ),
            _event(
                "property_impression", s, 2, {"property_id": "flat", "list": "home", "position": 1}
            ),
            _event(
                "property_card_clicked",
                s,
                3,
                {"property_id": "villa", "list": "home", "position": 0},
            ),
            # Opened twice in the same session: still one viewed pair.
            _event("property_viewed", s, 4, {"property_id": "villa", "source": "card"}),
            _event("property_viewed", s, 5, {"property_id": "villa", "source": "card"}),
            _event("viewing_form_opened", s, 6, {"property_id": "villa"}),
            _event(
                "viewing_requested", s, 7, {"property_id": "villa"}, user_id="u1", platform="server"
            ),
        ],
    )
    funnel = pd.read_sql("SELECT * FROM analytics.property_funnel ORDER BY property_id", clean)

    assert len(funnel) == 2
    flat, villa = funnel.to_dict("records")
    assert flat["impressed"] and not flat["clicked"] and not flat["viewed"]
    assert villa["impressed"] and villa["clicked"] and villa["viewed"]
    assert villa["form_opened"] and villa["requested"] and villa["property_type"] == "Villas"


def test_sessions_resolve_person_platform_and_guest_status(clean):
    s = uuid.uuid4()
    _insert(
        clean,
        users=[{"id": "u1", "name": "U", "phone": None, "is_demo": True, "role": "user"}],
        events=[
            _event("screen_viewed", s, 0, {"screen": "auth"}),  # before sign-in
            _event("signed_up", s, 1, {"method": "guest"}, user_id="u1", platform="server"),
            _event("screen_viewed", s, 2, {"screen": "home"}, user_id="u1", platform="ios"),
        ],
    )
    session = pd.read_sql("SELECT * FROM analytics.sessions", clean).iloc[0]

    assert session["user_id"] == "u1"
    assert session["person_id"] == "u1"
    # The app's platform, not "server" from the server-side event.
    assert session["platform"] == "android"
    assert bool(session["is_guest"]) is True
    assert bool(session["converted"]) is False


def test_searches_flag_dead_ends_and_whether_people_continued(clean):
    s1, s2 = uuid.uuid4(), uuid.uuid4()
    _insert(
        clean,
        properties=[_property("villa", "Villas")],
        events=[
            _event("search_performed", s1, 0, {"query": " Duplex ", "results_count": 0}),
            _event("search_performed", s2, 0, {"query": "villa", "results_count": 3}),
            _event("property_viewed", s2, 1, {"property_id": "villa", "source": "card"}),
        ],
    )
    searches = pd.read_sql("SELECT * FROM analytics.searches ORDER BY query", clean)

    duplex, villa = searches.to_dict("records")
    assert duplex["query"] == "duplex"  # normalized
    assert duplex["dead_end"] and not duplex["followed_by_view"]
    assert not villa["dead_end"] and villa["followed_by_view"]


def test_daily_kpis(clean):
    s1, s2 = uuid.uuid4(), uuid.uuid4()
    _insert(
        clean,
        properties=[_property("villa", "Villas")],
        events=[
            _event("app_opened", s1, 0, {"cold_start": True}),
            _event("app_opened", s2, 5, {"cold_start": True}),
            _event("viewing_requested", s2, 6, {"property_id": "villa"}, platform="server"),
        ],
    )
    with clean.connect() as conn:
        row = conn.execute(
            text("SELECT sessions, converted_sessions FROM analytics.daily_kpis")
        ).one()
    assert tuple(row) == (2, 1)
