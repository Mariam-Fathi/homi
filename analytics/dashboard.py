"""Homi funnel dashboard.

    streamlit run dashboard.py

Reads $ANALYTICS_DATABASE_URL (default: the simulator database, homi_sim).
"""

import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from app.experiments import EXPERIMENTS
from homi_analytics import experiments as ab
from homi_analytics import metrics
from homi_analytics.db import get_engine
from homi_analytics.models import apply_models

st.set_page_config(page_title="Homi funnel", layout="wide")

PROBLEM_TEXT = {
    "visibility": "Visibility problem — rarely shown to people",
    "interest": "Interest problem — seen but rarely clicked",
    "conversion": "Conversion problem — opened but rarely requested",
    "healthy": "Healthy",
}


@st.cache_resource
def engine():
    eng = get_engine()
    apply_models(eng)  # keep the views in sync with the code
    return eng


@st.cache_data(ttl=60)
def load() -> dict[str, pd.DataFrame]:
    eng = engine()
    funnel = metrics.load_funnel(eng)
    return {
        "funnel": funnel,
        "catalog": metrics.load_catalog(eng),
        "searches": metrics.load_searches(eng),
        "sessions": metrics.load_sessions(eng),
        "daily": pd.read_sql("SELECT * FROM analytics.daily_kpis", eng),
    }


data = load()
funnel, sessions = data["funnel"], data["sessions"]

st.title("Homi — funnel analytics")
if sessions.empty:
    st.warning("No events yet. Generate data with `python -m homi_analytics.simulator --reset`.")
    st.stop()
if sessions["simulated"].all():
    st.info(
        "Showing **simulated** usage (labeled `simulator`), generated with planted problems "
        "the analysis should rediscover. See docs/funnel-analytics.md."
    )

# --- headline -----------------------------------------------------------------------
head = metrics.headline(sessions, funnel)
cols = st.columns(5)
cols[0].metric("People", f"{head['people']:,}")
cols[1].metric("Sessions", f"{head['sessions']:,}")
cols[2].metric("Viewing requests", f"{head['viewing_requests']:,}")
cols[3].metric("Session conversion", f"{head['session_conversion']:.1%}")
cols[4].metric("Click-through rate", f"{head['ctr']:.1%}")

# --- funnel -------------------------------------------------------------------------
st.subheader("Funnel")
st.caption("Distinct session × property pairs reaching each step.")
overall = metrics.stage_counts(funnel).iloc[0]
steps = ["impressed", "clicked", "viewed", "form_opened", "requested"]
labels = ["Seen in a list", "Card tapped", "Property opened", "Form opened", "Viewing requested"]
fig = go.Figure(
    go.Funnel(y=labels, x=[overall[s] for s in steps], textinfo="value+percent previous")
)
fig.update_layout(height=360, margin=dict(l=10, r=10, t=10, b=10))
st.plotly_chart(fig, width="stretch")
st.caption("Property opened can exceed card tapped: listings are also opened from notifications.")

# --- diagnosis ------------------------------------------------------------------------
st.subheader("Where each property type falls behind")
st.caption(
    f"Each stage is compared with all types combined (1.00 = average). A type is flagged "
    f"when its weakest stage is below {metrics.PROBLEM_THRESHOLD:.2f}."
)
diagnosis = metrics.diagnose_property_types(funnel, data["catalog"])
table = pd.DataFrame(
    {
        "Diagnosis": diagnosis["problem"].map(PROBLEM_TEXT),
        "Visibility": diagnosis["visibility_vs_overall"],
        "Interest": diagnosis["interest_vs_overall"],
        "Conversion": diagnosis["conversion_vs_overall"],
        "Listings": diagnosis["listings"],
        "Impressions": diagnosis["impressed"],
        "CTR": diagnosis["ctr"],
        "View → request": diagnosis["view_to_request"],
    }
)
st.dataframe(
    table.style.format(
        {
            "Visibility": "{:.2f}",
            "Interest": "{:.2f}",
            "Conversion": "{:.2f}",
            "CTR": "{:.1%}",
            "View → request": "{:.1%}",
            "Impressions": "{:,}",
        }
    ).background_gradient(
        subset=["Visibility", "Interest", "Conversion"], cmap="RdYlGn", vmin=0.3, vmax=1.3
    ),
    width="stretch",
)

left, right = st.columns(2)

# --- form friction ----------------------------------------------------------------------
with left:
    st.subheader("Viewing form: guests vs. phone users")
    form = metrics.form_friction(funnel)
    st.dataframe(
        form.style.format(
            {
                "validation_failure_rate": "{:.1%}",
                "abandonment_rate": "{:.1%}",
                "completion_rate": "{:.1%}",
                "forms_opened": "{:,}",
            }
        ),
        width="stretch",
    )
    st.caption("Guests type their phone number in the form; phone users have it pre-filled.")

# --- search -------------------------------------------------------------------------------
with right:
    st.subheader("Searches that find nothing")
    dead = metrics.dead_end_queries(data["searches"]).head(8)
    st.dataframe(
        dead.style.format({"dead_end_rate": "{:.0%}", "continued_rate": "{:.0%}"}),
        width="stretch",
    )
    st.caption(
        "Queries people type that match no listing: candidates for new inventory or synonyms."
    )

# --- trend --------------------------------------------------------------------------------
st.subheader("Daily sessions and conversion")
daily = data["daily"]
trend = go.Figure()
trend.add_bar(x=daily["day"], y=daily["sessions"], name="Sessions")
trend.add_scatter(
    x=daily["day"],
    y=daily["session_conversion"],
    name="Conversion",
    yaxis="y2",
    mode="lines+markers",
)
trend.update_layout(
    height=320,
    margin=dict(l=10, r=10, t=10, b=10),
    yaxis2=dict(overlaying="y", side="right", tickformat=".0%"),
    legend=dict(orientation="h"),
)
st.plotly_chart(trend, width="stretch")

# --- experiments ----------------------------------------------------------------------
# Each experiment's plan comes from its pre-registration (docs/experimentation.md,
# docs/recommender.md): planned size per arm, primary metric, guardrails.
PLANS = {
    "phone_autoformat": {
        "planned": ab.sample_size_per_group(0.56, 0.10),
        "primary": ("requested", "Viewing requested"),
        "guardrails": [
            ("validation_failed", "Phone validation failed"),
            ("abandoned", "Form abandoned"),
        ],
    },
    "recommender": {
        "planned": ab.sample_size_per_group(0.08, 0.04, alpha=0.025),
        "primary": ("opened_recommendation", "Opened a recommended listing"),
        "guardrails": [("requested", "Viewing requested")],
    },
}

st.header("Experiments")
for key, experiment in EXPERIMENTS.items():
    st.subheader(f"`{key}`")
    st.caption(experiment.description)
    plan = PLANS.get(key)
    users = ab.load_exposed_users(engine(), key)
    if plan is None or users.empty:
        st.write("No exposures yet." if plan else "No pre-registered plan.")
        continue

    primary, primary_label = plan["primary"]
    metrics_used = (primary, *(m for m, _ in plan["guardrails"]))
    report = ab.analyze(users, experiment.variants, metrics=metrics_used)
    smallest = min(report.exposed.values())

    cols = st.columns(len(report.exposed) + 1)
    for col, (variant, n) in zip(cols, report.exposed.items(), strict=False):
        col.metric(f"Exposed: {variant}", f"{n:,}", help=f"Planned: {plan['planned']} per arm")
    cols[-1].metric("Sample ratio check", f"p = {report.srm_p_value:.3f}")

    if report.srm_p_value < 0.001 or report.conflicting_users:
        st.error(
            "Assignment or exposure logging looks broken (sample ratio mismatch or people "
            "in both variants). Don't interpret the results until it's fixed."
        )
        continue
    if smallest < plan["planned"]:
        st.progress(
            smallest / plan["planned"],
            text=f"Collecting data: {smallest} of {plan['planned']} per arm",
        )
        st.info(
            "Results are hidden until the planned sample size is reached: checking early "
            "and stopping at the first significant result inflates false positives."
        )
        continue

    level = 1 - report.alpha
    rows = []
    for variant, results in report.results.items():
        for metric, label in [plan["primary"], *plan["guardrails"]]:
            r = results[metric]
            role = "primary" if metric == primary else "guardrail"
            rows.append(
                {
                    "Comparison": f"{variant} vs control",
                    "Metric": f"{label} ({role})",
                    "Control": r.control_rate,
                    "Variant": r.treatment_rate,
                    "Difference (pts)": r.difference * 100,
                    f"{level:.1%} CI (pts)": f"[{r.ci_low * 100:+.1f}, {r.ci_high * 100:+.1f}]",
                    "p-value": r.p_value,
                }
            )
    st.dataframe(
        pd.DataFrame(rows).style.format(
            {
                "Control": "{:.1%}",
                "Variant": "{:.1%}",
                "Difference (pts)": "{:+.1f}",
                "p-value": "{:.2g}",
            }
        ),
        width="stretch",
        hide_index=True,
    )
    if len(report.results) > 1:
        st.caption(
            f"{len(report.results)} challengers, so each comparison is judged at "
            f"p < {report.alpha:.3f} (Bonferroni) to keep the overall false-alarm rate at 5%."
        )

    winners = []
    for variant, results in report.results.items():
        main = results[primary]
        guardrails_ok = all(
            # A guardrail fails if it moves significantly in the harmful direction:
            # down for good outcomes (requests), up for problems (failures, abandonment).
            not (results[m].significant and (results[m].difference < 0) == (m == "requested"))
            for m, _ in plan["guardrails"]
        )
        if main.significant and main.difference > 0 and guardrails_ok:
            winners.append((variant, main))
    if winners:
        names = ", ".join(f"**{v}** ({r.difference * 100:+.1f} pts)" for v, r in winners)
        st.success(f"Beat control on {primary_label.lower()}, with no guardrail worse: {names}.")
    else:
        st.warning("No variant beat control under the pre-registered criteria: keep control.")
