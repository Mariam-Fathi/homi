from sqlalchemy.orm import Session

from app.events.recorder import ClientContext, record_server_event
from app.models import Notification, NotificationKind, NotificationType, new_id


def create_notification(
    db: Session,
    *,
    user_id: str,
    kind: NotificationKind,
    title: str,
    message: str,
    type: NotificationType = NotificationType.INFO,
    property_id: str | None = None,
    context: ClientContext | None = None,
) -> Notification:
    """Adds a notification and its `notification_created` event to the transaction.
    Every notification goes through here so none is missing from analytics."""
    notification = Notification(
        id=new_id(),
        user_id=user_id,
        kind=kind,
        title=title,
        message=message,
        type=type,
        related_property_id=property_id,
    )
    db.add(notification)
    record_server_event(
        db,
        "notification_created",
        user_id=user_id,
        context=context,
        notification_id=notification.id,
        kind=kind.value,
        property_id=property_id,
    )
    return notification
