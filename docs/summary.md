# Homi: project summary

*A one-page overview for reviewers. Details are in the [README](../README.md) and the
three case studies.*

## The problem

A product team can ship features, but can it tell **where users are lost, whether a
fix works, and whether a model is actually better**? Homi is a real-estate app for the
Egyptian market that I rebuilt end to end so I could answer those three questions
with my own data pipeline, statistics and models, and check the answers against a
known truth.

## What I built

- **Mobile app** (React Native, TypeScript): browse listings, save favorites, sign in
  by phone with per-country validation, and request a viewing, which moves through an
  agent pipeline with notifications.
- **Backend** (Python, FastAPI, PostgreSQL): authentication, business rules enforced
  in one place, migrations, and an event-ingestion API.
- **Event tracking**: a written tracking plan of 21 events; an offline-safe client
  queue; server-side recording of outcomes inside the same database transaction; a
  contract test that keeps app and server in sync.
- **Analytics**: a SQL data model of sessions and funnel steps, a segment diagnosis,
  and a Streamlit dashboard.
- **Experimentation**: deterministic hash-based assignment, exposure logging,
  pre-registered sample sizes and decision rules, sample-ratio checks.
- **Recommender**: five models (rule, popularity, content-based, item-kNN, hybrid),
  time-split offline evaluation with bootstrap confidence intervals, a three-arm
  online test.
- **A user simulator** that plants known problems and effects, so every analysis is
  validated against ground truth. Users are simulated and labeled as such throughout.
- **Engineering**: 158 automated tests and a Docker end-to-end test, run in CI on
  every pull request.

## Three findings

**1. The funnel leaks in different places for different products.**
Of 3,345 sessions, 10.6% ended in a viewing request. Comparing each property type's
stages with the average showed three distinct problems: villas lose people at
conversion (0.23× average), commercial units at interest (0.33×), townhouses at
visibility (0.38×). Commercial's problem is invisible at the last step, where it looks
*better* than average (1.39×), because only already-interested people open it. Guests
failed phone validation 35 times as often as signed-in users. The diagnosis recovered
every planted problem across six random seeds, with no false alarms.
[Case study 1](case-study-funnel.md)

**2. A small UX fix, tested properly, raised conversion by 9 points.**
Formatting the phone number as guests type it raised viewing requests from 61.8% to
71.0% (+9.1 points, 95% CI +2.7 to +15.6, p = 0.006). The sample size, metric and
decision rule were fixed in advance; simulation confirmed the test's false-positive
rate (4.7%) and power (79.5%) before it ran. Only 6.3% of users ever see the change,
so the test needed about six months of traffic: a real planning constraint.
[Case study 2](case-study-experiment.md)

**3. The best model offline was the worst online.**
Offline, popularity scored highest (NDCG@5 0.078) while recommending from only 4.5%
of the catalog. Online, it cut recommendation opens by 43% (9.2% → 5.2%, p = 0.0002).
The hybrid model gained +1.3 points, not significant, so the pre-registered rule kept
the existing one. The simulation's truth showed hybrid's real gain was +2.8 points,
smaller than the test was sized for: a type II error, and the reason the next step is
a larger test.
[Case study 3](case-study-recommender.md)

## Methods

Event-data modeling in SQL · funnel and segment analysis · power analysis and sample
size planning · two-proportion z-tests and confidence intervals · Bonferroni
correction · sample-ratio-mismatch checks · validating tests by simulation
(false-positive rate, power) · recommender systems (content-based, item-kNN
collaborative filtering, hybrid) · NDCG, hit rate, coverage · bootstrap confidence
intervals · time-split evaluation without leakage · reproducible pipelines.

## What I took from it

- **An analysis is only as good as its data.** Half the work was deciding which events
  exist, who records them, and making sure they can't be lost or double-counted.
- **Decide before you look.** Pre-registration turned arguable results into clear
  decisions and prevented shipping a model that looked best offline.
- **Check methods against a known truth.** Planting effects in a simulator and
  requiring the analysis to find them turns "the numbers look plausible" into a test
  that can fail.
- **Next:** real users. The same code runs unchanged on real events; SMS verification
  is the first step before a public release.
