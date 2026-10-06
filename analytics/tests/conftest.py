import os
from collections.abc import Iterator
from pathlib import Path

import pytest

ADMIN_URL = os.environ.get(
    "ANALYTICS_ADMIN_URL", "postgresql+psycopg://homi:homi@localhost:5433/homi"
)
TEST_URL = os.environ.get(
    "ANALYTICS_TEST_DATABASE_URL",
    "postgresql+psycopg://homi:homi@localhost:5433/homi_analytics_test",
)
# The backend's modules read DATABASE_URL when imported, so set it first.
os.environ["DATABASE_URL"] = TEST_URL
os.environ["ANALYTICS_DATABASE_URL"] = TEST_URL

from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from sqlalchemy import Engine, create_engine, text  # noqa: E402

from homi_analytics.models import apply_models  # noqa: E402

BACKEND = Path(__file__).resolve().parents[2] / "backend"


@pytest.fixture(scope="session")
def engine() -> Iterator[Engine]:
    """A fresh database with the backend's real schema and the analytics views."""
    db_name = TEST_URL.rsplit("/", 1)[1]
    admin = create_engine(ADMIN_URL, isolation_level="AUTOCOMMIT")
    with admin.connect() as conn:
        conn.execute(text(f'DROP DATABASE IF EXISTS "{db_name}" WITH (FORCE)'))
        conn.execute(text(f'CREATE DATABASE "{db_name}"'))
    admin.dispose()

    cfg = Config(str(BACKEND / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND / "alembic"))
    command.upgrade(cfg, "head")

    test_engine = create_engine(TEST_URL)
    apply_models(test_engine)
    yield test_engine
    test_engine.dispose()


def truncate(engine: Engine) -> None:
    with engine.begin() as conn:
        conn.execute(text("TRUNCATE events, users, properties, agents CASCADE"))


@pytest.fixture
def clean(engine: Engine) -> Iterator[Engine]:
    """An empty database, whatever ran before."""
    truncate(engine)
    yield engine
    truncate(engine)
