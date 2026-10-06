from datetime import UTC, datetime, timedelta

import pytest

from app.recommender import (
    MODELS,
    ContentBased,
    Hybrid,
    Interaction,
    ItemKNN,
    Listing,
    Popularity,
    RuleBased,
    city_of,
)

T0 = datetime(2026, 9, 1, tzinfo=UTC)


def listing(lid, ptype, city, price, day):
    return Listing(
        lid, ptype, city, price, area=1500, bedrooms=3, created_at=T0 + timedelta(days=day)
    )


CATALOG = [
    listing("cairo-flat-1", "Apartments", "Cairo", 5_000_000, 1),
    listing("cairo-flat-2", "Apartments", "Cairo", 5_500_000, 2),
    listing("cairo-flat-3", "Apartments", "Cairo", 6_000_000, 3),
    listing("coast-villa-1", "Villas", "Matrouh", 40_000_000, 4),
    listing("coast-villa-2", "Villas", "Matrouh", 45_000_000, 5),
    listing("giza-office", "Commercial", "Giza", 10_000_000, 6),
]


def act(user, pid, kind="view", day=0):
    return Interaction(user, pid, kind, T0 + timedelta(days=10 + day))


def test_city_is_the_last_part_of_the_address():
    assert city_of("12 Nile St, Maadi, Cairo") == "Cairo"


def test_never_recommends_what_was_excluded():
    history = [act("u", "cairo-flat-1"), act("u", "cairo-flat-2"), act("u", "cairo-flat-3")]
    for name, model_cls in MODELS.items():
        model = model_cls().fit(history, CATALOG)
        recs = model.recommend(history, exclude={"cairo-flat-1", "coast-villa-1"}, k=6)
        assert "cairo-flat-1" not in recs and "coast-villa-1" not in recs, name


def test_content_based_recommends_similar_listings():
    history = [act("u", "cairo-flat-1"), act("u", "cairo-flat-2", "favorite")]
    model = ContentBased().fit(history, CATALOG)
    recs = model.recommend(history, exclude={"cairo-flat-1", "cairo-flat-2"}, k=1)
    assert recs == ["cairo-flat-3"]


def test_item_knn_learns_from_other_people():
    # Everyone who engaged with the office also engaged with villa 2.
    others = [act(u, pid) for u in ("a", "b", "c") for pid in ("giza-office", "coast-villa-2")]
    me = [act("me", "giza-office")]
    model = ItemKNN().fit(others + me, CATALOG)
    assert model.recommend(me, exclude={"giza-office"}, k=1) == ["coast-villa-2"]


def test_rule_based_matches_the_original_rule():
    model = RuleBased().fit([], CATALOG)
    two_views = [act("u", "coast-villa-1"), act("u", "coast-villa-2")]
    assert model.recommend(two_views, exclude=set()) == []  # needs 3 views

    villas = [
        act("u", "coast-villa-1"),
        act("u", "coast-villa-2"),
        act("u", "giza-office"),
        act("u", "coast-villa-1"),
    ]
    # Villas are 3 of 4 recent views: recommend villas, newest first.
    assert model.recommend(villas, exclude=set(), k=2) == ["coast-villa-2", "coast-villa-1"]

    mixed = [act("u", p) for p in ("cairo-flat-1", "coast-villa-1", "giza-office")]
    assert model.recommend(mixed, exclude=set()) == []  # no type reaches 40%


def test_popularity_needs_no_history():
    interactions = [act("a", "giza-office"), act("b", "giza-office"), act("c", "cairo-flat-1")]
    model = Popularity().fit(interactions, CATALOG)
    assert model.recommend([], exclude=set(), k=2) == ["giza-office", "cairo-flat-1"]


def test_stronger_signals_count_more():
    # One request outweighs two views.
    history = [
        act("u", "cairo-flat-1"),
        act("u", "cairo-flat-2"),
        act("u", "coast-villa-1", "request"),
    ]
    model = ContentBased().fit(history, CATALOG)
    seen = {i.property_id for i in history}
    assert model.recommend(history, exclude=seen, k=1) == ["coast-villa-2"]


@pytest.mark.parametrize("alpha", [0.0, 1.0])
def test_hybrid_reduces_to_its_parts(alpha):
    interactions = [act(u, pid) for u in ("a", "b") for pid in ("giza-office", "coast-villa-2")]
    history = [act("me", "giza-office")]
    data = interactions + history
    hybrid = Hybrid(alpha=alpha).fit(data, CATALOG)
    part = (ContentBased() if alpha == 1.0 else ItemKNN()).fit(data, CATALOG)
    exclude = {"giza-office"}
    assert hybrid.recommend(history, exclude, k=3) == part.recommend(history, exclude, k=3)


def test_recommendations_are_deterministic():
    history = [act("u", "cairo-flat-1")]
    model = ItemKNN().fit(history, CATALOG)  # all similarities zero: ties everywhere
    assert model.recommend(history, set(), k=6) == model.recommend(history, set(), k=6)
