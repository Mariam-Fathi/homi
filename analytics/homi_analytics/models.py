"""Builds the `analytics` schema: SQL views over the events table.

    python -m homi_analytics.models   # (re)create the views in $ANALYTICS_DATABASE_URL

Views are recreated from the files in sql/, in name order, so the data model is
versioned with the code and can be rebuilt at any time.
"""

from importlib import resources

from sqlalchemy import Engine, text

from homi_analytics.db import get_engine


def apply_models(engine: Engine) -> list[str]:
    files = sorted(
        (f for f in resources.files("homi_analytics.sql").iterdir() if f.name.endswith(".sql")),
        key=lambda f: f.name,
    )
    with engine.begin() as conn:
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS analytics"))
        for sql_file in files:
            conn.execute(text(sql_file.read_text(encoding="utf-8")))
    return [f.name for f in files]


if __name__ == "__main__":
    applied = apply_models(get_engine())
    print("Applied:", ", ".join(applied))
