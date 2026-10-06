"""End to end: simulated people with hidden tastes -> offline evaluation.

The models only see behavior, never tastes. If they can't beat random here, the
evaluation (or the models) is broken.
"""

from datetime import UTC, datetime

import pytest

from homi_analytics.recommender_eval import run
from homi_analytics.simulator import SimConfig, simulate
from tests.conftest import truncate


@pytest.fixture(scope="module")
def report(engine):
    from app.seed.__main__ import seed

    seed(reset=True, properties=120)
    simulate(
        engine,
        SimConfig(users=8000, days=56, seed=17, tastes=True, end=datetime(2026, 10, 5, tzinfo=UTC)),
    )
    yield run(engine)
    truncate(engine)


def test_enough_people_to_evaluate(report):
    assert report["people_evaluated"] > 100


@pytest.mark.parametrize("model", ["popularity", "content_based", "item_knn", "hybrid"])
def test_learned_models_beat_random(report, model):
    summary = report["summary"]
    assert summary.loc[model, "hit_rate"] > 1.5 * summary.loc["random", "hit_rate"]


def test_the_rule_only_recommends_to_people_with_a_clear_favorite(report):
    # It needs 3+ views with one type at 40%+, so it's silent for most people.
    summary = report["summary"]
    assert summary.loc["rule_based", "people_with_recs"] < 0.5
    assert summary.loc["hybrid", "people_with_recs"] == 1.0


def test_popularity_concentrates_on_few_listings(report):
    summary = report["summary"]
    assert summary.loc["popularity", "catalog_coverage"] < 0.2
    assert summary.loc["hybrid", "catalog_coverage"] > 0.6
