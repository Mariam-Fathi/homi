from fastapi import APIRouter, Response, status
from sqlalchemy import delete, select

from app.models import Event
from app.schemas import UserOut
from app.security import CurrentUser, DbSession

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserOut)
def read_me(user: CurrentUser) -> UserOut:
    return UserOut.model_validate(user)


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_me(user: CurrentUser, db: DbSession) -> Response:
    """Permanently deletes the account; favorites, views, notifications, viewing
    requests and analytics events are removed by ON DELETE CASCADE. Events recorded
    before sign-in on the same devices are deleted too, since the device id links
    them to this person."""
    device_ids = select(Event.anonymous_id).where(
        Event.user_id == user.id, Event.anonymous_id.is_not(None)
    )
    db.execute(delete(Event).where(Event.user_id.is_(None), Event.anonymous_id.in_(device_ids)))
    db.delete(user)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
