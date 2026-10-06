"""A/B test statistics, and the experiment pipeline on simulated data."""

from datetime import UTC, datetime

import pandas as pd
import pytest

from app.experiments import EXPERIMENTS
from homi_analytics.experiments import (
    analyze,
    load_exposed_users,
    proportion_test,
    rejection_rate,
    sample_ratio_mismatch,
    sample_size_per_group,
)
from homi_analytics.simulator import EXPERIMENT_KEY, SimConfig, simulate
from tests.conftest import truncate

# --- statistics ---------------------------------------------------------------------------


def test_sample_size_matches_the_textbook_formula():
    # 50% -> 60% at 5% two-sided and 80% power: the standard answer is 388 per group.
    assert sample_size_per_group(0.5, 0.10) == 388
    # Smaller effects need far more people (roughly 1 / effect^2).
    assert sample_size_per_group(0.5, 0.05) > 3.5 * sample_size_per_group(0.5, 0.10)


def test_proportion_test_on_a_known_example():
    result = proportion_test(60, 100, 75, 100)
    assert result.difference == pytest.approx(0.15)
    # Same as a chi-square test on the 2x2 table: p = 0.0235.
    assert result.p_value == pytest.approx(0.0235, abs=0.0005)
    assert result.ci_low < 0.15 < result.ci_high
    assert result.relative_lift == pytest.approx(0.25)


def test_false_positive_rate_is_five_percent():
    # An A/A test: no real difference. 3,000 runs give a standard error of 0.4 points.
    assert rejection_rate(0.56, 0.56, 373, runs=3000, seed=1) == pytest.approx(0.05, abs=0.015)


def test_planned_sample_size_gives_planned_power():
    n = sample_size_per_group(0.56, 0.10)
    assert rejection_rate(0.56, 0.66, n, runs=3000, seed=2) == pytest.approx(0.80, abs=0.03)


def test_sample_ratio_mismatch_is_detected():
    shares = {"control": 0.5, "treatment": 0.5}
    assert sample_ratio_mismatch({"control": 398, "treatment": 420}, shares) > 0.05
    assert sample_ratio_mismatch({"control": 450, "treatment": 550}, shares) < 0.01


def test_people_seeing_both_variants_are_excluded_and_counted():
    users = pd.DataFrame(
        {
            "variant": ["control", "treatment", "control"],
            "variants_seen": [1, 1, 2],
            "requested": [True, True, False],
            "validation_failed": [False, False, True],
            "abandoned": [False, False, True],
        }
    )
    report = analyze(users, {"control": 0.5, "treatment": 0.5})
    assert report.conflicting_users == 1
    assert report.exposed == {"control": 1, "treatment": 1}


# --- end to end ------------------------------------------------------------------------------


@pytest.fixture(scope="module")
def experiment(engine):
    from app.seed.__main__ import seed

    seed(reset=True)
    simulate(
        engine,
        SimConfig(users=4000, seed=5, experiment=True, end=datetime(2026, 10, 5, tzinfo=UTC)),
    )
    users = load_exposed_users(engine, EXPERIMENT_KEY)
    guests = pd.read_sql("SELECT id AS user_id, is_demo FROM users", engine)
    yield users.merge(guests, on="user_id")
    truncate(engine)


def test_only_people_who_type_their_number_are_exposed(experiment):
    # Phone users' numbers are pre-filled, so the variant can't affect them.
    assert experiment["is_demo"].all()


def test_assignment_and_exposure_are_consistent(experiment):
    report = analyze(experiment, EXPERIMENTS[EXPERIMENT_KEY].variants)
    assert report.conflicting_users == 0
    assert report.srm_p_value > 0.001


def test_the_planted_effect_shows_up_in_the_guardrail(experiment):
    # Failures drop from 45% to 18% per form: large enough to see at this size.
    report = analyze(experiment, EXPERIMENTS[EXPERIMENT_KEY].variants)
    validation = report.result("validation_failed")
    assert validation.difference < -0.15
    assert validation.significant


def test_several_challengers_are_judged_at_a_corrected_level():
    users = pd.DataFrame(
        {
            "variant": ["control"] * 100 + ["a"] * 100 + ["b"] * 100,
            "variants_seen": [1] * 300,
            "requested": [True] * 50
            + [False] * 50
            + [True] * 64
            + [False] * 36
            + [True] * 50
            + [False] * 50,
        }
    )
    report = analyze(users, {"control": 1 / 3, "a": 1 / 3, "b": 1 / 3}, metrics=("requested",))
    assert report.alpha == pytest.approx(0.025)  # Bonferroni: two comparisons
    a = report.result("requested", "a")
    # p is about 0.047: significant on its own, but not after correcting for two looks.
    assert 0.025 < a.p_value < 0.05
    assert not a.significant
