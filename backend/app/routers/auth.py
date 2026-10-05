import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.config import Settings, get_settings
from app.models import User
from app.schemas import PhoneLoginIn, TokenOut, UserOut
from app.security import DbSession, create_access_token

router = APIRouter(prefix="/auth", tags=["auth"])

SettingsDep = Annotated[Settings, Depends(get_settings)]


def _token_response(user: User, settings: Settings) -> TokenOut:
    return TokenOut(
        access_token=create_access_token(user.id, settings),
        user=UserOut.model_validate(user),
    )


@router.post("/phone", response_model=TokenOut)
def login_with_phone(body: PhoneLoginIn, db: DbSession, settings: SettingsDep) -> TokenOut:
    """Signs in with a name and phone number, creating the account on first use.

    The number is validated against the country's numbering rules but ownership is
    not verified (no SMS code) — a deliberate trade-off for this demo app. Production
    use would add a one-time code before issuing the token.
    """
    user = db.scalar(select(User).where(User.phone == body.phone))
    if user is None:
        user = User(name=body.name, phone=body.phone)
        db.add(user)
        try:
            db.commit()
        except IntegrityError:  # the same number signed up concurrently
            db.rollback()
            user = db.scalar(select(User).where(User.phone == body.phone))
    # An existing account keeps its name, so typing someone's number can't rename them.
    db.refresh(user)
    return _token_response(user, settings)


@router.post("/demo", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
def login_as_guest(db: DbSession, settings: SettingsDep) -> TokenOut:
    """Creates a fresh guest account so the app can be tried without signing up."""
    if not settings.demo_login_enabled:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Demo login is disabled")

    user = User(name=f"Guest {secrets.token_hex(3)}", is_demo=True)
    db.add(user)
    db.commit()
    db.refresh(user)
    return _token_response(user, settings)
