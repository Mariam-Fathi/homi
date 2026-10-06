# Case study 3: Can a learned model beat the hand-written recommendation rule?

**Question.** Homi's "a home you might like" notifications come from one rule: suggest
the newest listing of the person's most-viewed type. Would a model learned from
behavior recommend better, and would that show up with real users, not just in
offline scores?

**Setup.** [docs/recommender.md](recommender.md) describes the models, the offline
protocol and the online pre-registration. As in the earlier studies the people are
simulated and labeled as such; here each one has a hidden taste (type, city, budget)
that the models never see. The models, the experiment and the analysis are the same
code that runs in the app.

## 1. Offline: every learned model beats the rule, and two tie

30,000 simulated people over 56 days, 200 listings. Models learn from the first 42
days and are judged on what each person engaged with in the last 14 (607 people had
history before the cutoff and something new after it).

| Model | NDCG@5 | Hit rate@5 | Gets a recommendation | Catalog coverage |
|---|---|---|---|---|
| popularity | **0.078** | 19.0% | 100% | **4.5%** |
| hybrid (content + collaborative, blend 0.5) | **0.074** | 17.0% | 100% | 96.5% |
| item_knn (collaborative) | 0.067 | 14.3% | 100% | 96.0% |
| content_based | 0.060 | 12.2% | 100% | 99.5% |
| rule_based (today) | 0.052 | 8.7% | **24%** | 22.0% |
| random | 0.015 | 3.5% | 100% | 100% |

NDCG@5 difference vs. the rule (95% bootstrap CI): popularity +0.026 [+0.009, +0.044],
hybrid +0.022 [+0.008, +0.037], item_knn +0.015 [+0.000, +0.031], content_based +0.008
[−0.011, +0.026].

What stood out:

- **The rule is silent for 76% of people.** It needs 3+ views with one type making up
  40% of them. The models recommend to everyone.
- **Popularity and hybrid are statistically tied** (difference +0.004, 95% CI −0.013 to
  +0.021), but very different: popularity shows the same ~9 listings to everyone (4.5%
  of the catalog); hybrid spreads across 96%.
- The blend weight (0.5) was tuned on an earlier validation window, never on the test
  window.

Rather than pick between the two by judgment, both went online.

## 2. Online: the offline winner loses

A three-arm test: the rule (control), popularity and hybrid, a third of people each,
analyzed once at the pre-registered size, with each challenger compared to control at
α = 0.025 (Bonferroni for two comparisons).

| Check | Result |
|---|---|
| Exposed people | control 1,131 · popularity 1,226 · hybrid 1,158 (planned ≥ 1,069 each) |
| Sample ratio | p = 0.13: assignment and logging look healthy |

**Primary: opened a recommended listing**

| Arm | Rate | vs. rule | 97.5% CI | p |
|---|---|---|---|---|
| rule (control) | 9.2% | | | |
| **popularity** | 5.2% | **−4.0 pts** | −6.4 to −1.6 | 0.0002 |
| hybrid | 10.5% | +1.3 pts | −1.5 to +4.1 | 0.28 |

Guardrail (sent any viewing request): no significant change in either arm (popularity
+2.0 pts, p = 0.07; hybrid +0.5 pts, p = 0.62).

**Decision, by the pre-registered rule: keep the rule.** Neither challenger beat it.
Popularity was significantly *worse*; hybrid was ahead but not by enough to be sure.

## 3. Why the offline winner lost

Offline, a model is scored on whether it predicts what someone looks at next. In Homi,
much of that browsing is driven by what the app's lists happen to show, and broadly
appealing listings get looked at by many people. Popularity is good at predicting
*that*.

Opening a notification is different: it's a personal decision about one listing. A
popular listing that doesn't match your type, city or budget gets ignored. Hybrid's
recommendations come from what *this* person engaged with, so they're opened more
often than popularity's (+5.3 pts, 95% CI +3.2 to +7.5).

**The lesson: offline metrics measure a proxy.** They're useful for ruling out bad
models cheaply (everything beat random; content-only trailed), but they can rank the
leaders wrongly. Without the online test, the "best" model offline would have shipped
and cut recommendation opens by over 40%.

## 4. Checking against the truth

In a simulation the true rates can be measured exactly: the same 20,000 people were run
once per arm, with everyone in that arm.

| Arm | True open rate | True effect vs. rule | Online estimate (97.5% CI) | Contains the truth? |
|---|---|---|---|---|
| rule | 9.5% | | | |
| popularity | 5.0% | −4.5 pts | −4.0 (−6.4 to −1.6) | ✅ |
| hybrid | 12.3% | **+2.8 pts** | +1.3 (−1.5 to +4.1) | ✅ |

Both intervals contain the truth, so the analysis was sound. But the truth also shows
the cost of this design: **hybrid really is better than the rule**, by about 2.8
points, which is smaller than the +4 points the test was sized to detect. "Keep the
rule" was the correct application of the pre-registered rule, and it was also a missed
improvement: a type II error, the known risk of a test powered for a larger effect.

Pre-registration protected against the expensive mistake (shipping popularity). The
cheaper mistake (not shipping hybrid yet) is fixable by testing again with more power,
which is the first item below.

## What I'd do next

- **Keep the rule for now, and re-test hybrid with more power.** Its estimate is
  positive, the simulation's truth says the gain is real, and it reaches everyone the
  rule ignores. A test sized for a +2-point effect needs roughly four times the people;
  a single challenger (hybrid vs. rule only) would also drop the Bonferroni correction
  and save about a sixth of the sample.
- **Fix the cold start properly.** People with fewer than 3 views get only a welcome
  message. Hybrid's content side can recommend from a single interaction, which is
  where it differs most from the rule.
- **Measure the right thing offline.** Score models on notification opens from past
  recommendations (counterfactual evaluation), not just on next views, to narrow the
  offline–online gap.

## Reproduce it

Offline evaluation (database `homi_reco`, seeded with 200 listings):

```bash
python -m homi_analytics.simulator --users 30000 --days 56 --seed 41 --end 2026-10-05 --tastes --reset
```
```bash
python -m homi_analytics.recommender_eval
```

Online test:

```bash
python -m homi_analytics.simulator --users 32000 --days 56 --seed 61 --end 2026-10-05 --recommender-experiment --reset
```

All three with `ANALYTICS_DATABASE_URL=postgresql+psycopg://homi:homi@localhost:5433/homi_reco`.
Setup: [analytics/README.md](../analytics/README.md).
