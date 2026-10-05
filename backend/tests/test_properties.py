def test_list_filters_searches_and_paginates(client, make_user, make_property, auth_headers):
    headers = auth_headers(make_user())
    make_property(name="Nile Tower", type="Apartments", age_days=3)
    make_property(name="Palm Villa", type="Villas", age_days=2)
    make_property(name="Cedar Villa", type="Villas", age_days=1, address="5 Coast Rd, El Gouna")

    everything = client.get("/properties", headers=headers).json()
    assert everything["total"] == 3
    # Newest first.
    assert [p["name"] for p in everything["items"]] == ["Cedar Villa", "Palm Villa", "Nile Tower"]

    villas = client.get("/properties", params={"type": "Villas"}, headers=headers).json()
    assert {p["name"] for p in villas["items"]} == {"Palm Villa", "Cedar Villa"}

    search = client.get("/properties", params={"q": "gouna"}, headers=headers).json()
    assert [p["name"] for p in search["items"]] == ["Cedar Villa"]

    page = client.get("/properties", params={"limit": 1, "offset": 1}, headers=headers).json()
    assert page["total"] == 3
    assert [p["name"] for p in page["items"]] == ["Palm Villa"]


def test_featured_returns_the_newest_five(client, make_user, make_property, auth_headers):
    headers = auth_headers(make_user())
    for age in range(7):
        make_property(name=f"P{age}", age_days=age)

    featured = client.get("/properties/featured", headers=headers).json()
    assert [p["name"] for p in featured] == ["P0", "P1", "P2", "P3", "P4"]


def test_detail_includes_agent_reviews_and_gallery(client, make_user, make_property, auth_headers):
    headers = auth_headers(make_user())
    prop = make_property()

    detail = client.get(f"/properties/{prop.id}", headers=headers).json()
    assert detail["agent"]["name"] == "Agent"
    assert detail["reviews"] == [] and detail["review_count"] == 0
    assert detail["facilities"] == ["Gym"]

    assert client.get("/properties/missing", headers=headers).status_code == 404


def test_recording_a_view(client, make_user, make_property, auth_headers):
    headers = auth_headers(make_user())
    prop = make_property()
    assert client.post(f"/properties/{prop.id}/views", headers=headers).status_code == 204
    assert client.post("/properties/missing/views", headers=headers).status_code == 404
