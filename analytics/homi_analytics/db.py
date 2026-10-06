import os

from sqlalchemy import Engine, create_engine

# The simulator's database by default, so analysis never runs on real usage by accident.
DEFAULT_URL = "postgresql+psycopg://homi:homi@localhost:5433/homi_sim"


def database_url() -> str:
    return os.environ.get("ANALYTICS_DATABASE_URL", DEFAULT_URL)


def get_engine(url: str | None = None) -> Engine:
    return create_engine(url or database_url(), pool_pre_ping=True)
