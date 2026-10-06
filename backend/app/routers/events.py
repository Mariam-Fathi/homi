import uuid
from datetime import UTC, datetime
from typing import Annotated, Literal

import jwt
from fastapi import APIRouter, Depends
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
from sqlalchemy.dialects.postgresql import insert

from app.config import Settings, get_settings
from app.events.recorder import adjust_clock, validate_properties
from app.events.registry import EVENTS
from app.models import Event, User
from app.security import DbSession, bearer

router = APIRouter(prefix="/events", tags=["analytics"])

MAX_BATCH = 50


class EventIn(BaseModel):
    event_id: uuid.UUID
    event_name: str = Field(max_length=64)
    occurred_at: datetime
    anonymous_id: uuid.UUID
    session_id: uuid.UUID
    platform: Literal["ios", "android", "web"]
    app_version: str = Field(max_length=32)
    # Who the app says was signed in when the event happened. Only a claim: it's
    # used only if it matches the token on this upload (see ingest_events).
    user_id: str | None = None
    properties: dict = Field(default_factory=dict)


class EventBatchIn(BaseModel):
    events: list[EventIn] = Field(min_length=1, max_length=MAX_BATCH)


class RejectedEvent(BaseModel):
    event_id: uuid.UUID
    error: str


class EventBatchOut(BaseModel):
    accepted: int
    duplicates: int
    rejected: list[RejectedEvent]


def _optional_user_id(
    db: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> str | None:
    """The signed-in user, or None. An invalid or expired token doesn't reject the
    batch: the events are still stored, just without a user."""
    if credentials is None:
        return None
    try:
        payload = jwt.decode(
            credentials.credentials, settings.jwt_secret, algorithms=[settings.jwt_algorithm]
        )
    except jwt.PyJWTError:
        return None
    user_id = payload.get("sub")
    return user_id if user_id and db.get(User, user_id) else None


@router.post("", response_model=EventBatchOut)
def ingest_events(
    batch: EventBatchIn,
    db: DbSession,
    user_id: Annotated[str | None, Depends(_optional_user_id)],
) -> EventBatchOut:
    """Stores a batch of app events. Each event is validated on its own against the
    tracking plan, so one bad event doesn't lose the rest; resent events (same
    event_id) are ignored, so retries never double-count.

    An event is attributed to the token's user only if the app says that user was
    signed in when it happened. Events from before sign-in stay anonymous even when
    uploaded afterwards, and an event can never be attributed to someone else."""
    now = datetime.now(UTC)
    rows: list[dict] = []
    rejected: list[RejectedEvent] = []

    for event in batch.events:
        spec = EVENTS.get(event.event_name)
        if spec is not None and spec.source == "server":
            rejected.append(
                RejectedEvent(
                    event_id=event.event_id,
                    error=f"'{event.event_name}' is recorded by the server, not the app",
                )
            )
            continue
        try:
            properties = validate_properties(event.event_name, event.properties)
        except ValueError as exc:
            rejected.append(RejectedEvent(event_id=event.event_id, error=str(exc)))
            continue

        occurred_at, adjusted = adjust_clock(event.occurred_at, now)
        rows.append(
            {
                "event_id": event.event_id,
                "event_name": event.event_name,
                "occurred_at": occurred_at,
                "received_at": now,
                "clock_adjusted": adjusted,
                "user_id": user_id if user_id and event.user_id == user_id else None,
                "anonymous_id": event.anonymous_id,
                "session_id": event.session_id,
                "platform": event.platform,
                "app_version": event.app_version,
                "properties": properties,
            }
        )

    inserted = 0
    if rows:
        # RETURNING lists only the rows actually inserted (rowcount is unreliable
        # for this kind of statement: the driver reports -1).
        inserted = len(
            db.execute(
                insert(Event)
                .values(rows)
                .on_conflict_do_nothing(index_elements=["event_id"])
                .returning(Event.event_id)
            ).all()
        )
        db.commit()

    return EventBatchOut(accepted=inserted, duplicates=len(rows) - inserted, rejected=rejected)
