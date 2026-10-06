"""Homi funnel dashboard.

    streamlit run dashboard.py

Reads $ANALYTICS_DATABASE_URL (default: the simulator database, homi_sim).
"""

import pandas as pd
import plotly.graph_objects as go
import streamlit as st

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
