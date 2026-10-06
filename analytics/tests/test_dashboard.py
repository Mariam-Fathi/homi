"""The dashboard renders end to end (headless, via Streamlit's test harness)."""

from datetime import UTC, datetime
from pathlib import Path

import pytest
import streamlit as st
from streamlit.testing.v1 import AppTest

from homi_analytics.simulator import SimConfig, simulate
from tests.conftest import truncate

DASHBOARD = str(Path(__file__).resolve().parents[1] / "dashboard.py")


def _render() -> AppTest:
    # The dashboard caches its data; tests run in one process, so start fresh each time.
    st.cache_data.clear()
    st.cache_resource.clear()
    return AppTest.from_file(DASHBOARD, default_timeout=120).run()


def test_empty_database_shows_how_to_get_data(clean):
    app = _render()
    assert not app.exception
    assert "No events yet" in app.warning[0].value


@pytest.fixture
def small_experiment(engine):
    from app.seed.__main__ import seed

    seed(reset=True)
    simulate(
        engine,
        SimConfig(users=1500, seed=2, experiment=True, end=datetime(2026, 10, 5, tzinfo=UTC)),
    )
    yield
    truncate(engine)


def test_experiment_results_stay_hidden_below_the_planned_size(small_experiment):
    app = _render()
    assert not app.exception
    # 1,500 people expose far fewer than the 373 per arm the plan requires.
    assert any("hidden until the planned sample size" in box.value for box in app.info)
    assert not app.success  # no verdict yet
