"""Viewing-request pipeline: creation, cancellation and status transitions.

Each status change notifies the requester, mirroring how order-status updates
drive customer messages in a sales pipeline.
"""

from datetime import date
from typing import Literal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.events.recorder import ClientContext, record_server_event
from app.models import (
    OPEN_VIEWING_STATUSES,
    VIEWING_TRANSITIONS,
    NotificationKind,
    NotificationType,
    Property,
    ViewingRequest,
    ViewingStatus,
    new_id,
)
from app.schemas import ViewingRequestIn
from app.services.notifications import create_notification

STATUS_MESSAGES: dict[ViewingStatus, tuple[str, str, NotificationType]] = {
    ViewingStatus.CONTACTED: (
        "📞 An agent will contact you",
        "Your viewing request for {name} was received by our agent.",
        NotificationType.INFO,
    ),
    ViewingStatus.SCHEDULED: (
        "📅 Viewing scheduled",
        "Your viewing of {name} is confirmed for {date} ({slot}).",
        NotificationType.SUCCESS,
    ),
    ViewingStatus.COMPLETED: (
        "✅ How was your viewing?",
        "Thanks for visiting {name}. Let us know what you thought!",
        NotificationType.SUCCESS,
    ),
    ViewingStatus.CANCELLED: (
        "Viewing cancelled",
        "Your viewing request for {name} was cancelled.",
        NotificationType.WARNING,
    ),
}


def create_request(
    db: Session, user_id: str, data: ViewingRequestIn, context: ClientContext | None = None
) -> ViewingRequest:
    if data.preferred_date < date.today():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Date must not be in the past")
    if db.get(Property, data.property_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Property not found")

    existing = db.scalar(
        select(ViewingRequest.id).where(
            ViewingRequest.user_id == user_id,
            ViewingRequest.property_id == data.property_id,
            ViewingRequest.status.in_(OPEN_VIEWING_STATUSES),
        )
    )
    if existing:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "You already have an open request for this property"
        )

    request = ViewingRequest(id=new_id(), user_id=user_id, **data.model_dump())
    db.add(request)
    try:
        # Recording the event flushes the request, so a concurrent duplicate is
        # caught here by the partial unique index.
        record_server_event(
            db,
            "viewing_requested",
            user_id=user_id,
            context=context,
            property_id=data.property_id,
            request_id=request.id,
            time_slot=data.time_slot.value,
            days_ahead=(data.preferred_date - date.today()).days,
        )
        db.commit()
    except IntegrityError as exc:  # concurrent duplicate caught by the partial unique index
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT, "You already have an open request for this property"
        ) from exc
    db.refresh(request)
    return request


def change_status(
    db: Session,
    request: ViewingRequest,
    new_status: ViewingStatus,
    *,
    changed_by: Literal["agent", "user"],
    context: ClientContext | None = None,
) -> None:
    if new_status not in VIEWING_TRANSITIONS[request.status]:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Cannot move a request from '{request.status}' to '{new_status}'",
        )
    old_status = request.status
    request.status = new_status
    record_server_event(
        db,
        "viewing_status_changed",
        user_id=request.user_id,
        # The agent's session isn't the user's, so only user actions carry context.
        context=context if changed_by == "user" else None,
        property_id=request.property_id,
        request_id=request.id,
        from_status=old_status.value,
        to_status=new_status.value,
        changed_by=changed_by,
    )

    title, template, kind = STATUS_MESSAGES[new_status]
    create_notification(
        db,
        user_id=request.user_id,
        kind=NotificationKind.VIEWING_STATUS,
        title=title,
        message=template.format(
            name=request.property.name,
            date=request.preferred_date.strftime("%a %d %b"),
            slot=request.time_slot.value,
        ),
        type=kind,
        property_id=request.property_id,
    )
    db.commit()
    db.refresh(request)
