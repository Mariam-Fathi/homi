"""A/B test design and analysis, as pre-registered in docs/experimentation.md.

Frequentist, two-sided, fixed sample size: the sample size is computed up front and the
test is analyzed once it's reached. Looking repeatedly and stopping at the first
significant result inflates false positives, so the dashboard shows progress towards
the planned size, not a running verdict.
"""

from dataclasses import dataclass
from math import ceil, sqrt

import numpy as np
import pandas as pd
from scipy import stats
from sqlalchemy import Engine, text


@dataclass(frozen=True)
class ProportionResult:
    control_rate: float
    treatment_rate: float
    control_n: int
    treatment_n: int
    difference: float  # treatment - control, absolute
    ci_low: float
    ci_high: float
    relative_lift: float
    p_value: float

    @property
    def significant(self) -> bool:
        return self.p_value < 0.05


def sample_size_per_group(
    baseline: float, mde: float, alpha: float = 0.05, power: float = 0.8
) -> int:
    """People needed in each group to detect an absolute change of `mde` from
    `baseline` with a two-sided test at level `alpha` and the given power."""
    p1, p2 = baseline, baseline + mde
    pooled = (p1 + p2) / 2
    z_alpha = stats.norm.ppf(1 - alpha / 2)
    z_beta = stats.norm.ppf(power)
    numerator = (
        z_alpha * sqrt(2 * pooled * (1 - pooled)) + z_beta * sqrt(p1 * (1 - p1) + p2 * (1 - p2))
    ) ** 2
    return ceil(numerator / mde**2)


def proportion_test(
    control_successes: int,
    control_n: int,
    treatment_successes: int,
    treatment_n: int,
    alpha: float = 0.05,
) -> ProportionResult:
    """Two-sided z-test for a difference in proportions, with a confidence interval
    for the difference (pooled variance for the test, unpooled for the interval)."""
    p_c = control_successes / control_n
    p_t = treatment_successes / treatment_n
    diff = p_t - p_c

    pooled = (control_successes + treatment_successes) / (control_n + treatment_n)
    se_pooled = sqrt(pooled * (1 - pooled) * (1 / control_n + 1 / treatment_n))
    z = diff / se_pooled if se_pooled > 0 else 0.0
    p_value = 2 * stats.norm.sf(abs(z))

    se = sqrt(p_c * (1 - p_c) / control_n + p_t * (1 - p_t) / treatment_n)
    margin = stats.norm.ppf(1 - alpha / 2) * se
    return ProportionResult(
        control_rate=p_c,
        treatment_rate=p_t,
        control_n=control_n,
        treatment_n=treatment_n,
        difference=diff,
        ci_low=diff - margin,
        ci_high=diff + margin,
        relative_lift=diff / p_c if p_c else float("nan"),
        p_value=float(p_value),
    )


def sample_ratio_mismatch(counts: dict[str, int], shares: dict[str, float]) -> float:
    """Chi-square p-value that the observed group sizes match the configured split.
    A tiny p-value (< 0.001) means assignment or exposure logging is broken, and the
    experiment's results shouldn't be trusted."""
    observed = np.array([counts.get(v, 0) for v in shares])
    expected = np.array([shares[v] for v in shares]) * observed.sum()
    return float(stats.chisquare(observed, expected).pvalue)


def rejection_rate(
    control_rate: float,
    treatment_rate: float,
    n_per_group: int,
    runs: int = 2000,
    seed: int = 0,
) -> float:
    """Share of simulated experiments that come out significant. With equal rates
    (an A/A test) this is the false-positive rate and should be about 5%; with a real
    difference it's the power."""
    rng = np.random.default_rng(seed)
    control = rng.binomial(n_per_group, control_rate, size=runs)
    treatment = rng.binomial(n_per_group, treatment_rate, size=runs)
    significant = [
        proportion_test(c, n_per_group, t, n_per_group).significant
        for c, t in zip(control, treatment, strict=True)
    ]
    return float(np.mean(significant))


# --- reading an experiment from the event data ------------------------------------------

EXPOSED_USERS = """
WITH exposures AS (
    SELECT user_id, properties ->> 'variant' AS variant, occurred_at
    FROM events
    WHERE event_name = 'experiment_exposed'
      AND properties ->> 'experiment' = :experiment
      AND user_id IS NOT NULL
),
per_user AS (
    SELECT user_id,
           min(occurred_at) AS first_exposed_at,
           count(DISTINCT variant) AS variants_seen,
           min(variant) AS variant
    FROM exposures
    GROUP BY user_id
)
SELECT
    u.user_id,
    u.variant,
    u.variants_seen,
    u.first_exposed_at,
    EXISTS (SELECT 1 FROM events e WHERE e.user_id = u.user_id
            AND e.event_name = 'viewing_requested'
            AND e.occurred_at >= u.first_exposed_at) AS requested,
    EXISTS (SELECT 1 FROM events e WHERE e.user_id = u.user_id
            AND e.event_name = 'viewing_form_validation_failed'
            AND e.occurred_at >= u.first_exposed_at) AS validation_failed,
    EXISTS (SELECT 1 FROM events e WHERE e.user_id = u.user_id
            AND e.event_name = 'viewing_form_abandoned'
            AND e.occurred_at >= u.first_exposed_at) AS abandoned
FROM per_user u
"""


def load_exposed_users(engine: Engine, experiment: str) -> pd.DataFrame:
    """One row per exposed person (the unit of randomization), with their variant and
    what they did after their first exposure."""
    return pd.read_sql(text(EXPOSED_USERS), engine, params={"experiment": experiment})


@dataclass(frozen=True)
class ExperimentReport:
    exposed: dict[str, int]
    conflicting_users: int
    srm_p_value: float
    primary: ProportionResult  # viewing request after exposure
    guardrail_validation: ProportionResult  # phone validation failed
    guardrail_abandonment: ProportionResult  # form abandoned


def analyze(users: pd.DataFrame, shares: dict[str, float]) -> ExperimentReport:
    conflicting = int((users["variants_seen"] > 1).sum())
    clean = users[users["variants_seen"] == 1]
    counts = clean["variant"].value_counts().to_dict()

    def test(column: str) -> ProportionResult:
        c = clean[clean["variant"] == "control"][column]
        t = clean[clean["variant"] == "treatment"][column]
        return proportion_test(int(c.sum()), len(c), int(t.sum()), len(t))

    return ExperimentReport(
        exposed={v: int(counts.get(v, 0)) for v in shares},
        conflicting_users=conflicting,
        srm_p_value=sample_ratio_mismatch(counts, shares),
        primary=test("requested"),
        guardrail_validation=test("validation_failed"),
        guardrail_abandonment=test("abandoned"),
    )
