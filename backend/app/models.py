"""Database schema.

Every table that belongs to a user cascades on user deletion, so deleting an account
removes all of that person's data in a single statement.
"""

import enum
import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def new_id() -> str:
    return str(uuid.uuid4())


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )


class UserRole(enum.StrEnum):
    USER = "user"
    ADMIN = "admin"


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(200))
    # E.164 (e.g. +201001234567). Null for guest accounts.
    phone: Mapped[str | None] = mapped_column(String(20), unique=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="user_role", values_callable=lambda e: [m.value for m in e]),
        default=UserRole.USER,
    )


class Agent(TimestampMixin, Base):
    __tablename__ = "agents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(200))
    email: Mapped[str] = mapped_column(String(320))
    phone: Mapped[str | None] = mapped_column(String(50))


class Property(TimestampMixin, Base):
    __tablename__ = "properties"
    __table_args__ = (
        CheckConstraint("price >= 0", name="price_non_negative"),
        CheckConstraint("rating >= 0 AND rating <= 5", name="rating_range"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(200))
    type: Mapped[str] = mapped_column(String(50), index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    address: Mapped[str] = mapped_column(String(300))
    price: Mapped[int] = mapped_column(Integer)  # EGP
    area: Mapped[int] = mapped_column(Integer)  # sqft
    bedrooms: Mapped[int] = mapped_column(Integer)
    bathrooms: Mapped[int] = mapped_column(Integer)
    rating: Mapped[float] = mapped_column(Float, default=0)
    image_url: Mapped[str] = mapped_column(Text)
    facilities: Mapped[list[str]] = mapped_column(ARRAY(String(50)), default=list)
    agent_id: Mapped[str | None] = mapped_column(ForeignKey("agents.id", ondelete="SET NULL"))

    agent: Mapped[Agent | None] = relationship(lazy="joined")
    reviews: Mapped[list["Review"]] = relationship(
        back_populates="property",
        order_by="Review.created_at.desc()",
        cascade="all, delete-orphan",
    )
    gallery: Mapped[list["GalleryImage"]] = relationship(
        order_by="GalleryImage.position", cascade="all, delete-orphan"
    )

    @property
    def review_count(self) -> int:
        return len(self.reviews)


class Review(TimestampMixin, Base):
    __tablename__ = "reviews"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    property_id: Mapped[str] = mapped_column(
        ForeignKey("properties.id", ondelete="CASCADE"), index=True
    )
    reviewer_name: Mapped[str] = mapped_column(String(200))
    text: Mapped[str] = mapped_column(Text)
    rating: Mapped[int] = mapped_column(Integer)

    property: Mapped[Property] = relationship(back_populates="reviews")


class GalleryImage(Base):
    __tablename__ = "gallery_images"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    property_id: Mapped[str] = mapped_column(
        ForeignKey("properties.id", ondelete="CASCADE"), index=True
    )
    image_url: Mapped[str] = mapped_column(Text)
    position: Mapped[int] = mapped_column(Integer, default=0)


class Favorite(TimestampMixin, Base):
    __tablename__ = "favorites"

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    property_id: Mapped[str] = mapped_column(
        ForeignKey("properties.id", ondelete="CASCADE"), primary_key=True
    )


class PropertyView(TimestampMixin, Base):
    """A user opening a property. Feeds preference analysis (and later, analytics)."""

    __tablename__ = "property_views"
    __table_args__ = (Index("ix_property_views_user_created", "user_id", "created_at"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    property_id: Mapped[str] = mapped_column(ForeignKey("properties.id", ondelete="CASCADE"))


class NotificationType(enum.StrEnum):
    INFO = "info"
    SUCCESS = "success"
    WARNING = "warning"
    ERROR = "error"


class NotificationKind(enum.StrEnum):
    WELCOME = "welcome"
    RECOMMENDATION = "recommendation"
    VIEWING_STATUS = "viewing_status"


class Notification(TimestampMixin, Base):
    __tablename__ = "notifications"
    __table_args__ = (Index("ix_notifications_user_created", "user_id", "created_at"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(200))
    message: Mapped[str] = mapped_column(Text)
    type: Mapped[NotificationType] = mapped_column(
        Enum(
            NotificationType,
            name="notification_type",
            values_callable=lambda e: [m.value for m in e],
        ),
        default=NotificationType.INFO,
    )
    kind: Mapped[NotificationKind] = mapped_column(
        Enum(
            NotificationKind,
            name="notification_kind",
            values_callable=lambda e: [m.value for m in e],
        )
    )
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    related_property_id: Mapped[str | None] = mapped_column(
        ForeignKey("properties.id", ondelete="SET NULL")
    )


class ViewingStatus(enum.StrEnum):
    """Lead pipeline: each transition notifies the user."""

    REQUESTED = "requested"
    CONTACTED = "contacted"
    SCHEDULED = "scheduled"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


# Allowed status transitions; anything else is rejected.
VIEWING_TRANSITIONS: dict[ViewingStatus, set[ViewingStatus]] = {
    ViewingStatus.REQUESTED: {ViewingStatus.CONTACTED, ViewingStatus.CANCELLED},
    ViewingStatus.CONTACTED: {ViewingStatus.SCHEDULED, ViewingStatus.CANCELLED},
    ViewingStatus.SCHEDULED: {ViewingStatus.COMPLETED, ViewingStatus.CANCELLED},
    ViewingStatus.COMPLETED: set(),
    ViewingStatus.CANCELLED: set(),
}

OPEN_VIEWING_STATUSES = (
    ViewingStatus.REQUESTED,
    ViewingStatus.CONTACTED,
    ViewingStatus.SCHEDULED,
)


class TimeSlot(enum.StrEnum):
    MORNING = "morning"
    AFTERNOON = "afternoon"
    EVENING = "evening"


class ViewingRequest(TimestampMixin, Base):
    __tablename__ = "viewing_requests"
    __table_args__ = (
        # At most one open request per user and property.
        Index(
            "uq_viewing_requests_open",
            "user_id",
            "property_id",
            unique=True,
            postgresql_where=text("status IN ('requested', 'contacted', 'scheduled')"),
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    property_id: Mapped[str] = mapped_column(
        ForeignKey("properties.id", ondelete="CASCADE"), index=True
    )
    preferred_date: Mapped[date] = mapped_column(Date)
    time_slot: Mapped[TimeSlot] = mapped_column(
        Enum(TimeSlot, name="time_slot", values_callable=lambda e: [m.value for m in e])
    )
    phone: Mapped[str] = mapped_column(String(30))
    message: Mapped[str | None] = mapped_column(Text)
    status: Mapped[ViewingStatus] = mapped_column(
        Enum(
            ViewingStatus,
            name="viewing_status",
            values_callable=lambda e: [m.value for m in e],
        ),
        default=ViewingStatus.REQUESTED,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    property: Mapped[Property] = relationship(lazy="joined")


class Event(Base):
    """One analytics event, as defined in docs/tracking-plan.md. Append-only."""

    __tablename__ = "events"
    __table_args__ = (
        Index("ix_events_name_occurred", "event_name", "occurred_at"),
        Index("ix_events_user_occurred", "user_id", "occurred_at"),
        Index("ix_events_session", "session_id"),
        Index("ix_events_anonymous", "anonymous_id"),
    )

    # Generated by the sender; a retried upload reuses it, so it's stored once.
    event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    event_name: Mapped[str] = mapped_column(String(64))
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    # True when occurred_at was replaced because the sender's clock was far ahead.
    clock_adjusted: Mapped[bool] = mapped_column(Boolean, default=False)
    # From the login token, never from the event body. Deleting a user deletes their events.
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    anonymous_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    session_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    platform: Mapped[str] = mapped_column(String(10))
    app_version: Mapped[str] = mapped_column(String(32))
    properties: Mapped[dict] = mapped_column(JSONB, default=dict)
