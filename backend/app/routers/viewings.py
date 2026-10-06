from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select

from app.events.recorder import ClientContext, client_context
from app.models import ViewingRequest, ViewingStatus
from app.schemas import ViewingRequestIn, ViewingRequestOut, ViewingStatusUpdateIn
from app.security import AdminUser, CurrentUser, DbSession
from app.services import viewings

router = APIRouter(tags=["viewing requests"])
Context = Annotated[ClientContext, Depends(client_context)]


def _get_own_request(db: DbSession, request_id: str, user_id: str) -> ViewingRequest:
    request = db.get(ViewingRequest, request_id)
    if request is None or request.user_id != user_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Viewing request not found")
    return request


@router.post(
    "/viewing-requests", response_model=ViewingRequestOut, status_code=status.HTTP_201_CREATED
)
def create_viewing_request(
    body: ViewingRequestIn, db: DbSession, user: CurrentUser, context: Context
) -> ViewingRequest:
    return viewings.create_request(db, user.id, body, context)


@router.get("/viewing-requests", response_model=list[ViewingRequestOut])
def list_my_viewing_requests(
    db: DbSession,
    user: CurrentUser,
    property_id: Annotated[str | None, Query()] = None,
) -> list[ViewingRequest]:
    query = select(ViewingRequest).where(ViewingRequest.user_id == user.id)
    if property_id:
        query = query.where(ViewingRequest.property_id == property_id)
    return list(db.scalars(query.order_by(ViewingRequest.created_at.desc())))


@router.post("/viewing-requests/{request_id}/cancel", response_model=ViewingRequestOut)
def cancel_viewing_request(
    request_id: str, db: DbSession, user: CurrentUser, context: Context
) -> ViewingRequest:
    request = _get_own_request(db, request_id, user.id)
    viewings.change_status(db, request, ViewingStatus.CANCELLED, changed_by="user", context=context)
    return request


# --- admin: moves requests through the pipeline (stands in for an agent dashboard) ---


@router.get("/admin/viewing-requests", response_model=list[ViewingRequestOut])
def list_all_viewing_requests(
    db: DbSession,
    _admin: AdminUser,
    status_filter: Annotated[ViewingStatus | None, Query(alias="status")] = None,
) -> list[ViewingRequest]:
    query = select(ViewingRequest)
    if status_filter:
        query = query.where(ViewingRequest.status == status_filter)
    return list(db.scalars(query.order_by(ViewingRequest.created_at.desc()).limit(200)))


@router.patch("/admin/viewing-requests/{request_id}", response_model=ViewingRequestOut)
def update_viewing_status(
    request_id: str, body: ViewingStatusUpdateIn, db: DbSession, _admin: AdminUser
) -> ViewingRequest:
    request = db.get(ViewingRequest, request_id)
    if request is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Viewing request not found")
    viewings.change_status(db, request, body.status, changed_by="agent")
    return request
