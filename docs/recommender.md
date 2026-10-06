# Recommender (Phase 5)

Homi sends "homes you might like" notifications. Until now, one hand-written rule chose
them: find the person's most-viewed property type, suggest the newest listing of that
type. This phase asks whether a model learned from behavior does better, measured
first **offline** on historical data and then **online** in an A/B test.

## What changes in the product

The rule only considered listings added in the last 7 days. With a realistic catalog
that leaves a handful of candidates, so any two methods would mostly suggest the same
listing and couldn't be told apart. Both the rule and the models now choose among **all
listings the person hasn't viewed or been recommended**. The rule still prefers the
newest listing of the favorite type, so its spirit is unchanged; the comparison is
purely about **ranking**.

## The problem the simulator has to model

The earlier simulator chose what people clicked from list position and a few planted
type effects: everyone liked the same things, so there was nothing to personalize. For
this phase each simulated person gets a hidden **taste**:

| Taste | How it's drawn |
|---|---|
| Preferred property type | From the catalog's type mix |
| Preferred city | Cairo, Giza, Alexandria or the coast |
| Budget | Around the typical price of their preferred type |

How well a listing matches someone's taste raises the chance they tap it, request a
viewing, and open a recommendation about it. Tastes are invisible to the models: they
only see behavior (views, favorites, viewing requests). A good model has to infer
taste from that behavior.

Tastes are off by default (`--tastes`), so earlier datasets and case studies stay
exactly reproducible.

## Models

All models score the listings a person hasn't seen and return the top k. They're plain
functions of behavior and the catalog, in `backend/app/recommender.py`, so the API, the
simulator and the offline evaluation all run **the same code**.

| Model | Idea | Needs history? |
|---|---|---|
| `popularity` | The most-interacted-with listings overall | No (the cold-start fallback) |
| `rule_based` | Today's rule: newest listing of the most-viewed type | Yes (≥ 3 views) |
| `content_based` | Build a profile from the features of listings the person engaged with (type, city, price, size, bedrooms); recommend the most similar | Yes (≥ 1 interaction) |
| `item_knn` | "People who engaged with X also engaged with Y" (collaborative filtering) | Yes, plus other people's data |
| `hybrid` | A weighted blend of `content_based` and `item_knn` | Yes |

Interactions are weighted by intent: a viewing request counts more than a favorite,
which counts more than a view.

## Offline evaluation protocol

Decided before looking at any model's results:

- **Split by time**, as in production: models learn from everything before a cutoff
  and are judged on what each person engaged with after it. A random split would leak
  the future into training.
- **Who's evaluated:** people with at least one interaction before the cutoff and at
  least one new listing they engaged with after it.
- **Metrics at k = 5:** hit rate (did any of the 5 match?), precision, recall, NDCG
  (rewards putting the match near the top), and catalog coverage (how many different
  listings get recommended at all).
- **Uncertainty:** differences against `rule_based` with 95% bootstrap confidence
  intervals over people.
- **Tuning** (e.g. the hybrid's blend weight) uses a separate earlier validation
  window, never the test window.

## Online test (pre-registration)

Written after the offline results and before the online test ran; not changed
afterwards.

**Why three arms.** Offline, `popularity` and `hybrid` both beat the rule and couldn't
be told apart from each other (NDCG@5 difference +0.004, 95% CI −0.013 to +0.021), so
both go online rather than picking one by judgment.

| | |
|---|---|
| Experiment | `recommender` (`backend/app/experiments.py`) |
| Variants | `control` (rule), `popularity`, `hybrid`; a third of people each |
| Who's in it | People with at least 3 property views, when a recommendation is due. Exposure is recorded at that moment, whatever the variant then returns, so every arm contains the same kind of person |
| **Primary metric** | Opened a recommended listing after first exposure (per person) |
| Guardrail | Sent any viewing request after first exposure: must not get significantly worse |
| Comparisons | Each challenger vs. control, at α = 0.025 (Bonferroni: 0.05 ÷ 2 comparisons) |

**Sample size.** From a pilot (6,000 people, 656 exposed): 10.9% of people get exposed,
and 8.0% of control opened a recommendation. To detect +4 points (8% → 12%) at
α = 0.025 with 80% power: **1,069 per arm, 3,207 exposed, about 29,400 people**.
Checked by simulation: 81.6% power, 2.7% false positives per comparison.

**Decision rule.**

1. Sample ratio check first (p < 0.001 → stop, logging is broken).
2. Analyze once, when every arm has 1,069 people.
3. A challenger **beats the rule** if its primary metric is higher at p < 0.025 and the
   guardrail isn't significantly worse.
4. If both beat the rule: ship the one with the higher open rate, **unless** the
   difference between them has a 95% CI that includes zero, in which case ship
   `hybrid`, for its catalog coverage (offline: 96% of listings vs. 4.5%). This
   tie-break is decided now, before seeing the data.
5. If neither beats the rule, keep the rule.

Results: [case study](case-study-recommender.md).
