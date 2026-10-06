"""End to end: simulate usage with planted problems, then check the analysis finds them.

This is the core test of the whole analytics pipeline: events in the real schema →
SQL data model → metrics → diagnosis. If it can't recover effects we planted on
purpose, it can't be trusted on real data either.
"""

from datetime import UTC, datetime

import pytest

from homi_analytics import metrics
from homi_analytics.simulator import GROUND_TRUTH, SimConfig, simulate
from tests.conftest import truncate


@pytest.fixture(scope="module")
def results(engine):
    from app.seed.__main__ import seed  # uses DATABASE_URL, set in conftest

    seed(reset=True)
    summary = simulate(
        engine, SimConfig(users=2500, days=28, seed=11, end=datetime(2026, 10, 1, tzinfo=UTC))
    )
    funnel = metrics.load_funnel(engine)
    yield {
        "summary": summary,
        "funnel": funnel,
        "diagnosis": metrics.diagnose_property_types(funnel, metrics.load_catalog(engine)),
        "form": metrics.form_friction(funnel),
        "dead_ends": metrics.dead_end_queries(metrics.load_searches(engine)),
        "sessions": metrics.load_sessions(engine),
    }
    truncate(engine)


def test_volume_is_realistic(results):
    assert results["summary"]["users"] == 2500
    assert results["sessions"]["simulated"].all()
    assert len(results["sessions"]) > 3000  # people come back


@pytest.mark.parametrize(
    ("property_type", "problem"),
    [
        (GROUND_TRUTH["visibility_problem"], "visibility"),
        (GROUND_TRUTH["interest_problem"], "interest"),
        (GROUND_TRUTH["conversion_problem"], "conversion"),
    ],
)
def test_planted_funnel_problems_are_diagnosed(results, property_type, problem):
    assert results["diagnosis"].loc[property_type, "problem"] == problem


def test_types_without_a_planted_problem_are_healthy(results):
    planted = {
        GROUND_TRUTH[k] for k in ("visibility_problem", "interest_problem", "conversion_problem")
    }
    others = results["diagnosis"].drop(index=list(planted))
    assert (others["problem"] == "healthy").all(), others[["problem", "weakest_ratio"]]


def test_guest_form_friction_is_found(results):
    form = results["form"]
    assert (
        form.loc["guest", "validation_failure_rate"]
        > 5 * form.loc["phone user", "validation_failure_rate"]
    )
    assert form.loc["guest", "completion_rate"] < form.loc["phone user", "completion_rate"] - 0.15


def test_dead_end_queries_are_found(results):
    dead_ends = results["dead_ends"]
    top = set(dead_ends.index[: len(GROUND_TRUTH["dead_end_queries"])])
    assert top == set(GROUND_TRUTH["dead_end_queries"])
    assert (dead_ends.loc[list(top), "dead_end_rate"] == 1.0).all()


_FINGERPRINT = """
import hashlib
from datetime import UTC, datetime
from homi_analytics.simulator import SimConfig, _Generator, _Listing

catalog = [
    _Listing(f"p{i}", t, f"P{i}", "1 St, Maadi, Cairo")
    for i, t in enumerate(["Villas", "Apartments", "Commercial", "Townhouses"] * 3)
]
gen = _Generator(SimConfig(users=300, seed=3, end=datetime(2026, 10, 1, tzinfo=UTC)), catalog)
for _ in range(300):
    gen.person()
print(hashlib.sha256(repr([(e["event_name"], e["occurred_at"], e["event_id"], e["properties"])
                           for e in gen.events]).encode()).hexdigest())
"""


def test_simulation_is_reproducible_across_processes():
    # Regression: a tie broken by iterating a set of strings depended on Python's
    # per-process hash seed, so the same seed gave different data in different runs.
    import os
    import subprocess
    import sys

    fingerprints = {
        subprocess.run(
            [sys.executable, "-c", _FINGERPRINT],
            env={**os.environ, "PYTHONHASHSEED": hash_seed},
            capture_output=True,
            text=True,
            check=True,
        ).stdout.strip()
        for hash_seed in ("1", "2", "3")
    }
    assert len(fingerprints) == 1
