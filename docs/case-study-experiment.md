# Case study 2: Does formatting the phone number help guests book viewings?

**Background.** The [funnel case study](case-study-funnel.md) found that guests, who
type their phone number into the viewing form, fail validation far more often than
signed-in users (whose number is pre-filled) and complete the form less often. It
suggested formatting the number as it's typed. A diagnosis shows *where* a problem is;
this experiment tests whether the fix *works*.

**Plan.** Everything below was decided before the experiment ran:
[pre-registration](experimentation.md#pre-registration-phone_autoformat).

> As in case study 1, the people are simulated (and labeled as such), with a true effect
> planted on purpose, so the result can be checked against the truth. The experiment
> code (assignment, exposure logging, analysis) is the same that would run on real
> users.

## The change

| | Control | Treatment |
|---|---|---|
| Phone field for guests | Plain text field | Formats as you type (`01012345678` → `010 12345678`) |
| Placeholder | `100 123 4567` | A valid example for the selected country (`010 01234567`) |
| Hint | — | "Example: 010 01234567" |

Signed-in users' numbers are pre-filled, so the change can't affect them: they're never
exposed, and aren't in the analysis.

## Planning: how many people does this need?

| | |
|---|---|
| Baseline (from a pilot of 127 exposed guests) | 56% send a viewing request |
| Smallest effect worth detecting | +10 percentage points |
| Test | Two-sided, 5% significance, 80% power |
| **Needed** | **373 exposed people per group** |
| Share of people who get exposed | 6.3% (guests who open the form) |
| **Traffic needed** | **~11,750 people**, about six months at 2,000 a month |

The last row is a real constraint: only a small share of users ever see the change, so
the test needs far more traffic than its sample size suggests. For this study the
simulator supplied that traffic in 28 days (12,000 people).

**The test was validated before it was trusted.** Over 4,000 simulated experiments at
this sample size, it raised a false alarm (a "significant" difference that didn't exist)
4.7% of the time, against a target of 5%, and detected a real +10-point effect 79.5% of
the time, against a target of 80%.

## Results

Analyzed once, after both groups passed the planned size, following the pre-registered
rule.

**1. Is the experiment healthy?** Yes.

| Check | Result |
|---|---|
| Exposed people | control 398, treatment 420 (planned ≥ 373 each) |
| Sample ratio (does the split match 50/50?) | p = 0.44: no sign of broken assignment |
| People seen in both variants | 0 |

**2. Did it work?** Yes.

| Metric | Control | Treatment | Difference | 95% CI | p |
|---|---|---|---|---|---|
| **Requested a viewing (primary)** | 61.8% | 71.0% | **+9.1 pts** | +2.7 to +15.6 | 0.006 |
| Phone validation failed (guardrail) | 51.0% | 19.5% | −31.5 pts | −37.7 to −25.3 | < 0.001 |
| Abandoned the form (guardrail) | 44.7% | 33.3% | −11.4 pts | −18.0 to −4.7 | < 0.001 |

The mechanism works as hypothesized: validation failures fell by more than half, which
cut abandonment, which raised viewing requests. Both guardrails improved.

**3. Decision: ship the treatment.** The primary metric improved significantly and
no guardrail got worse.

## Checking against the truth

In a simulation the true effect can be measured exactly: the same 40,000 simulated
people were run once with everyone in control and once with everyone in treatment.

| | Requested a viewing |
|---|---|
| True rate, everyone in control | 61.8% |
| True rate, everyone in treatment | 75.3% |
| **True effect** | **+13.5 points** |
| Experiment's estimate | +9.1 points, 95% CI **+2.7 to +15.6** ✅ contains the truth |

The estimate was low by 4.4 points, which is ordinary sampling noise at this size (its
standard error is about 3.3 points). This is why the decision rests on the confidence
interval, not the single number: the interval said "somewhere between a small and a
large improvement", and the truth was inside it.

## What I'd watch out for with real users

- **Novelty.** A new-looking field might help at first and fade. A real rollout would
  keep a small holdout group for a few weeks.
- **One market.** Formatting rules differ by country; the effect for non-Egyptian
  numbers would need its own look once there's enough traffic.
- **Smaller effects go unnoticed.** This design had only a 28% chance of detecting a
  +5-point effect. "Not significant" from a test like this would not mean "no effect".

## Reproduce it

```bash
cd analytics && python -m homi_analytics.simulator --users 12000 --days 28 --seed 31 --end 2026-10-05 --experiment --reset
```
```bash
streamlit run dashboard.py
```

The Experiments section of the dashboard applies the same decision rule. It hides
results until the planned sample size is reached, so nobody stops the test early on a
lucky streak.
