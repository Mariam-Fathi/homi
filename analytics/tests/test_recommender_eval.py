"""The offline evaluation's own logic: time split and metrics."""

from datetime import UTC, datetime, timedelta

import pytest

from app.recommender import Interaction
from homi_analytics.recommender_eval import (
    K,
    _user_metrics,
    bootstrap_difference,
    split_by_time,
)

T0 = datetime(2026, 9, 1, tzinfo=UTC)
CUTOFF = T0 + timedelta(days=10)
END = T0 + timedelta(days=20)


def act(user, pid, day, kind="view"):
    return Interaction(user, pid, kind, T0 + timedelta(days=day))


def test_split_never_leaks_the_future_into_training():
    data = [act("a", "p1", 1), act("a", "p2", 12), act("b", "p3", 15)]
    split = split_by_time(data, CUTOFF, END)
    assert all(i.at < CUTOFF for i in split.train)
    assert split.test == {"a": {"p2"}}  # b has no history, so can't be judged


def test_only_listings_new_to_the_person_count_as_test_targets():
    # Re-viewing something seen before the cutoff is too easy a target.
    data = [act("a", "p1", 1), act("a", "p1", 12), act("a", "p2", 13)]
    assert split_by_time(data, CUTOFF, END).test == {"a": {"p2"}}


def test_metrics_on_a_known_ranking():
    m = _user_metrics(["x", "hit", "y", "z", "w"], {"hit", "missed"})
    assert m["hit"] == 1.0
    assert m["precision"] == pytest.approx(1 / K)
    assert m["recall"] == pytest.approx(0.5)
    # One hit at rank 2 of an ideal two-hit list: (1/log2 3) / (1 + 1/log2 3).
    assert m["ndcg"] == pytest.approx((1 / 1.58496) / (1 + 1 / 1.58496), abs=1e-4)


def test_no_recommendation_scores_zero():
    assert _user_metrics([], {"p1"}) == {
        "hit": 0.0,
        "precision": 0.0,
        "recall": 0.0,
        "ndcg": 0.0,
        "recommended": 0.0,
    }


def test_bootstrap_interval_contains_the_mean_difference():
    import pandas as pd

    a = pd.Series([0.3, 0.5, 0.4, 0.6] * 25)
    b = pd.Series([0.2, 0.5, 0.3, 0.5] * 25)
    mean, low, high = bootstrap_difference(a, b)
    assert mean == pytest.approx(0.075)
    assert low <= mean <= high
