"""User simulator: generates realistic, labeled usage with known, planted problems.

    python -m homi_analytics.simulator --users 2000 --days 28 --reset

Writes users and events (exactly as the real API and app would) into the analytics
database, using its real property catalog. Every simulated row is labeled with
app_version = "simulator". The planted problems (GROUND_TRUTH) are what the funnel
analysis must rediscover without being told; see docs/funnel-analytics.md.
"""

import argparse
import json
import uuid
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime, timedelta

import numpy as np
from sqlalchemy import Engine, delete, select, text

from app.experiments import EXPERIMENTS, assign
from app.models import Event, Property, User
from app.recommender import (
    MODELS,
    RULE_MIN_VIEWS,
    Interaction,
    Listing,
    Recommender,
    city_of,
)
from app.services.recommendations import EXPERIMENT_KEY as RECOMMENDER_EXPERIMENT_KEY
from app.services.recommendations import MODEL_FOR_VARIANT
from homi_analytics.db import get_engine

LABEL = "simulator"

# --- the planted problems -----------------------------------------------------------

# 1. Visibility: townhouses are rarely placed in the featured and home lists.
PLACEMENT_WEIGHT = {"Townhouses": 0.12}
# 2. Interest: commercial units are seen but rarely clicked.
CLICK_INTEREST = {"Commercial": 0.3}
# 3. Conversion: villas are opened, but the price puts people off requesting a viewing.
FORM_OPEN_FACTOR = {"Villas": 0.25}
# 4. Form friction: guests type their phone number and often get it wrong.
VALIDATION_FAILURE = {"guest": 0.45, "phone": 0.03}

# --- the planted experiment effect (Phase 4) -------------------------------------------
# In the phone_autoformat treatment, guests' numbers are formatted as they type, so
# fewer fail validation. Phone users' numbers are pre-filled, so nothing changes for
# them and they're never exposed. Only applied when SimConfig.experiment is True.
EXPERIMENT_KEY = "phone_autoformat"
TREATMENT_GUEST_VALIDATION_FAILURE = 0.18

# --- hidden tastes (Phase 5) ------------------------------------------------------------
# Each person prefers a type, a city and a price level. How well a listing matches
# raises the chance they tap it, open the viewing form, and open a recommendation about
# it. Models never see tastes, only behavior. Only applied when SimConfig.tastes is True.
TASTE_TYPE_WEIGHT = 1.4
TASTE_CITY_WEIGHT = 1.0
TASTE_PRICE_WEIGHT = 1.2  # per unit of |log(price / budget)|
BUDGET_SPREAD = 0.35  # log-normal spread of budgets around the type's typical price
RECOMMENDATION_OPEN_RATE = 0.12  # at average affinity; scales with affinity
REFIT_EVERY = 250  # people simulated between model refits

# The online recommender test uses the API's own variant -> model mapping, so the
# simulation can't drift from what ships (docs/case-study-recommender.md).
RECOMMENDER_EXPERIMENT = RECOMMENDER_EXPERIMENT_KEY
RECOMMENDER_VARIANTS = {variant: model.name for variant, model in MODEL_FOR_VARIANT.items()}
# 5. Search dead ends: popular queries that match no listing.
DEAD_END_QUERIES = ["duplex", "chalet", "penthouse"]

GROUND_TRUTH = {
    "visibility_problem": "Townhouses",
    "interest_problem": "Commercial",
    "conversion_problem": "Villas",
    "form_friction_segment": "guest",
    "dead_end_queries": DEAD_END_QUERIES,
    "experiment": {
        "key": EXPERIMENT_KEY,
        "guest_validation_failure": {
            "control": VALIDATION_FAILURE["guest"],
            "treatment": TREATMENT_GUEST_VALIDATION_FAILURE,
        },
    },
}

# --- baseline behavior ------------------------------------------------------------------

PLATFORMS = (["android", "ios", "web"], [0.6, 0.3, 0.1])
GUEST_SHARE = 0.3
BASE_CTR = {"featured": 0.14, "home": 0.10, "explore": 0.18}  # at position 0
POSITION_DECAY = 0.85  # each position further down is clicked this much less
SAVE_RATE = 0.12
FORM_OPEN_RATE = 0.24
ABANDON_AFTER_FAILURE = 0.6
FORM_COMPLETION = 0.8
SEARCH_RATE = 0.3
FILTER_RATE = 0.2
LEAVE_AFTER_DEAD_END = 0.6
RETURN_RATE = 0.5  # chance of a second session; decays each time
RETURN_DECAY = 0.75
QUERIES = (
    ["maadi", "zayed", "new cairo", "villa", "apartment", "gouna", "north coast", "office"]
    + DEAD_END_QUERIES,
    [10, 8, 8, 9, 9, 5, 6, 4, 7, 6, 4],
)


@dataclass
class SimConfig:
    users: int = 2000
    days: int = 28
    seed: int = 7
    # Run the phone_autoformat experiment. Off by default so earlier datasets (and the
    # Phase 3 case study) stay exactly reproducible.
    experiment: bool = False
    # Validation only: put every exposed person in this variant, to measure the true
    # effect by running the same people through both variants (see true_effect).
    force_variant: str | None = None
    # Give people hidden tastes and send recommendations with app.recommender models.
    tastes: bool = False
    # Which model sends recommendations when tastes are on and no experiment runs.
    recommender: str = "rule_based"
    # Run the online recommender A/B test (needs tastes).
    recommender_experiment: bool = False
    end: datetime = field(default_factory=lambda: datetime.now(UTC))


@dataclass
class _Listing:
    id: str
    type: str
    name: str
    address: str
    price: int = 0
    area: int = 0
    bedrooms: int = 0
    created_at: datetime = datetime(2026, 1, 1, tzinfo=UTC)

    def as_model_listing(self) -> Listing:
        return Listing(
            self.id,
            self.type,
            city_of(self.address),
            self.price,
            self.area,
            self.bedrooms,
            self.created_at,
        )


class _Generator:
    """Walks simulated people through sessions and collects users and events."""

    def __init__(self, config: SimConfig, catalog: list[_Listing]):
        self.cfg = config
        self.rng = np.random.default_rng(config.seed)
        self.catalog = catalog
        weights = np.array([PLACEMENT_WEIGHT.get(p.type, 1.0) for p in catalog])
        self.placement = weights / weights.sum()
        self.users: list[dict] = []
        self.events: list[dict] = []
        if config.tastes:
            self._init_tastes()

    def _init_tastes(self) -> None:
        self.model_catalog = [p.as_model_listing() for p in self.catalog]
        self.cities = sorted({p.city for p in self.model_catalog})
        self.types = [p.type for p in self.catalog]
        self.typical_price = {
            t: float(np.median([p.price for p in self.catalog if p.type == t]))
            for t in set(self.types)
        }
        self.interactions: list[Interaction] = []
        self.models: dict[str, Recommender] = {}
        self._refit()

    def _refit(self) -> None:
        """Retrain every model on all interactions so far, as a nightly job would."""
        self.models = {
            name: cls().fit(self.interactions, self.model_catalog) for name, cls in MODELS.items()
        }

    # -- helpers ---------------------------------------------------------------------

    def _uuid(self) -> uuid.UUID:
        return uuid.UUID(bytes=self.rng.bytes(16), version=4)

    def _emit(
        self,
        name: str,
        at: datetime,
        props: dict,
        *,
        person: dict,
        server=False,
        session: uuid.UUID | None = None,
        signed_in: bool = True,
    ) -> None:
        self.events.append(
            {
                "event_id": self._uuid(),
                "event_name": name,
                "occurred_at": at,
                "received_at": at + timedelta(seconds=float(self.rng.uniform(0.2, 12))),
                "clock_adjusted": False,
                "user_id": person["user_id"] if signed_in else None,
                "anonymous_id": None if server and session is None else person["device"],
                "session_id": session,
                "platform": "server" if server else person["platform"],
                "app_version": LABEL,
                "properties": props,
            }
        )

    def _chance(self, p: float) -> bool:
        return bool(self.rng.random() < p)

    def _search(self, query: str) -> list[_Listing]:
        q = query.lower()
        return [
            p
            for p in self.catalog
            if q in p.name.lower() or q in p.address.lower() or q in p.type.lower()
        ]

    # -- one person ------------------------------------------------------------------------

    def person(self) -> None:
        start = self.cfg.end - timedelta(days=self.cfg.days)
        first_seen = start + timedelta(days=float(self.rng.uniform(0, self.cfg.days - 1)))
        guest = self._chance(GUEST_SHARE)
        person = {
            "user_id": str(self._uuid()),
            "device": self._uuid(),
            "platform": str(self.rng.choice(PLATFORMS[0], p=PLATFORMS[1])),
            "guest": guest,
            "viewed": [],
            "requested": set(),
            "pending_notification": None,
        }
        if self.cfg.tastes:
            self._give_taste(person)
        self.users.append(
            {
                "id": person["user_id"],
                "name": f"Simulated {len(self.users) + 1:04d}",
                "phone": None,
                "is_demo": guest,
                "role": "user",
                "created_at": first_seen,
            }
        )

        if self.cfg.tastes and len(self.users) % REFIT_EVERY == 0:
            self._refit()

        at, return_rate, first = first_seen, RETURN_RATE, True
        while at < self.cfg.end:
            self.session(person, at, first)
            first = False
            if not self._chance(return_rate):
                break
            return_rate *= RETURN_DECAY
            at += timedelta(
                days=float(self.rng.exponential(3)), hours=float(self.rng.uniform(0, 12))
            )

    def _give_taste(self, person: dict) -> None:
        taste_type = self.types[int(self.rng.integers(len(self.types)))]
        taste_city = self.cities[int(self.rng.integers(len(self.cities)))]
        budget = self.typical_price[taste_type] * float(np.exp(self.rng.normal(0, BUDGET_SPREAD)))
        raw = np.array(
            [
                np.exp(
                    TASTE_TYPE_WEIGHT * (p.type == taste_type)
                    + TASTE_CITY_WEIGHT * (p.city == taste_city)
                    - TASTE_PRICE_WEIGHT * abs(np.log(max(p.price, 1) / budget))
                )
                for p in self.model_catalog
            ]
        )
        # Relative affinity: 1.0 is this person's average listing.
        person["affinity"] = dict(zip((p.id for p in self.catalog), raw / raw.mean(), strict=True))
        person["taste"] = {"type": taste_type, "city": taste_city, "budget": budget}
        person["history"] = []
        person["recommended"] = set()

    def _record(self, person: dict, listing_id: str, kind: str, at: datetime) -> None:
        if self.cfg.tastes:
            interaction = Interaction(person["user_id"], listing_id, kind, at)
            person["history"].append(interaction)
            self.interactions.append(interaction)

    def _affinity(self, person: dict, listing_id: str) -> float:
        return person["affinity"][listing_id] if self.cfg.tastes else 1.0

    def session(self, person: dict, at: datetime, first: bool) -> None:
        sid = self._uuid()
        clock = [at]

        def step(seconds: float = 8) -> datetime:
            clock[0] += timedelta(seconds=float(self.rng.exponential(seconds)) + 1)
            return clock[0]

        app = dict(person=person, session=sid)
        self._emit("app_opened", step(), {"cold_start": True}, **app, signed_in=not first)

        if first:
            self._emit("screen_viewed", step(), {"screen": "auth"}, **app, signed_in=False)
            if not person["guest"] and self._chance(0.12):
                self._emit(
                    "sign_in_failed", step(), {"reason": "invalid_phone"}, **app, signed_in=False
                )
            method = "guest" if person["guest"] else "phone"
            self._emit("signed_up", step(), {"method": method}, **app, server=True)
            self._emit(
                "notification_created",
                step(1),
                {"notification_id": str(self._uuid()), "kind": "welcome", "property_id": None},
                **app,
                server=True,
            )

        self._emit("screen_viewed", step(), {"screen": "home"}, **app)

        # A recommendation sent since the last visit may be opened from the push.
        pending = person["pending_notification"]
        open_rate = 0.35
        if pending and self.cfg.tastes:
            open_rate = min(
                0.9, RECOMMENDATION_OPEN_RATE * self._affinity(person, pending["listing"].id)
            )
        if pending and self._chance(open_rate):
            self._emit(
                "notification_opened",
                step(),
                {
                    "notification_id": pending["id"],
                    "kind": "recommendation",
                    "property_id": pending["listing"].id,
                    "via": "push",
                },
                **app,
            )
            self.view(person, pending["listing"], "push", step, app)
        person["pending_notification"] = None

        featured = self._pick_listings(5)
        self.browse(person, featured, "featured", step, app, visible_after=2, scroll_p=0.5)
        home = self._pick_listings(6)
        self.browse(person, home, "home", step, app, visible_after=4, scroll_p=0.6)

        if self._chance(SEARCH_RATE):
            query = str(self.rng.choice(QUERIES[0], p=np.array(QUERIES[1]) / sum(QUERIES[1])))
            results = self._search(query)
            self._emit("screen_viewed", step(), {"screen": "explore"}, **app)
            self._emit(
                "search_performed", step(4), {"query": query, "results_count": len(results)}, **app
            )
            if not results and self._chance(LEAVE_AFTER_DEAD_END):
                self._after_session(person, clock[0])
                return
            self.browse(person, results[:6], "explore", step, app, visible_after=4, scroll_p=0.6)

        if self._chance(FILTER_RATE):
            ptype = str(self.rng.choice(sorted({p.type for p in self.catalog})))
            matches = [p for p in self.catalog if p.type == ptype]
            self._emit(
                "filter_applied", step(), {"filter": ptype, "results_count": len(matches)}, **app
            )
            self.browse(person, matches[:6], "explore", step, app, visible_after=4, scroll_p=0.6)

        self._after_session(person, clock[0])

    def _pick_listings(self, n: int) -> list[_Listing]:
        idx = self.rng.choice(len(self.catalog), size=n, replace=False, p=self.placement)
        return [self.catalog[i] for i in idx]

    def browse(self, person, listings, list_name, step, app, *, visible_after, scroll_p):
        scrolled = self._chance(scroll_p)
        for position, listing in enumerate(listings):
            if position >= visible_after and not scrolled:
                break
            self._emit(
                "property_impression",
                step(2),
                {"property_id": listing.id, "list": list_name, "position": position},
                **app,
            )
            p_click = (
                BASE_CTR[list_name]
                * POSITION_DECAY**position
                * CLICK_INTEREST.get(listing.type, 1.0)
                * self._affinity(person, listing.id)
            )
            if self._chance(p_click):
                self._emit(
                    "property_card_clicked",
                    step(),
                    {"property_id": listing.id, "list": list_name, "position": position},
                    **app,
                )
                self.view(person, listing, "card", step, app)

    def view(self, person, listing, source, step, app) -> None:
        viewed_at = step()
        self._emit(
            "property_viewed", viewed_at, {"property_id": listing.id, "source": source}, **app
        )
        self._emit("screen_viewed", step(1), {"screen": "property"}, **app)
        person["viewed"].append(listing)
        self._record(person, listing.id, "view", viewed_at)

        if self._chance(SAVE_RATE):
            saved_at = step(15)
            self._emit("favorite_added", saved_at, {"property_id": listing.id}, **app, server=True)
            self._record(person, listing.id, "favorite", saved_at)

        if listing.id in person["requested"]:
            return  # already has an open request; the form isn't offered
        form_open_rate = FORM_OPEN_RATE * FORM_OPEN_FACTOR.get(listing.type, 1.0)
        if self.cfg.tastes:
            form_open_rate *= min(self._affinity(person, listing.id), 4.0) ** 0.5
        if not self._chance(form_open_rate):
            return

        opened_at = step(20)
        self._emit("viewing_form_opened", opened_at, {"property_id": listing.id}, **app)
        segment = "guest" if person["guest"] else "phone"
        failure_rate = VALIDATION_FAILURE[segment]
        # Exposure is logged only where the variant changes something: guests type their
        # number; phone users' is pre-filled.
        if self.cfg.experiment and person["guest"]:
            variant = self.cfg.force_variant or assign(
                EXPERIMENTS[EXPERIMENT_KEY], person["user_id"]
            )
            self._emit(
                "experiment_exposed",
                step(1),
                {"experiment": EXPERIMENT_KEY, "variant": variant},
                **app,
            )
            if variant == "treatment":
                failure_rate = TREATMENT_GUEST_VALIDATION_FAILURE
        if self._chance(failure_rate):
            self._emit(
                "viewing_form_validation_failed",
                step(20),
                {"property_id": listing.id, "field": "phone"},
                **app,
            )
            if self._chance(ABANDON_AFTER_FAILURE):
                self._abandon(listing, opened_at, step, app)
                return
        if not self._chance(FORM_COMPLETION):
            self._abandon(listing, opened_at, step, app)
            return

        requested_at = step(25)
        request_id = str(self._uuid())
        self._emit(
            "viewing_requested",
            requested_at,
            {
                "property_id": listing.id,
                "request_id": request_id,
                "time_slot": str(self.rng.choice(["morning", "afternoon", "evening"])),
                "days_ahead": int(self.rng.integers(1, 8)),
            },
            **app,
            server=True,
        )
        person["requested"].add(listing.id)
        self._record(person, listing.id, "request", requested_at)
        self._agent_pipeline(person, listing, request_id, requested_at)

    def _abandon(self, listing, opened_at, step, app) -> None:
        closed_at = step(10)
        self._emit(
            "viewing_form_abandoned",
            closed_at,
            {
                "property_id": listing.id,
                "seconds_open": int((closed_at - opened_at).total_seconds()),
            },
            **app,
        )

    def _agent_pipeline(self, person, listing, request_id, at) -> None:
        """An agent moves the request along over the following days (no app session)."""
        stages = [
            ("requested", "contacted", 0.9, 6),
            ("contacted", "scheduled", 0.7, 24),
            ("scheduled", "completed", 0.8, 72),
        ]
        for from_status, to_status, p, mean_hours in stages:
            if not self._chance(p):
                return
            at += timedelta(hours=float(self.rng.exponential(mean_hours)) + 0.5)
            if at > self.cfg.end:
                return
            self._emit(
                "viewing_status_changed",
                at,
                {
                    "property_id": listing.id,
                    "request_id": request_id,
                    "from_status": from_status,
                    "to_status": to_status,
                    "changed_by": "agent",
                },
                person=person,
                server=True,
                session=None,
            )
            self._emit(
                "notification_created",
                at + timedelta(seconds=1),
                {
                    "notification_id": str(self._uuid()),
                    "kind": "viewing_status",
                    "property_id": listing.id,
                },
                person=person,
                server=True,
                session=None,
            )

    def _after_session(self, person, at) -> None:
        """Mirror the app's rule-based recommendation: after enough views, suggest an
        unseen listing of the person's most-viewed type."""
        if self.cfg.tastes:
            self._recommend(person, at)
            return
        if len(person["viewed"]) < 3 or not self._chance(0.4):
            return
        types = [p.type for p in person["viewed"]]
        # Ties broken alphabetically: iterating a set of strings would follow Python's
        # per-process hash order and make runs irreproducible.
        favorite = max(sorted(set(types)), key=types.count)
        seen = {p.id for p in person["viewed"]}
        options = [p for p in self.catalog if p.type == favorite and p.id not in seen]
        if not options:
            return
        listing = options[int(self.rng.integers(len(options)))]
        notification_id = str(self._uuid())
        self._emit(
            "notification_created",
            at + timedelta(minutes=5),
            {
                "notification_id": notification_id,
                "kind": "recommendation",
                "property_id": listing.id,
            },
            person=person,
            server=True,
            session=None,
        )
        person["pending_notification"] = {"id": notification_id, "listing": listing}

    def _recommend(self, person, at) -> None:
        """Send a recommendation chosen by a model from app.recommender. The trigger
        (enough views, and the same cadence) doesn't depend on the model, so in an
        experiment both variants are eligible in exactly the same situations."""
        views = sum(1 for i in person["history"] if i.kind == "view")
        if views < RULE_MIN_VIEWS or not self._chance(0.4):
            return
        model_name = self.cfg.recommender
        if self.cfg.recommender_experiment:
            variant = self.cfg.force_variant or assign(
                EXPERIMENTS[RECOMMENDER_EXPERIMENT], person["user_id"]
            )
            model_name = RECOMMENDER_VARIANTS[variant]
            self._emit(
                "experiment_exposed",
                at + timedelta(minutes=4),
                {"experiment": RECOMMENDER_EXPERIMENT, "variant": variant},
                person=person,
                server=True,
                session=None,
            )
        seen = {i.property_id for i in person["history"]} | person["recommended"]
        picks = self.models[model_name].recommend(person["history"], exclude=seen, k=1)
        if not picks:
            return
        listing = next(p for p in self.catalog if p.id == picks[0])
        person["recommended"].add(listing.id)
        notification_id = str(self._uuid())
        self._emit(
            "notification_created",
            at + timedelta(minutes=5),
            {
                "notification_id": notification_id,
                "kind": "recommendation",
                "property_id": listing.id,
            },
            person=person,
            server=True,
            session=None,
        )
        person["pending_notification"] = {"id": notification_id, "listing": listing}


def true_effect(catalog: list[_Listing], users: int = 40_000, seed: int = 99) -> dict:
    """The primary metric's true value in each variant: the same simulated people,
    run once with everyone in control and once with everyone in treatment. Only
    possible in a simulation, and the benchmark the experiment's estimate is checked
    against."""
    rates = {}
    for variant in ("control", "treatment"):
        cfg = SimConfig(
            users=users,
            seed=seed,
            experiment=True,
            force_variant=variant,
            end=datetime(2026, 10, 5, tzinfo=UTC),
        )
        gen = _Generator(cfg, catalog)
        exposed = requested = 0
        for _ in range(users):
            gen.person()
            first = next(
                (e["occurred_at"] for e in gen.events if e["event_name"] == "experiment_exposed"),
                None,
            )
            if first is not None:
                exposed += 1
                requested += any(
                    e["event_name"] == "viewing_requested" and e["occurred_at"] >= first
                    for e in gen.events
                )
            gen.events.clear()  # one person at a time keeps memory flat
        rates[variant] = {"exposed": exposed, "rate": requested / exposed}
    rates["difference"] = rates["treatment"]["rate"] - rates["control"]["rate"]
    return rates


def true_recommender_rates(
    catalog: list[_Listing], users: int = 20_000, seed: int = 99
) -> dict[str, dict]:
    """True value of the recommender test's primary metric in each arm: the same
    simulated people, run once per arm with everyone in it. Only possible in a
    simulation; the benchmark the online estimates are checked against."""
    rates = {}
    for variant in MODEL_FOR_VARIANT:
        cfg = SimConfig(
            users=users,
            seed=seed,
            tastes=True,
            recommender_experiment=True,
            force_variant=variant,
            end=datetime(2026, 10, 5, tzinfo=UTC),
        )
        gen = _Generator(cfg, catalog)
        exposed = opened = 0
        for _ in range(users):
            gen.person()
            first = next(
                (e["occurred_at"] for e in gen.events if e["event_name"] == "experiment_exposed"),
                None,
            )
            if first is not None:
                exposed += 1
                opened += any(
                    e["event_name"] == "notification_opened"
                    and e["properties"].get("kind") == "recommendation"
                    and e["occurred_at"] >= first
                    for e in gen.events
                )
            gen.events.clear()  # one person at a time keeps memory flat
        rates[variant] = {"exposed": exposed, "rate": opened / exposed}
    return rates


def load_catalog(engine: Engine) -> list[_Listing]:
    with engine.connect() as conn:
        rows = conn.execute(
            select(
                Property.id,
                Property.type,
                Property.name,
                Property.address,
                Property.price,
                Property.area,
                Property.bedrooms,
                Property.created_at,
            ).order_by(Property.created_at.desc(), Property.id)
        ).all()
    return [_Listing(*row) for row in rows]


def clear_simulated(engine: Engine) -> None:
    with engine.begin() as conn:
        conn.execute(delete(Event).where(Event.app_version == LABEL))
        conn.execute(delete(User).where(User.name.like("Simulated %")))


def simulate(engine: Engine, config: SimConfig) -> dict:
    catalog = load_catalog(engine)
    if not catalog:
        raise SystemExit("No properties found: run the backend seed on this database first.")

    gen = _Generator(config, catalog)
    for _ in range(config.users):
        gen.person()

    with engine.begin() as conn:
        conn.execute(User.__table__.insert(), gen.users)
        for i in range(0, len(gen.events), 5000):
            conn.execute(Event.__table__.insert(), gen.events[i : i + 5000])
    # Refresh the planner's statistics: without them, queries right after a bulk load
    # can pick plans that take minutes instead of seconds.
    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
        conn.execute(text("ANALYZE events"))
        conn.execute(text("ANALYZE users"))

    return {
        "config": {**asdict(config), "end": config.end.isoformat()},
        "ground_truth": GROUND_TRUTH,
        "users": len(gen.users),
        "events": len(gen.events),
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawTextHelpFormatter
    )
    parser.add_argument("--users", type=int, default=SimConfig.users)
    parser.add_argument("--days", type=int, default=SimConfig.days)
    parser.add_argument("--seed", type=int, default=SimConfig.seed)
    parser.add_argument(
        "--end",
        type=lambda d: datetime.fromisoformat(d).replace(tzinfo=UTC),
        default=None,
        help="last simulated day, YYYY-MM-DD (default: now); fix it to reproduce a dataset",
    )
    parser.add_argument(
        "--experiment", action="store_true", help="run the phone_autoformat A/B test"
    )
    parser.add_argument(
        "--tastes", action="store_true", help="give people hidden tastes (recommender study)"
    )
    parser.add_argument(
        "--recommender-experiment",
        action="store_true",
        help="run the online recommender A/B test (implies --tastes)",
    )
    parser.add_argument("--reset", action="store_true", help="remove earlier simulated data first")
    args = parser.parse_args()

    engine = get_engine()
    if engine.url.database != "homi_sim" and not args.reset:
        print(f"Note: writing simulated data into '{engine.url.database}'.")
    if args.reset:
        clear_simulated(engine)
    config = SimConfig(
        users=args.users,
        days=args.days,
        seed=args.seed,
        experiment=args.experiment,
        tastes=args.tastes or args.recommender_experiment,
        recommender_experiment=args.recommender_experiment,
    )
    if args.end:
        config.end = args.end
    summary = simulate(engine, config)
    print(json.dumps(summary, indent=2, default=str))


if __name__ == "__main__":
    main()
