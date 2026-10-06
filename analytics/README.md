# Homi analytics

Funnel metrics, diagnosis, a user simulator and a dashboard on top of the events
defined in the [tracking plan](../docs/tracking-plan.md). Background and definitions:
[docs/funnel-analytics.md](../docs/funnel-analytics.md). Findings:
[docs/case-study-funnel.md](../docs/case-study-funnel.md).

| Part | File |
|---|---|
| Data model (SQL views in an `analytics` schema) | `homi_analytics/sql/` |
| Metrics and diagnosis | `homi_analytics/metrics.py` |
| User simulator with planted problems | `homi_analytics/simulator.py` |
| Dashboard | `dashboard.py` |
| Tests, including "the analysis finds every planted problem" | `tests/` |

## Setup

Needs the Docker database from the repo root (`docker compose up -d --wait`).

```bash
python -m venv .venv
```
```bash
.venv/Scripts/pip install -e ../backend -e ".[dev]"
```

(On macOS/Linux use `.venv/bin/pip`.) The backend is installed too, so the simulator
writes rows with the app's real models.

## Simulated data

Simulated usage goes into its own database, `homi_sim`, created on the first start of
the database container. It needs the app's schema and property catalog once:

```bash
docker compose exec -e DATABASE_URL=postgresql+psycopg://homi:homi@db:5432/homi_sim api alembic upgrade head
```
```bash
docker compose exec -e DATABASE_URL=postgresql+psycopg://homi:homi@db:5432/homi_sim api python -m app.seed --reset
```

Then generate usage (this exact command reproduces the case study's numbers):

```bash
python -m homi_analytics.simulator --users 2000 --days 28 --seed 7 --end 2026-10-05 --reset
```

Every simulated row is labeled `app_version = "simulator"`; `--reset` removes earlier
simulated data first.

## Dashboard

```bash
streamlit run dashboard.py
```

Opens on http://localhost:8501, reachable only from this computer. It reads
`ANALYTICS_DATABASE_URL` (default: `homi_sim`); point it at the main `homi` database to
see real usage.

## Tests

```bash
pytest
```

Builds a fresh `homi_analytics_test` database with the backend's migrations, checks the
SQL views on hand-written events, then simulates 2,500 people and checks the analysis
recovers every planted problem without false alarms.
