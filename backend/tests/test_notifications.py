from app.models import Notification, PropertyView
from app.services.recommendations import analyze_preference


def _view(db, user, prop, times=1):
    for _ in range(times):
        db.add(PropertyView(user_id=user.id, property_id=prop.id))
    db.commit()


def test_preference_needs_enough_views_and_a_clear_favorite(db, make_user, make_property):
    user = make_user()
    villa = make_property(type="Villas")
    flat = make_property(type="Apartments")
    office = make_property(type="Commercial")

    _view(db, user, villa, 2)
    assert analyze_preference(db, user.id) is None  # fewer than 3 views

    _view(db, user, flat, 2)
    _view(db, user, office, 2)
    # 3 types at 1/3 each: below the 40% confidence threshold.
    assert analyze_preference(db, user.id) is None

    _view(db, user, villa, 2)
    preference = analyze_preference(db, user.id)
    assert preference.type == "Villas"
    assert preference.confidence == 0.5


def test_new_user_gets_one_welcome_that_recommends_nothing(
    client, make_user, make_property, auth_headers
):
    headers = auth_headers(make_user(name="Mariam Fathi"))
    make_property(age_days=0)

    first = client.post("/notifications/check-new-properties", headers=headers).json()
    assert first["reason"] == "welcome"
    assert first["notification"]["title"] == "🏠 Welcome to Homi, Mariam!"
    # No history means no signal: the welcome must not point at a property.
    assert first["notification"]["related_property_id"] is None

    second = client.post("/notifications/check-new-properties", headers=headers).json()
    assert second == {"reason": "no_preference_yet", "notification": None}


def test_match_is_notified_only_once(client, db, make_user, make_property, auth_headers):
    user = make_user()
    headers = auth_headers(user)
    viewed = make_property(type="Villas", age_days=30)
    _view(db, user, viewed, 3)
    new_villa = make_property(type="Villas", age_days=1)
    make_property(type="Villas", age_days=20)  # too old to count as new
    make_property(type="Apartments", age_days=0)  # wrong type

    first = client.post("/notifications/check-new-properties", headers=headers).json()
    assert first["reason"] == "new_match"
    assert first["notification"]["related_property_id"] == new_villa.id
    assert first["notification"]["message"] == f"{new_villa.name} just listed in Maadi."

    second = client.post("/notifications/check-new-properties", headers=headers).json()
    assert second["reason"] == "no_new_matches"


def test_marking_read_is_scoped_to_the_owner(client, db, make_user, auth_headers):
    owner, other = make_user(), make_user()
    note = Notification(user_id=owner.id, title="t", message="m")
    db.add(note)
    db.commit()

    url = f"/notifications/{note.id}/read"
    assert client.post(url, headers=auth_headers(other)).status_code == 404
    assert client.post(url, headers=auth_headers(owner)).status_code == 204

    listed = client.get("/notifications", headers=auth_headers(owner)).json()
    assert listed[0]["is_read"] is True


def test_already_viewed_properties_are_not_recommended(
    client, db, make_user, make_property, auth_headers
):
    # Regression: a new villa the user had opened was "recommended" back to them.
    user = make_user()
    new_villa = make_property(type="Villas", age_days=1)
    _view(db, user, new_villa, 3)

    result = client.post("/notifications/check-new-properties", headers=auth_headers(user)).json()
    assert result["reason"] == "no_new_matches"
