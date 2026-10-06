import pytest
from sqlalchemy import select

from app.models import Event, Notification, NotificationKind, PropertyView
from app.services import recommendations


def _view(db, user, prop, times=1):
    for _ in range(times):
        db.add(PropertyView(user_id=user.id, property_id=prop.id))
    db.commit()


@pytest.fixture
def variant(monkeypatch):
    """Put the test user in a chosen recommender variant, and drop cached models."""

    def choose(name: str) -> None:
        monkeypatch.setattr(recommendations, "assign", lambda experiment, user_id: name)

    recommendations._fitted.clear()
    yield choose
    recommendations._fitted.clear()


def _check(client, headers):
    return client.post("/notifications/check-new-properties", headers=headers).json()


def test_new_user_gets_one_welcome_that_recommends_nothing(
    client, make_user, make_property, auth_headers
):
    headers = auth_headers(make_user(name="Mariam Fathi"))
    make_property(age_days=0)

    first = _check(client, headers)
    assert first["reason"] == "welcome"
    assert first["notification"]["title"] == "🏠 Welcome to Homi, Mariam!"
    # No history means no signal: the welcome must not point at a property.
    assert first["notification"]["related_property_id"] is None

    second = _check(client, headers)
    assert second == {"reason": "no_preference_yet", "notification": None}


def test_rule_recommends_newest_of_the_favorite_type_once_each(
    client, db, make_user, make_property, auth_headers, variant
):
    variant("control")
    user = make_user()
    headers = auth_headers(user)
    viewed = make_property(type="Villas", age_days=30)
    _view(db, user, viewed, 3)
    newer = make_property(type="Villas", age_days=1)
    older = make_property(type="Villas", age_days=20)
    make_property(type="Apartments", age_days=0)  # wrong type for the rule

    first = _check(client, headers)
    assert first["reason"] == "new_match"
    assert first["notification"]["related_property_id"] == newer.id
    assert first["notification"]["message"] == (
        f"{newer.name} in Maadi, based on homes you've viewed."
    )
    # Never the same listing twice: the next suggestion is the older villa.
    assert _check(client, headers)["notification"]["related_property_id"] == older.id
    assert _check(client, headers)["reason"] == "no_new_matches"


def test_rule_stays_silent_without_a_clear_favorite_type(
    client, db, make_user, make_property, auth_headers, variant
):
    variant("control")
    user = make_user()
    for ptype in ("Villas", "Apartments", "Commercial"):
        _view(db, user, make_property(type=ptype))
    make_property(type="Villas")

    assert _check(client, auth_headers(user))["reason"] == "no_preference_yet"


@pytest.mark.parametrize("name", ["popularity", "hybrid"])
def test_learned_models_recommend_without_a_clear_favorite(
    client, db, make_user, make_property, auth_headers, variant, name
):
    variant(name)
    user = make_user()
    for ptype in ("Villas", "Apartments", "Commercial"):
        _view(db, user, make_property(type=ptype))
    unseen = make_property(type="Villas")

    result = _check(client, auth_headers(user))
    assert result["reason"] == "new_match"
    assert result["notification"]["related_property_id"] == unseen.id


def test_exposure_is_recorded_whenever_a_person_qualifies(
    client, db, make_user, make_property, auth_headers, variant
):
    # Recorded even when the variant ends up recommending nothing: being in the
    # experiment depends only on qualifying, never on what the model returned.
    variant("control")
    user = make_user()
    for ptype in ("Villas", "Apartments", "Commercial"):
        _view(db, user, make_property(type=ptype))
    _check(client, auth_headers(user))

    exposures = db.scalars(
        select(Event).where(Event.event_name == "experiment_exposed", Event.user_id == user.id)
    ).all()
    assert [e.properties for e in exposures] == [
        {"experiment": "recommender", "variant": "control"}
    ]


def test_marking_read_is_scoped_to_the_owner(client, db, make_user, auth_headers):
    owner, other = make_user(), make_user()
    note = Notification(user_id=owner.id, kind=NotificationKind.WELCOME, title="t", message="m")
    db.add(note)
    db.commit()

    url = f"/notifications/{note.id}/read"
    assert client.post(url, headers=auth_headers(other)).status_code == 404
    assert client.post(url, headers=auth_headers(owner)).status_code == 204

    listed = client.get("/notifications", headers=auth_headers(owner)).json()
    assert listed[0]["is_read"] is True


@pytest.mark.parametrize("name", ["control", "popularity", "hybrid"])
def test_already_viewed_properties_are_never_recommended(
    client, db, make_user, make_property, auth_headers, variant, name
):
    # Regression: a villa the user had opened was "recommended" back to them.
    variant(name)
    user = make_user()
    villa = make_property(type="Villas", age_days=1)
    _view(db, user, villa, 3)

    assert _check(client, auth_headers(user))["reason"] == "no_new_matches"
