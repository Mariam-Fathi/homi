import os

import pytest

from app.config import Settings, get_settings
from app.main import app


def _settings(**overrides: object) -> Settings:
    return Settings(jwt_secret=os.environ["JWT_SECRET"], **overrides)


def test_protected_routes_require_a_token(client):
    assert client.get("/properties").status_code == 401
    assert client.get("/users/me", headers={"Authorization": "Bearer garbage"}).status_code == 401


def test_demo_login_creates_a_fresh_guest_each_time(client):
    first = client.post("/auth/demo").json()
    second = client.post("/auth/demo").json()

    assert first["user"]["is_demo"] is True
    assert first["user"]["id"] != second["user"]["id"]

    me = client.get("/users/me", headers={"Authorization": f"Bearer {first['access_token']}"})
    assert me.json()["id"] == first["user"]["id"]


def test_demo_login_can_be_disabled(client):
    app.dependency_overrides[get_settings] = lambda: _settings(demo_login_enabled=False)
    assert client.post("/auth/demo").status_code == 404


def _phone_login(client, name="Mariam", phone="01001234567", country="EG"):
    return client.post("/auth/phone", json={"name": name, "phone": phone, "country": country})


def test_phone_login_creates_then_reuses_the_account(client):
    first = _phone_login(client)
    assert first.status_code == 200
    user = first.json()["user"]
    assert user["phone"] == "+201001234567"  # stored in international (E.164) form
    assert user["name"] == "Mariam"

    # Same number written differently signs into the same account, and the name
    # isn't overwritten by whoever types the number.
    again = _phone_login(client, name="Someone Else", phone="+20 100 123 4567").json()["user"]
    assert again["id"] == user["id"]
    assert again["name"] == "Mariam"


@pytest.mark.parametrize(
    ("phone", "country"),
    [
        ("0100123456", "EG"),  # one digit short
        ("0161234567", "EG"),  # 016 isn't an Egyptian mobile prefix
        ("0223456789", "EG"),  # valid Cairo landline, but sign-in needs a mobile
        ("+966501234567", "EG"),  # Saudi number while Egypt is selected
        ("not a number", "EG"),
    ],
)
def test_phone_login_rejects_numbers_invalid_for_the_country(client, phone, country):
    assert _phone_login(client, phone=phone, country=country).status_code == 422


def test_phone_login_accepts_other_countries(client):
    saudi = _phone_login(client, phone="0501234567", country="SA").json()["user"]
    assert saudi["phone"] == "+966501234567"


def test_name_is_required_and_trimmed(client):
    assert _phone_login(client, name=" ").status_code == 422
    user = _phone_login(client, name="  Mariam   Fathi ").json()["user"]
    assert user["name"] == "Mariam Fathi"


def test_deleting_the_account_removes_user_data(client, make_user, make_property, auth_headers):
    user = make_user()
    prop = make_property()
    headers = auth_headers(user)
    client.put(f"/favorites/{prop.id}", headers=headers)
    client.post(f"/properties/{prop.id}/views", headers=headers)

    assert client.delete("/users/me", headers=headers).status_code == 204
    # The token now points at a user that no longer exists.
    assert client.get("/users/me", headers=headers).status_code == 401
