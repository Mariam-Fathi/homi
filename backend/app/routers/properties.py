from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import selectinload

from app.models import Property, PropertyView
from app.schemas import PropertyDetail, PropertyPage, PropertySummary
from app.security import CurrentUser, DbSession

router = APIRouter(prefix="/properties", tags=["properties"])

FEATURED_COUNT = 5


@router.get("", response_model=PropertyPage)
def list_properties(
    db: DbSession,
    _user: CurrentUser,
    type: Annotated[str | None, Query(description="Property type; 'All' or omit for any")] = None,
    q: Annotated[str | None, Query(max_length=100, description="Search name/address/type")] = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> PropertyPage:
    filters = []
    if type and type != "All":
        filters.append(Property.type == type)
    if q and q.strip():
        pattern = f"%{q.strip()}%"
        filters.append(
            or_(
                Property.name.ilike(pattern),
                Property.address.ilike(pattern),
                Property.type.ilike(pattern),
            )
        )

    total = db.scalar(select(func.count()).select_from(Property).where(*filters)) or 0
    items = db.scalars(
        select(Property)
        .where(*filters)
        .order_by(Property.created_at.desc(), Property.id)
        .limit(limit)
        .offset(offset)
    ).all()
    return PropertyPage(
        items=[PropertySummary.model_validate(p) for p in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/featured", response_model=list[PropertySummary])
def featured_properties(db: DbSession, _user: CurrentUser) -> list[Property]:
    return list(
        db.scalars(
            select(Property).order_by(Property.created_at.desc(), Property.id).limit(FEATURED_COUNT)
        )
    )


@router.get("/{property_id}", response_model=PropertyDetail)
def get_property(property_id: str, db: DbSession, _user: CurrentUser) -> Property:
    prop = db.scalar(
        select(Property)
        .where(Property.id == property_id)
        .options(selectinload(Property.reviews), selectinload(Property.gallery))
    )
    if prop is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Property not found")
    return prop


@router.post("/{property_id}/views", status_code=status.HTTP_204_NO_CONTENT)
def record_view(property_id: str, db: DbSession, user: CurrentUser) -> Response:
    if db.get(Property, property_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Property not found")
    db.add(PropertyView(user_id=user.id, property_id=property_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
