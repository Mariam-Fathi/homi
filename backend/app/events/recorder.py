"""Recording events: server-side outcomes and batches uploaded by the app."""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import Header
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.events.registry import EVENTS
from app.models import Event

API_VERSION = "0.1.0"
MAX_CLOCK_AHEAD = timedelta(hours=24)


def _parse_uuid(value: str | None) -> uuid.UUID | None:
    try:
        return uuid.UUID(value) if value else None
    except ValueError:
        return None


@dataclass(frozen=True)
class ClientContext:
    """Session and device ids the app sends as headers on every API call, so events
    the server records join the same session as the app's own events."""

    session_id: uuid.UUID | None = None
    anonymous_id: uuid.UUID | None = None


def client_context(
    x_session_id: Annotated[str | None, Header()] = None,
    x_anonymous_id: Annotated[str | None, Header()] = None,
) -> ClientContext:
    return ClientContext(_parse_uuid(x_session_id), _parse_uuid(x_anonymous_id))


def validate_properties(event_name: str, properties: dict) -> dict:
    """Returns the validated properties, or raises ValueError explaining what's wrong."""
    spec = EVENTS.get(event_name)
    if spec is None:
        raise ValueError(f"unknown event '{event_name}' (see docs/tracking-plan.md)")
    try:
        return spec.props.model_validate(properties).model_dump(mode="json")
    except ValidationError as exc:
        problems = "; ".join(
            f"{'.'.join(str(p) for p in err['loc']) or 'properties'}: {err['msg']}"
            for err in exc.errors()
        )
        raise ValueError(problems) from exc


def record_server_event(
    db: Session,
    event_name: str,
    *,
    user_id: str | None,
    context: ClientContext | None = None,
    **properties: object,
) -> None:
    """Adds a server-side event to the current transaction, so it's stored if and
    only if the change it describes is committed."""
    assert EVENTS[event_name].source == "server", f"{event_name} is an app event"
    context = context or ClientContext()
    # Write pending rows (e.g. the new user this event refers to) first; the events
    # table has a foreign key to users that SQLAlchemy can't order automatically.
    db.flush()
    db.add(
        Event(
            event_id=uuid.uuid4(),
            event_name=event_name,
            occurred_at=datetime.now(UTC),
            user_id=user_id,
            anonymous_id=context.anonymous_id,
            session_id=context.session_id,
            platform="server",
            app_version=API_VERSION,
            properties=validate_properties(event_name, properties),
        )
    )


def adjust_clock(occurred_at: datetime, now: datetime) -> tuple[datetime, bool]:
    """Replaces timestamps far in the future (a wrong phone clock) with the server time."""
    if occurred_at.tzinfo is None:
        occurred_at = occurred_at.replace(tzinfo=UTC)
    if occurred_at - now > MAX_CLOCK_AHEAD:
        return now, True
    return occurred_at, False
