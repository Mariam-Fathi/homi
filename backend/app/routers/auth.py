import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.config import Settings, get_settings
from app.events.recorder import ClientContext, client_context, record_server_event
from app.models import User, new_id
from app.schemas import PhoneLoginIn, TokenOut, UserOut
from app.security import DbSession, create_access_token

router = APIRouter(prefix="/auth", tags=["auth"])

SettingsDep = Annotated[Settings, Depends(get_settings)]
Context = Annotated[ClientContext, Depends(client_context)]


def _token_response(user: User, settings: Settings) -> TokenOut:
    return TokenOut(
        access_token=create_access_token(user.id, settings),
        user=UserOut.model_validate(user),
    )


@router.post("/phone", response_model=TokenOut)
def login_with_phone(
    body: PhoneLoginIn, db: DbSession, settings: SettingsDep, context: Context
) -> TokenOut:
    """Signs in with a name and phone number, creating the account on first use.

    The number is validated against the country's numbering rules but ownership is
    not verified (no SMS code) — a deliberate trade-off for this demo app. Production
    use would add a one-time code before issuing the token.
    """
    user = db.scalar(select(User).where(User.phone == body.phone))
    if user is not None:
        record_server_event(db, "signed_in", user_id=user.id, context=context, method="phone")
        db.commit()
    else:
        user = User(id=new_id(), name=body.name, phone=body.phone)
        db.add(user)
        try:
            # Flushes the new user, so a concurrent sign-up with the same number
            # fails here on the unique phone constraint.
            record_server_event(db, "signed_up", user_id=user.id, context=context, method="phone")
            db.commit()
        except IntegrityError:
            db.rollback()
            user = db.scalar(select(User).where(User.phone == body.phone))
            record_server_event(db, "signed_in", user_id=user.id, context=context, method="phone")
            db.commit()
    # An existing account keeps its name, so typing someone's number can't rename them.
    db.refresh(user)
    return _token_response(user, settings)


@router.post("/demo", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
def login_as_guest(db: DbSession, settings: SettingsDep, context: Context) -> TokenOut:
    """Creates a fresh guest account so the app can be tried without signing up."""
    if not settings.demo_login_enabled:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Demo login is disabled")

    user = User(id=new_id(), name=f"Guest {secrets.token_hex(3)}", is_demo=True)
    db.add(user)
    record_server_event(db, "signed_up", user_id=user.id, context=context, method="guest")
    db.commit()
    db.refresh(user)
    return _token_response(user, settings)
