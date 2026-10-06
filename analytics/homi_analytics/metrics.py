"""Funnel metrics and diagnosis, as defined in docs/funnel-analytics.md."""

import pandas as pd
from sqlalchemy import Engine

# A stage must be at least this far below the overall rate to be called a problem.
PROBLEM_THRESHOLD = 0.7

STAGES = {
    "visibility": "impressions per listing",
    "interest": "click-through rate",
    "conversion": "view-to-request rate",
}


def load_funnel(engine: Engine) -> pd.DataFrame:
    """The session × property funnel joined with session attributes."""
    return pd.read_sql(
        """
        SELECT f.*, s.platform, s.is_guest, s.person_id, s.day
        FROM analytics.property_funnel f
        JOIN analytics.sessions s USING (session_id)
        """,
        engine,
    )


def load_catalog(engine: Engine) -> pd.DataFrame:
    return pd.read_sql("SELECT id AS property_id, type AS property_type FROM properties", engine)


def load_searches(engine: Engine) -> pd.DataFrame:
    return pd.read_sql("SELECT * FROM analytics.searches", engine)


def load_sessions(engine: Engine) -> pd.DataFrame:
    return pd.read_sql("SELECT * FROM analytics.sessions", engine)


def _rate(numerator: pd.Series, denominator: pd.Series) -> pd.Series | float:
    return numerator / denominator.where(denominator > 0)


def stage_counts(funnel: pd.DataFrame, by: str | None = None) -> pd.DataFrame:
    """Counts at every step, and the conversion rates between them."""
    flags = ["impressed", "clicked", "viewed", "favorited", "form_opened", "requested"]
    grouped = funnel.groupby(by)[flags] if by else funnel[flags]
    counts = grouped.sum() if by else grouped.sum().to_frame("all").T
    counts = counts.astype(int)
    counts["ctr"] = _rate(counts["clicked"], counts["impressed"])
    counts["save_rate"] = _rate(counts["favorited"], counts["viewed"])
    counts["form_open_rate"] = _rate(counts["form_opened"], counts["viewed"])
    counts["form_completion"] = _rate(counts["requested"], counts["form_opened"])
    counts["view_to_request"] = _rate(counts["requested"], counts["viewed"])
    return counts


def diagnose_property_types(funnel: pd.DataFrame, catalog: pd.DataFrame) -> pd.DataFrame:
    """For each property type, compare visibility, interest and conversion with all
    types combined, and name the stage where it falls furthest behind."""
    by_type = stage_counts(funnel, by="property_type")
    listings = catalog.groupby("property_type").size()
    by_type["listings"] = listings.reindex(by_type.index).fillna(0).astype(int)
    by_type["impressions_per_listing"] = _rate(by_type["impressed"], by_type["listings"])

    overall = stage_counts(funnel).iloc[0]
    overall_exposure = by_type["impressed"].sum() / max(by_type["listings"].sum(), 1)

    ratios = pd.DataFrame(
        {
            "visibility": by_type["impressions_per_listing"] / overall_exposure,
            "interest": by_type["ctr"] / overall["ctr"],
            "conversion": by_type["view_to_request"] / overall["view_to_request"],
        }
    )
    weakest = ratios.idxmin(axis=1)
    weakest_ratio = ratios.min(axis=1)

    result = by_type.join(ratios.add_suffix("_vs_overall"))
    result["problem"] = weakest.where(weakest_ratio < PROBLEM_THRESHOLD, "healthy")
    result["weakest_ratio"] = weakest_ratio
    return result.sort_values("weakest_ratio")


def form_friction(funnel: pd.DataFrame) -> pd.DataFrame:
    """The viewing form, split by guests (who type their number) vs. phone users."""
    opened = funnel[funnel["form_opened"]]
    summary = opened.groupby("is_guest").agg(
        forms_opened=("form_opened", "size"),
        validation_failure_rate=("form_validation_failed", "mean"),
        abandonment_rate=("form_abandoned", "mean"),
        completion_rate=("requested", "mean"),
    )
    summary.index = summary.index.map({True: "guest", False: "phone user"})
    return summary


def dead_end_queries(searches: pd.DataFrame, min_searches: int = 5) -> pd.DataFrame:
    """Queries ranked by how often they found nothing."""
    summary = searches.groupby("query").agg(
        searches=("event_id", "size"),
        dead_end_rate=("dead_end", "mean"),
        continued_rate=("followed_by_view", "mean"),
    )
    summary = summary[summary["searches"] >= min_searches]
    return summary.sort_values(["dead_end_rate", "searches"], ascending=False)


def headline(sessions: pd.DataFrame, funnel: pd.DataFrame) -> dict[str, float]:
    overall = stage_counts(funnel).iloc[0]
    return {
        "people": sessions["person_id"].nunique(),
        "sessions": len(sessions),
        "session_conversion": sessions["converted"].mean() if len(sessions) else 0.0,
        "ctr": overall["ctr"],
        "view_to_request": overall["view_to_request"],
        "viewing_requests": int(overall["requested"]),
    }
