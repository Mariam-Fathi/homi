"""Recommendation notifications ("a home you might like").

* People with fewer than RULE_MIN_VIEWS property views don't have enough history to
  recommend from: they get a one-time welcome that recommends nothing (cold start).
* Everyone else may get a recommendation chosen by a model from app.recommender. Which
  model is decided by the `recommender` experiment: the original rule (control),
  popularity, or the hybrid model (docs/recommender.md). The trigger doesn't depend on
  the variant, so every variant is eligible in exactly the same situations, and the
  notification text is identical, so only the choice of listing differs.
* Candidates are listings the person hasn't viewed, saved, requested or already been
  recommended.
"""

import time
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.events.recorder import ClientContext, record_server_event
from app.experiments import EXPERIMENTS, assign
from app.models import (
    Favorite,
    Notification,
    NotificationKind,
    Property,
    PropertyView,
    User,
    ViewingRequest,
)
from app.recommender import (
    RULE_MIN_VIEWS,
    Hybrid,
    Interaction,
    Listing,
    Popularity,
    Recommender,
    RuleBased,
    city_of,
)
from app.services.notifications import create_notification

EXPERIMENT_KEY = "recommender"
MODEL_FOR_VARIANT: dict[str, type[Recommender]] = {
    "control": RuleBased,
    "popularity": Popularity,
    "hybrid": Hybrid,
}
REFIT_SECONDS = 600  # retrain at most every 10 minutes (a nightly job in production)

_fitted: dict[str, tuple[float, Recommender]] = {}


@dataclass(frozen=True)
class CheckResult:
    reason: str
    notification: Notification | None = None


def _area(address: str) -> str:
    """'12 Nile St, Maadi, Cairo' -> 'Maadi'; falls back to the whole address."""
    parts = [part.strip() for part in address.split(",") if part.strip()]
    return parts[1] if len(parts) >= 3 else (address or "your area")


def _interactions(db: Session, user_id: str | None = None) -> list[Interaction]:
    sources = [
        ("view", PropertyView.user_id, PropertyView.property_id, PropertyView.created_at),
        ("favorite", Favorite.user_id, Favorite.property_id, Favorite.created_at),
        ("request", ViewingRequest.user_id, ViewingRequest.property_id, ViewingRequest.created_at),
    ]
    interactions = []
    for kind, user_col, property_col, at_col in sources:
        query = select(user_col, property_col, at_col)
        if user_id is not None:
            query = query.where(user_col == user_id)
        interactions += [Interaction(u, p, kind, at) for u, p, at in db.execute(query)]
    return interactions


def _catalog(db: Session) -> list[Listing]:
    return [
        Listing(p.id, p.type, city_of(p.address), p.price, p.area, p.bedrooms, p.created_at)
        for p in db.scalars(select(Property).order_by(Property.id))
    ]


def _model(db: Session, variant: str) -> Recommender:
    cached = _fitted.get(variant)
    if cached and time.monotonic() - cached[0] < REFIT_SECONDS:
        return cached[1]
    model = MODEL_FOR_VARIANT[variant]().fit(_interactions(db), _catalog(db))
    _fitted[variant] = (time.monotonic(), model)
    return model


def _welcome_once(db: Session, user_id: str, context: ClientContext | None) -> CheckResult:
    if db.scalar(select(Notification.id).where(Notification.user_id == user_id).limit(1)):
        return CheckResult("no_preference_yet")
    user = db.get(User, user_id)
    first_name = user.name.split()[0] if user and not user.is_demo else None
    notification = create_notification(
        db,
        user_id=user_id,
        kind=NotificationKind.WELCOME,
        title=f"🏠 Welcome to Homi, {first_name}!" if first_name else "🏠 Welcome to Homi!",
        message=(
            "Browse homes and save the ones you like. Once we learn what you're "
            "looking for, we'll let you know when matching properties are listed."
        ),
        context=context,
    )
    db.commit()
    return CheckResult("welcome", notification)


def check_new_properties(
    db: Session, user_id: str, context: ClientContext | None = None
) -> CheckResult:
    history = _interactions(db, user_id)
    if sum(1 for i in history if i.kind == "view") < RULE_MIN_VIEWS:
        return _welcome_once(db, user_id, context)

    experiment = EXPERIMENTS[EXPERIMENT_KEY]
    variant = assign(experiment, user_id) if experiment.active else "control"
    if experiment.active:
        record_server_event(
            db,
            "experiment_exposed",
            user_id=user_id,
            context=context,
            experiment=EXPERIMENT_KEY,
            variant=variant,
        )

    already_recommended = set(
        db.scalars(
            select(Notification.related_property_id).where(
                Notification.user_id == user_id,
                Notification.kind == NotificationKind.RECOMMENDATION,
            )
        )
    )
    model = _model(db, variant)
    picks = model.recommend(
        history, exclude={i.property_id for i in history} | already_recommended, k=1
    )
    if not picks:
        db.commit()  # keep the exposure
        if isinstance(model, RuleBased) and model.preferred_type(history) is None:
            return CheckResult("no_preference_yet")
        return CheckResult("no_new_matches")

    listing = db.get(Property, picks[0])
    notification = create_notification(
        db,
        user_id=user_id,
        kind=NotificationKind.RECOMMENDATION,
        title="🏠 A home you might like",
        message=f"{listing.name} in {_area(listing.address)}, based on homes you've viewed.",
        property_id=listing.id,
        context=context,
    )
    db.commit()
    return CheckResult("new_match", notification)
