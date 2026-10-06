"""Rule-based "new properties you might like" notifications.

This is the baseline the project will later compare a learned recommender against,
so its rules are kept explicit and easy to reason about:

* a user's preferred type is the most-viewed property type among their last
  RECENT_VIEWS views, if there are at least MIN_VIEWS of them and that type's
  share is at least MIN_CONFIDENCE;
* users without a preference get a one-time welcome notification that recommends
  nothing: with no history there is no signal, and "the newest listing" would be the
  same for everyone while reading as personalized (the cold-start problem);
* users with a preference are told about the newest property of that type added
  within NEW_PROPERTY_WINDOW that they haven't viewed or been notified about yet.
"""

from collections import Counter
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.events.recorder import ClientContext
from app.models import Notification, NotificationKind, Property, PropertyView, User
from app.services.notifications import create_notification

RECENT_VIEWS = 20
MIN_VIEWS = 3
MIN_CONFIDENCE = 0.4
NEW_PROPERTY_WINDOW = timedelta(days=7)


@dataclass(frozen=True)
class Preference:
    type: str
    confidence: float
    views_analyzed: int


@dataclass(frozen=True)
class CheckResult:
    reason: str
    notification: Notification | None = None


def analyze_preference(db: Session, user_id: str) -> Preference | None:
    recent_types = db.scalars(
        select(Property.type)
        .join(PropertyView, PropertyView.property_id == Property.id)
        .where(PropertyView.user_id == user_id)
        .order_by(PropertyView.created_at.desc())
        .limit(RECENT_VIEWS)
    ).all()

    if len(recent_types) < MIN_VIEWS:
        return None

    counts = Counter(recent_types)
    # Ties are broken alphabetically so the result is deterministic.
    favorite, count = min(counts.items(), key=lambda item: (-item[1], item[0]))
    confidence = count / len(recent_types)
    if confidence < MIN_CONFIDENCE:
        return None
    return Preference(type=favorite, confidence=confidence, views_analyzed=len(recent_types))


def _area(address: str) -> str:
    """'12 Nile St, Maadi, Cairo' -> 'Maadi'; falls back to the whole address."""
    parts = [part.strip() for part in address.split(",") if part.strip()]
    return parts[1] if len(parts) >= 3 else (address or "your area")


def check_new_properties(
    db: Session, user_id: str, context: ClientContext | None = None
) -> CheckResult:
    preference = analyze_preference(db, user_id)

    if preference is None:
        has_any = db.scalar(select(Notification.id).where(Notification.user_id == user_id).limit(1))
        if has_any:
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

    already_notified = select(Notification.related_property_id).where(
        Notification.user_id == user_id,
        Notification.related_property_id.is_not(None),
    )
    already_viewed = select(PropertyView.property_id).where(PropertyView.user_id == user_id)
    candidate = db.scalars(
        select(Property)
        .where(
            Property.type == preference.type,
            Property.created_at >= datetime.now(UTC) - NEW_PROPERTY_WINDOW,
            Property.id.not_in(already_notified),
            Property.id.not_in(already_viewed),
        )
        .order_by(Property.created_at.desc())
        .limit(1)
    ).first()

    if candidate is None:
        return CheckResult("no_new_matches")

    notification = create_notification(
        db,
        user_id=user_id,
        kind=NotificationKind.RECOMMENDATION,
        title="🏠 New Property You Might Like!",
        message=f"{candidate.name} just listed in {_area(candidate.address)}.",
        property_id=candidate.id,
        context=context,
    )
    db.commit()
    return CheckResult("new_match", notification)
