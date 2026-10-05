from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy import select, update

from app.models import Notification
from app.schemas import NewPropertiesCheckOut, NotificationOut
from app.security import CurrentUser, DbSession
from app.services.recommendations import check_new_properties

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=list[NotificationOut])
def list_notifications(db: DbSession, user: CurrentUser) -> list[Notification]:
    return list(
        db.scalars(
            select(Notification)
            .where(Notification.user_id == user.id)
            .order_by(Notification.created_at.desc())
            .limit(50)
        )
    )


@router.post("/{notification_id}/read", status_code=status.HTTP_204_NO_CONTENT)
def mark_read(notification_id: str, db: DbSession, user: CurrentUser) -> Response:
    notification = db.get(Notification, notification_id)
    # 404 rather than 403 for other users' notifications, so ids can't be probed.
    if notification is None or notification.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Notification not found")
    notification.is_read = True
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/read-all", status_code=status.HTTP_204_NO_CONTENT)
def mark_all_read(db: DbSession, user: CurrentUser) -> Response:
    db.execute(
        update(Notification)
        .where(Notification.user_id == user.id, Notification.is_read.is_(False))
        .values(is_read=True)
    )
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/check-new-properties", response_model=NewPropertiesCheckOut)
def run_new_properties_check(db: DbSession, user: CurrentUser) -> NewPropertiesCheckOut:
    result = check_new_properties(db, user.id)
    return NewPropertiesCheckOut(
        reason=result.reason,
        notification=NotificationOut.model_validate(result.notification)
        if result.notification
        else None,
    )
