import uuid
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select

from app.events.__main__ import OUTPUT, render
from app.models import Event, UserRole

SESSION = str(uuid.uuid4())
DEVICE = str(uuid.uuid4())


def _event(name: str, properties: dict, **overrides: object) -> dict:
    event = {
        "event_id": str(uuid.uuid4()),
        "event_name": name,
        "occurred_at": datetime.now(UTC).isoformat(),
        "anonymous_id": DEVICE,
        "session_id": SESSION,
        "platform": "android",
        "app_version": "1.0.0",
        "properties": properties,
    }
    event.update(overrides)
    return event


def _stored(db, name: str) -> list[Event]:
    db.expire_all()
    return list(db.scalars(select(Event).where(Event.event_name == name)))


# --- ingestion ---------------------------------------------------------------------


def test_valid_events_are_stored_with_the_user_from_the_token(client, db, make_user, auth_headers):
    user = make_user()
    other = make_user()
    batch = {
        "events": [
            _event("screen_viewed", {"screen": "home"}, user_id=user.id),
            # Claiming to be someone other than the token's user attributes nothing.
            _event("app_opened", {"cold_start": True}, user_id=other.id),
        ]
    }
    response = client.post("/events", json=batch, headers=auth_headers(user))

    assert response.json() == {"accepted": 2, "duplicates": 0, "rejected": []}
    stored = _stored(db, "screen_viewed")[0]
    assert stored.user_id == user.id
    assert str(stored.session_id) == SESSION
    assert stored.properties == {"screen": "home"}
    assert _stored(db, "app_opened")[0].user_id is None


def test_events_from_before_sign_in_stay_anonymous_when_uploaded_after(
    client, db, make_user, auth_headers
):
    # Regression: attribution used the token at upload time, so a failed sign-in
    # attempt queued before signing in was credited to the account created after it.
    user = make_user()
    before = _event("sign_in_failed", {"reason": "invalid_phone"})  # no user_id: signed out
    after = _event("screen_viewed", {"screen": "home"}, user_id=user.id)
    client.post("/events", json={"events": [before, after]}, headers=auth_headers(user))

    assert _stored(db, "sign_in_failed")[0].user_id is None
    assert _stored(db, "screen_viewed")[0].user_id == user.id


def test_events_before_sign_in_are_anonymous(client, db):
    response = client.post(
        "/events", json={"events": [_event("screen_viewed", {"screen": "auth"})]}
    )
    assert response.json()["accepted"] == 1
    stored = _stored(db, "screen_viewed")[0]
    assert stored.user_id is None
    assert str(stored.anonymous_id) == DEVICE


def test_an_invalid_token_doesnt_lose_the_events(client, db):
    response = client.post(
        "/events",
        json={"events": [_event("app_opened", {"cold_start": False})]},
        headers={"Authorization": "Bearer expired-or-garbage"},
    )
    assert response.json()["accepted"] == 1
    assert _stored(db, "app_opened")[0].user_id is None


def test_retried_events_are_stored_once(client, db):
    event = _event("app_opened", {"cold_start": True})
    first = client.post("/events", json={"events": [event]}).json()
    retry = client.post("/events", json={"events": [event, event]}).json()

    assert first["accepted"] == 1
    assert retry == {"accepted": 0, "duplicates": 2, "rejected": []}
    assert len(_stored(db, "app_opened")) == 1


def test_invalid_events_are_rejected_one_by_one(client, db):
    good = _event("screen_viewed", {"screen": "home"})
    unknown = _event("button_mashed", {})
    bad_value = _event("screen_viewed", {"screen": "settings"})
    extra_prop = _event("screen_viewed", {"screen": "home", "phone": "+201001234567"})
    missing_prop = _event("property_impression", {"property_id": "p1", "list": "home"})

    result = client.post(
        "/events", json={"events": [good, unknown, bad_value, extra_prop, missing_prop]}
    ).json()

    assert result["accepted"] == 1
    errors = {r["event_id"]: r["error"] for r in result["rejected"]}
    assert "unknown event 'button_mashed'" in errors[unknown["event_id"]]
    assert "screen" in errors[bad_value["event_id"]]
    # Undeclared properties are rejected, which keeps personal data out by default.
    assert "phone" in errors[extra_prop["event_id"]]
    assert "position" in errors[missing_prop["event_id"]]


def test_the_app_cannot_send_server_side_outcomes(client, db):
    fake = _event(
        "viewing_requested",
        {"property_id": "p1", "request_id": "r1", "time_slot": "morning", "days_ahead": 1},
    )
    result = client.post("/events", json={"events": [fake]}).json()

    assert result["accepted"] == 0
    assert "recorded by the server" in result["rejected"][0]["error"]
    assert _stored(db, "viewing_requested") == []


def test_future_timestamps_from_wrong_clocks_are_replaced(client, db):
    far_future = (datetime.now(UTC) + timedelta(days=30)).isoformat()
    slightly_ahead = (datetime.now(UTC) + timedelta(minutes=5)).isoformat()
    client.post(
        "/events",
        json={
            "events": [
                _event("app_opened", {"cold_start": True}, occurred_at=far_future),
                _event("screen_viewed", {"screen": "home"}, occurred_at=slightly_ahead),
            ]
        },
    )
    skewed = _stored(db, "app_opened")[0]
    assert skewed.clock_adjusted is True
    assert skewed.occurred_at <= datetime.now(UTC)
    # Small differences between clocks are normal and kept as sent.
    assert _stored(db, "screen_viewed")[0].clock_adjusted is False


def test_batches_are_limited_in_size(client):
    batch = {"events": [_event("app_opened", {"cold_start": True}) for _ in range(51)]}
    assert client.post("/events", json=batch).status_code == 422


# --- server-side events --------------------------------------------------------------


def _ctx_headers(user, auth_headers) -> dict:
    return {**auth_headers(user), "X-Session-Id": SESSION, "X-Anonymous-Id": DEVICE}


def test_sign_up_and_sign_in_are_recorded(client, db):
    body = {"name": "Mariam", "phone": "01001234567", "country": "EG"}
    headers = {"X-Session-Id": SESSION, "X-Anonymous-Id": DEVICE}
    client.post("/auth/phone", json=body, headers=headers)
    client.post("/auth/phone", json=body, headers=headers)
    client.post("/auth/demo")

    signed_up = _stored(db, "signed_up")
    assert sorted(e.properties["method"] for e in signed_up) == ["guest", "phone"]
    signed_in = _stored(db, "signed_in")[0]
    # Server events join the app's session through the headers.
    assert str(signed_in.session_id) == SESSION
    assert str(signed_in.anonymous_id) == DEVICE
    assert signed_in.platform == "server"


def test_favorites_record_only_real_changes(client, db, make_user, make_property, auth_headers):
    user, prop = make_user(), make_property()
    headers = _ctx_headers(user, auth_headers)
    for _ in range(2):  # saving twice changes nothing the second time
        client.put(f"/favorites/{prop.id}", headers=headers)
    for _ in range(2):
        client.delete(f"/favorites/{prop.id}", headers=headers)

    assert len(_stored(db, "favorite_added")) == 1
    assert len(_stored(db, "favorite_removed")) == 1
    assert _stored(db, "favorite_added")[0].properties == {"property_id": prop.id}


def test_viewing_pipeline_is_recorded(client, db, make_user, make_property, auth_headers):
    user, admin = make_user(), make_user(role=UserRole.ADMIN)
    prop = make_property()
    request = client.post(
        "/viewing-requests",
        json={
            "property_id": prop.id,
            "preferred_date": (date.today() + timedelta(days=3)).isoformat(),
            "time_slot": "evening",
            "phone": "+201001234567",
        },
        headers=_ctx_headers(user, auth_headers),
    ).json()
    client.patch(
        f"/admin/viewing-requests/{request['id']}",
        json={"status": "contacted"},
        headers=auth_headers(admin),
    )
    client.post(f"/viewing-requests/{request['id']}/cancel", headers=auth_headers(user))

    requested = _stored(db, "viewing_requested")[0]
    assert requested.user_id == user.id
    assert requested.properties == {
        "property_id": prop.id,
        "request_id": request["id"],
        "time_slot": "evening",
        "days_ahead": 3,
    }
    changes = sorted(
        (e.properties["to_status"], e.properties["changed_by"])
        for e in _stored(db, "viewing_status_changed")
    )
    assert changes == [("cancelled", "user"), ("contacted", "agent")]
    # Each status change also notified the user.
    kinds = [e.properties["kind"] for e in _stored(db, "notification_created")]
    assert kinds.count("viewing_status") == 2


def test_failed_actions_record_no_event(client, db, make_user, make_property, auth_headers):
    user, prop = make_user(), make_property()
    body = {
        "property_id": prop.id,
        "preferred_date": (date.today() + timedelta(days=1)).isoformat(),
        "time_slot": "morning",
        "phone": "+201001234567",
    }
    client.post("/viewing-requests", json=body, headers=auth_headers(user))
    duplicate = client.post("/viewing-requests", json=body, headers=auth_headers(user))

    assert duplicate.status_code == 409
    assert len(_stored(db, "viewing_requested")) == 1


def test_notifications_record_their_kind(client, db, make_user, auth_headers):
    user = make_user()
    client.post("/notifications/check-new-properties", headers=auth_headers(user))
    event = _stored(db, "notification_created")[0]
    assert event.properties["kind"] == "welcome"
    assert event.properties["property_id"] is None

    listed = client.get("/notifications", headers=auth_headers(user)).json()
    assert listed[0]["kind"] == "welcome"


# --- privacy -------------------------------------------------------------------------


def test_deleting_an_account_deletes_its_events(client, db):
    other_device = str(uuid.uuid4())
    # Before signing in on this device...
    client.post("/events", json={"events": [_event("screen_viewed", {"screen": "auth"})]})
    # ...someone else uses a different device.
    client.post(
        "/events",
        json={"events": [_event("screen_viewed", {"screen": "auth"}, anonymous_id=other_device)]},
    )
    token = client.post(
        "/auth/phone",
        json={"name": "Mariam", "phone": "01001234567", "country": "EG"},
        headers={"X-Anonymous-Id": DEVICE},
    ).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    client.post(
        "/events", json={"events": [_event("app_opened", {"cold_start": True})]}, headers=headers
    )

    client.delete("/users/me", headers=headers)

    db.expire_all()
    remaining = list(db.scalars(select(Event)))
    # Only the other person's event is left: the signed-in events and this device's
    # pre-sign-in events are gone.
    assert [str(e.anonymous_id) for e in remaining] == [other_device]


# --- contract ------------------------------------------------------------------------


def test_exported_tracking_plan_is_up_to_date():
    assert OUTPUT.read_text(encoding="utf-8") == render(), (
        "shared/tracking-plan.json is stale: run `python -m app.events` in backend/"
    )
