from fastapi import APIRouter, Response, status

from app.schemas import UserOut
from app.security import CurrentUser, DbSession

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserOut)
def read_me(user: CurrentUser) -> UserOut:
    return UserOut.model_validate(user)


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_me(user: CurrentUser, db: DbSession) -> Response:
    """Permanently deletes the account; favorites, views, notifications and viewing
    requests are removed by ON DELETE CASCADE."""
    db.delete(user)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
