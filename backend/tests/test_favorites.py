def test_favorites_are_idempotent_and_per_user(client, make_user, make_property, auth_headers):
    alice, bob = make_user(), make_user()
    prop = make_property()

    for _ in range(2):  # saving twice is not an error
        assert client.put(f"/favorites/{prop.id}", headers=auth_headers(alice)).status_code == 204

    assert client.get("/favorites/ids", headers=auth_headers(alice)).json() == [prop.id]
    assert client.get("/favorites/ids", headers=auth_headers(bob)).json() == []

    saved = client.get("/favorites", headers=auth_headers(alice)).json()
    assert [p["id"] for p in saved] == [prop.id]

    for _ in range(2):  # removing twice is not an error
        response = client.delete(f"/favorites/{prop.id}", headers=auth_headers(alice))
        assert response.status_code == 204
    assert client.get("/favorites/ids", headers=auth_headers(alice)).json() == []


def test_cannot_favorite_a_missing_property(client, make_user, auth_headers):
    response = client.put("/favorites/missing", headers=auth_headers(make_user()))
    assert response.status_code == 404
