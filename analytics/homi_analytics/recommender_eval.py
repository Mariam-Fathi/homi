"""Offline evaluation of the recommenders in app/recommender.py (protocol in
docs/recommender.md): split by time, train before the cutoff, judge on what each person
engaged with afterwards.

    python -m homi_analytics.recommender_eval   # on $ANALYTICS_DATABASE_URL
"""

from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta

import numpy as np
import pandas as pd
from sqlalchemy import Engine, text

from app.recommender import MODELS, Hybrid, Interaction, Listing, Recommender, city_of
from homi_analytics.db import get_engine

K = 5
TEST_DAYS = 14
EVENT_KINDS = {
    "property_viewed": "view",
    "favorite_added": "favorite",
    "viewing_requested": "request",
}
ALPHAS = [0.0, 0.25, 0.5, 0.75, 1.0]


def load_interactions(engine: Engine) -> list[Interaction]:
    rows = pd.read_sql(
        text("""
            SELECT user_id, properties ->> 'property_id' AS property_id, event_name, occurred_at
            FROM events
            WHERE event_name IN ('property_viewed', 'favorite_added', 'viewing_requested')
              AND user_id IS NOT NULL
            ORDER BY occurred_at
        """),
        engine,
    )
    return [
        Interaction(r.user_id, r.property_id, EVENT_KINDS[r.event_name], r.occurred_at)
        for r in rows.itertuples()
    ]


def load_catalog(engine: Engine) -> list[Listing]:
    rows = pd.read_sql(
        "SELECT id, type, address, price, area, bedrooms, created_at FROM properties ORDER BY id",
        engine,
    )
    return [
        Listing(r.id, r.type, city_of(r.address), r.price, r.area, r.bedrooms, r.created_at)
        for r in rows.itertuples()
    ]


class RandomBaseline(Recommender):
    """Sanity floor: any useful model must beat picking at random."""

    name = "random"
    min_history = 0

    def fit(self, interactions, catalog):
        super().fit(interactions, catalog)
        self.rng = np.random.default_rng(0)
        return self

    def scores(self, history):
        return self.rng.random(len(self.catalog))


@dataclass(frozen=True)
class Split:
    train: list[Interaction]
    test: dict[str, set[str]]  # user -> listings first engaged with after the cutoff
    history: dict[str, list[Interaction]]  # user -> their interactions before the cutoff


def split_by_time(interactions: list[Interaction], cutoff: datetime, end: datetime) -> Split:
    train = [i for i in interactions if i.at < cutoff]
    history: dict[str, list[Interaction]] = defaultdict(list)
    for i in train:
        history[i.user_id].append(i)
    seen = {u: {i.property_id for i in h} for u, h in history.items()}
    test: dict[str, set[str]] = defaultdict(set)
    for i in interactions:
        # Only people with history, and only listings new to them, can be judged.
        if cutoff <= i.at < end and i.user_id in history and i.property_id not in seen[i.user_id]:
            test[i.user_id].add(i.property_id)
    return Split(train, dict(test), dict(history))


def _user_metrics(recs: list[str], relevant: set[str]) -> dict[str, float]:
    hits = [r in relevant for r in recs]
    dcg = sum(1 / np.log2(rank + 2) for rank, hit in enumerate(hits) if hit)
    ideal = sum(1 / np.log2(rank + 2) for rank in range(min(len(relevant), K)))
    return {
        "hit": float(any(hits)),
        "precision": sum(hits) / K,
        "recall": sum(hits) / len(relevant),
        "ndcg": dcg / ideal,
        "recommended": float(bool(recs)),
    }


def evaluate(model: Recommender, split: Split, catalog: list[Listing]) -> pd.DataFrame:
    """Per-person metrics for one model."""
    model.fit(split.train, catalog)
    rows, shown = [], set()
    for user, relevant in split.test.items():
        history = split.history[user]
        recs = model.recommend(history, exclude={i.property_id for i in history}, k=K)
        shown.update(recs)
        rows.append(
            {"user_id": user, "history_size": len(history), **_user_metrics(recs, relevant)}
        )
    frame = pd.DataFrame(rows)
    frame.attrs["coverage"] = len(shown) / len(catalog)
    return frame


def bootstrap_difference(
    a: pd.Series, b: pd.Series, runs: int = 2000, seed: int = 0
) -> tuple[float, float, float]:
    """Mean of (a - b) over the same people, with a 95% bootstrap interval."""
    diff = a.to_numpy() - b.to_numpy()
    rng = np.random.default_rng(seed)
    means = rng.choice(diff, size=(runs, len(diff)), replace=True).mean(axis=1)
    return float(diff.mean()), float(np.percentile(means, 2.5)), float(np.percentile(means, 97.5))


def tune_hybrid(interactions: list[Interaction], catalog: list[Listing], cutoff: datetime) -> float:
    """Choose the blend weight on a validation window before the test cutoff."""
    validation = split_by_time(interactions, cutoff - timedelta(days=TEST_DAYS), cutoff)
    scores = {
        alpha: evaluate(Hybrid(alpha), validation, catalog)["ndcg"].mean() for alpha in ALPHAS
    }
    return max(scores, key=scores.get)


def run(engine: Engine) -> dict:
    interactions = load_interactions(engine)
    catalog = load_catalog(engine)
    end = max(i.at for i in interactions) + timedelta(seconds=1)
    cutoff = end - timedelta(days=TEST_DAYS)

    alpha = tune_hybrid(interactions, catalog, cutoff)
    split = split_by_time(interactions, cutoff, end)
    models: dict[str, Recommender] = {
        "random": RandomBaseline(),
        **{name: cls() for name, cls in MODELS.items() if name != "hybrid"},
        "hybrid": Hybrid(alpha),
    }
    results = {name: evaluate(model, split, catalog) for name, model in models.items()}

    summary = pd.DataFrame(
        {
            name: {
                "hit_rate": r["hit"].mean(),
                "precision": r["precision"].mean(),
                "recall": r["recall"].mean(),
                "ndcg": r["ndcg"].mean(),
                "people_with_recs": r["recommended"].mean(),
                "catalog_coverage": r.attrs["coverage"],
            }
            for name, r in results.items()
        }
    ).T.sort_values("ndcg", ascending=False)

    baseline = results["rule_based"]
    differences = pd.DataFrame(
        {
            name: dict(
                zip(
                    ("ndcg_diff", "ci_low", "ci_high"),
                    bootstrap_difference(r["ndcg"], baseline["ndcg"]),
                    strict=True,
                )
            )
            for name, r in results.items()
            if name != "rule_based"
        }
    ).T.sort_values("ndcg_diff", ascending=False)

    bands = pd.cut(baseline["history_size"], [0, 2, 9, np.inf], labels=["1-2", "3-9", "10+"])
    by_history = pd.DataFrame(
        {
            name: r["ndcg"].groupby(bands.to_numpy(), observed=True).mean()
            for name, r in results.items()
        }
    ).T
    by_history.loc["people"] = bands.value_counts().reindex(by_history.columns)

    return {
        "people_evaluated": len(split.test),
        "train_interactions": len(split.train),
        "hybrid_alpha": alpha,
        "summary": summary,
        "vs_rule_based": differences,
        "ndcg_by_history": by_history,
    }


if __name__ == "__main__":
    report = run(get_engine())
    pd.set_option("display.width", 140)
    print(
        f"people evaluated: {report['people_evaluated']:,}  "
        f"training interactions: {report['train_interactions']:,}  "
        f"hybrid alpha (tuned on validation): {report['hybrid_alpha']}\n"
    )
    print(report["summary"].round(4).to_string(), "\n")
    print("NDCG@5 difference vs rule_based (95% bootstrap CI):")
    print(report["vs_rule_based"].round(4).to_string(), "\n")
    print("NDCG@5 by number of past interactions:")
    print(report["ndcg_by_history"].round(4).to_string())
