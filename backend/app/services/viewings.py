"""Viewing-request pipeline: creation, cancellation and status transitions.

Each status change notifies the requester, mirroring how order-status updates
drive customer messages in a sales pipeline.
"""

from datetime import date

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import (
    OPEN_VIEWING_STATUSES,
    VIEWING_TRANSITIONS,
    Notification,
    NotificationType,
    Property,
    ViewingRequest,
    ViewingStatus,
)
from app.schemas import ViewingRequestIn

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


def create_request(db: Session, user_id: str, data: ViewingRequestIn) -> ViewingRequest:
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

    request = ViewingRequest(user_id=user_id, **data.model_dump())
    db.add(request)
    try:
        db.commit()
    except IntegrityError as exc:  # concurrent duplicate caught by the partial unique index
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT, "You already have an open request for this property"
        ) from exc
    db.refresh(request)
    return request


def change_status(db: Session, request: ViewingRequest, new_status: ViewingStatus) -> None:
    if new_status not in VIEWING_TRANSITIONS[request.status]:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Cannot move a request from '{request.status}' to '{new_status}'",
        )
    request.status = new_status

    title, template, kind = STATUS_MESSAGES[new_status]
    db.add(
        Notification(
            user_id=request.user_id,
            title=title,
            message=template.format(
                name=request.property.name,
                date=request.preferred_date.strftime("%a %d %b"),
                slot=request.time_slot.value,
            ),
            type=kind,
            related_property_id=request.property_id,
        )
    )
    db.commit()
    db.refresh(request)
