from datetime import date, timedelta

from app.models import UserRole


def _request_body(property_id: str, **overrides: object) -> dict:
    body = {
        "property_id": property_id,
        "preferred_date": (date.today() + timedelta(days=2)).isoformat(),
        "time_slot": "morning",
        "phone": "+20 100 123 4567",
        "message": "Is parking included?",
    }
    body.update(overrides)
    return body


def test_create_and_list_a_request(client, make_user, make_property, auth_headers):
    headers = auth_headers(make_user())
    prop = make_property()

    created = client.post("/viewing-requests", json=_request_body(prop.id), headers=headers)
    assert created.status_code == 201
    assert created.json()["status"] == "requested"
    assert created.json()["property"]["id"] == prop.id

    mine = client.get("/viewing-requests", params={"property_id": prop.id}, headers=headers).json()
    assert [r["id"] for r in mine] == [created.json()["id"]]


def test_only_one_open_request_per_property(client, make_user, make_property, auth_headers):
    headers = auth_headers(make_user())
    prop = make_property()

    first = client.post("/viewing-requests", json=_request_body(prop.id), headers=headers).json()
    duplicate = client.post("/viewing-requests", json=_request_body(prop.id), headers=headers)
    assert duplicate.status_code == 409

    client.post(f"/viewing-requests/{first['id']}/cancel", headers=headers)
    again = client.post("/viewing-requests", json=_request_body(prop.id), headers=headers)
    assert again.status_code == 201


def test_validation(client, make_user, make_property, auth_headers):
    headers = auth_headers(make_user())
    prop = make_property()
    yesterday = (date.today() - timedelta(days=1)).isoformat()

    past = client.post(
        "/viewing-requests", json=_request_body(prop.id, preferred_date=yesterday), headers=headers
    )
    bad_phone = client.post(
        "/viewing-requests", json=_request_body(prop.id, phone="call me maybe"), headers=headers
    )
    missing = client.post("/viewing-requests", json=_request_body("missing"), headers=headers)
    # Landlines are fine as a contact number for a viewing.
    landline = client.post(
        "/viewing-requests", json=_request_body(prop.id, phone="+20 2 2345 6789"), headers=headers
    )
    assert landline.status_code == 201
    assert landline.json()["phone"] == "+20223456789"

    assert past.status_code == 422
    assert bad_phone.status_code == 422
    assert missing.status_code == 404


def test_admin_moves_request_through_pipeline_and_user_is_notified(
    client, make_user, make_property, auth_headers
):
    user, admin = make_user(), make_user(role=UserRole.ADMIN)
    prop = make_property(name="Palm Villa")
    request = client.post(
        "/viewing-requests", json=_request_body(prop.id), headers=auth_headers(user)
    ).json()

    def move(status: str):
        return client.patch(
            f"/admin/viewing-requests/{request['id']}",
            json={"status": status},
            headers=auth_headers(admin),
        )

    # Can't skip straight to completed.
    assert move("completed").status_code == 409
    assert move("contacted").json()["status"] == "contacted"
    assert move("scheduled").json()["status"] == "scheduled"

    notes = client.get("/notifications", headers=auth_headers(user)).json()
    assert [n["title"] for n in notes] == ["📅 Viewing scheduled", "📞 An agent will contact you"]
    assert "Palm Villa" in notes[0]["message"]


def test_regular_users_cannot_use_admin_routes(client, make_user, auth_headers):
    headers = auth_headers(make_user())
    assert client.get("/admin/viewing-requests", headers=headers).status_code == 403


def test_users_cannot_touch_other_users_requests(client, make_user, make_property, auth_headers):
    owner, other = make_user(), make_user()
    prop = make_property()
    request = client.post(
        "/viewing-requests", json=_request_body(prop.id), headers=auth_headers(owner)
    ).json()

    response = client.post(f"/viewing-requests/{request['id']}/cancel", headers=auth_headers(other))
    assert response.status_code == 404
