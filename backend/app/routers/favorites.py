from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert

from app.events.recorder import ClientContext, client_context, record_server_event
from app.models import Favorite, Property
from app.schemas import PropertySummary
from app.security import CurrentUser, DbSession

router = APIRouter(prefix="/favorites", tags=["favorites"])
Context = Annotated[ClientContext, Depends(client_context)]


@router.get("", response_model=list[PropertySummary])
def list_favorites(db: DbSession, user: CurrentUser) -> list[Property]:
    return list(
        db.scalars(
            select(Property)
            .join(Favorite, Favorite.property_id == Property.id)
            .where(Favorite.user_id == user.id)
            .order_by(Favorite.created_at.desc())
        )
    )


@router.get("/ids", response_model=list[str])
def list_favorite_ids(db: DbSession, user: CurrentUser) -> list[str]:
    return list(db.scalars(select(Favorite.property_id).where(Favorite.user_id == user.id)))


@router.put("/{property_id}", status_code=status.HTTP_204_NO_CONTENT)
def add_favorite(property_id: str, db: DbSession, user: CurrentUser, context: Context) -> Response:
    """Idempotent: saving an already-saved property is a no-op (and records no event)."""
    if db.get(Property, property_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Property not found")
    inserted = db.execute(
        insert(Favorite)
        .values(user_id=user.id, property_id=property_id)
        .on_conflict_do_nothing()
        .returning(Favorite.property_id)
    ).first()
    if inserted:
        record_server_event(
            db, "favorite_added", user_id=user.id, context=context, property_id=property_id
        )
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/{property_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_favorite(
    property_id: str, db: DbSession, user: CurrentUser, context: Context
) -> Response:
    """Idempotent: removing a property that isn't saved is a no-op (and records no event)."""
    removed = db.execute(
        delete(Favorite)
        .where(Favorite.user_id == user.id, Favorite.property_id == property_id)
        .returning(Favorite.property_id)
    ).first()
    if removed:
        record_server_event(
            db, "favorite_removed", user_id=user.id, context=context, property_id=property_id
        )
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
