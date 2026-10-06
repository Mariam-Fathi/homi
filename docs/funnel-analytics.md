# Funnel analytics (Phase 3)

Turns the events defined in the [tracking plan](tracking-plan.md) into answers: where
users drop off, and why. Everything here is reproducible from code in `analytics/`.

## The problem with a demo app: no users

A real funnel analysis needs thousands of users. A portfolio app has a handful. Rather
than fake numbers, this phase uses a **user simulator**: a model of how people browse
real-estate listings, with a few problems deliberately built in. The analysis is then
judged on whether it finds those problems, without being told what they are.

This is the same idea as testing a measuring instrument against a known reference: if
the pipeline (tracking → ingestion → data model → metrics → diagnosis) recovers the
planted effects, it can be trusted on real data.

> All simulated data is labeled (`app_version = "simulator"`) and lives in a separate
> database (`homi_sim`), so it never mixes with real usage.

## Metrics

All rates are computed per **session × property** unless noted, so one person opening
the same listing five times in a session counts once.

| Metric | Definition |
|---|---|
| **Impressions** | Distinct (session, property) pairs with a `property_impression` |
| **Click-through rate (CTR)** | Clicked ÷ impressed, from `property_card_clicked` |
| **Views** | Distinct (session, property) pairs with a `property_viewed`, from any source |
| **Save rate** | Viewed pairs that also have `favorite_added` ÷ viewed |
| **Form-open rate** | Viewed pairs with `viewing_form_opened` ÷ viewed |
| **Form completion** | Pairs with `viewing_requested` ÷ pairs with `viewing_form_opened` |
| **View-to-request (conversion)** | Pairs with `viewing_requested` ÷ viewed pairs |
| **Search dead-end rate** | Searches with `results_count = 0` ÷ all searches |
| **Session conversion** | Sessions with at least one `viewing_requested` ÷ all sessions |

### Diagnosis (from the stage where a segment falls furthest behind)

For each property type, every stage is compared with the same stage across all types:

| Weakest stage | Diagnosis | Typical fix |
|---|---|---|
| Impressions share | **Visibility problem**: people rarely see it | Ranking, placement, promotion |
| CTR | **Interest problem**: seen but not clicked | Photos, title, price shown on the card |
| View-to-request | **Conversion problem**: opened but not requested | Price, details, trust, the form itself |

A segment is flagged only if it is at least 30% below the overall rate on that stage;
otherwise it's "healthy".

## Simulator: the planted ground truth

The simulator generates users over a period (default 2,000 users across 28 days),
using the real property catalog. Its baseline behavior:

- Platforms: Android 60%, iOS 30%, web 10%. Sign-up: phone 70%, guest 30%.
- Users return for more sessions with decreasing probability.
- Each session sees the featured list and the home list; some search or filter.
- Click probability falls with list position; viewing a property can lead to saving
  it, opening the viewing form, and sending a request.

Planted problems, which the analysis must find on its own:

| # | Planted effect | Expected diagnosis |
|---|---|---|
| 1 | **Townhouses** are rarely placed in lists | Townhouses: **visibility** problem |
| 2 | **Commercial** units are seen but rarely clicked | Commercial: **interest** problem |
| 3 | **Villas** are opened often but rarely requested (price shock) | Villas: **conversion** problem |
| 4 | **Guests** must type their phone number in the form, and often get it wrong | Guests: much lower form completion, more validation failures |
| 5 | Some popular searches ("duplex", "chalet") match **no listings** | Those queries top the dead-end list |

The exact parameters live at the top of `analytics/homi_analytics/simulator.py`, and
every run prints them with the data it generated. A fixed seed and end date reproduce
a dataset exactly. Results: [case study](case-study-funnel.md).

## Pieces

| Piece | Where | What |
|---|---|---|
| Data model | `analytics/homi_analytics/sql/` | SQL views in an `analytics` schema: sessions, the session × property funnel, searches, the viewing form |
| Metrics & diagnosis | `analytics/homi_analytics/` | Python that reads the views and classifies each segment |
| Simulator | `analytics/homi_analytics/simulator.py` | Generates labeled synthetic usage into `homi_sim` |
| Dashboard | `analytics/dashboard.py` | Streamlit app: KPIs, funnel, diagnosis, form friction, search dead ends |
| Tests | `analytics/tests/` | The SQL on hand-written events, and the diagnosis recovering every planted effect |
