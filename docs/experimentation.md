# Experimentation (Phase 4)

The [funnel case study](case-study-funnel.md) found that guests fail phone validation
in the viewing form far more often than signed-in users, and suggested fixes. A
diagnosis says *where* a problem is; only an experiment shows whether a fix *works*.

## How experiments work in Homi

| Piece | Where | What it does |
|---|---|---|
| Definitions | `backend/app/experiments.py` | Each experiment: key, variants, traffic shares |
| Assignment | same file, `GET /experiments/assignments` | variant = hash(experiment key + user id). Sticky across sessions and devices, no assignment table, independent across experiments |
| Exposure | app event `experiment_exposed` | Logged only when the variant actually changes what the person sees |
| Analysis | `analytics/homi_analytics/experiments.py` | Sample size, z-test with confidence interval, sample-ratio-mismatch check, guardrails |

**Assigned ≠ exposed.** Everyone is assigned a variant, but most people never reach
the viewing form. Analyzing everyone would dilute the effect with people the change
couldn't affect, so the analysis includes only people who were exposed: here, those
who opened the form **without** a pre-filled number (guests). Phone users' numbers are
pre-filled, so nothing changes for them and they're never exposed.

## Pre-registration: `phone_autoformat`

Written before the experiment ran, and not changed afterwards.

**Hypothesis.** Formatting the phone number as it's typed, and showing an example
number for the selected country (for Egypt, "010 01234567"), reduces validation
failures and so increases the share of guests who complete a viewing request.

**Variants.** `control`: today's form. `treatment`: as-you-type formatting plus the
example. 50/50 split.

**Who's in it.** People who open the viewing form with an empty phone field (guests).

**Primary metric.** Share of exposed people who send a viewing request after their
first exposure. The person is the unit of analysis, matching the unit of assignment.

**Guardrails** (must not get worse): phone validation failures, form abandonment.

**Sample size.**

| Input | Value | Source |
|---|---|---|
| Baseline (control) rate | 56% | Pilot: 127 exposed people |
| Minimum detectable effect | +10 percentage points | Smallest change worth building for |
| Significance level | 5%, two-sided | |
| Power | 80% | |
| **Needed** | **373 per group, 746 total** | `sample_size_per_group(0.56, 0.10)` |

Only about 6.3% of people get exposed (guests who open the form), so 746 exposed people
means about **11,750 people**. At 2,000 new people a month, that's roughly six months.
That trade-off is real: the options are waiting, accepting a larger detectable effect,
or exposing more people. For this study, the simulator generates that traffic within
28 days.

**Validated before use.** In 4,000 simulated experiments at this sample size, the test
flagged a difference that didn't exist 4.7% of the time (target: 5%), and detected a
real +10-point effect 79.5% of the time (target: 80%). These checks run in CI.

**Decision rule.**

1. **Check the sample ratio first.** If the group sizes differ from 50/50 with
   p < 0.001, assignment or exposure logging is broken: stop and fix, and don't
   interpret the results.
2. Analyze **once**, when both groups reach 373 people. No early stopping: checking
   repeatedly and stopping at the first significant result inflates false positives.
3. **Ship** if the primary metric improves with p < 0.05 and neither guardrail gets
   significantly worse. Otherwise, keep the current form.

## What the simulator plants

So that the result can be checked against the truth: in the treatment, guests' phone
validation failures drop from 45% to 18%; nothing else changes. Results:
[experiment case study](case-study-experiment.md).
