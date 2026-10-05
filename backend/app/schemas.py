from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models import NotificationType, TimeSlot, UserRole, ViewingStatus
from app.phone import normalize_phone


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --- users & auth -------------------------------------------------------------


class UserOut(ORMModel):
    id: str
    name: str
    phone: str | None
    is_demo: bool
    role: UserRole


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class PhoneLoginIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    phone: str = Field(min_length=4, max_length=30)
    country: str = Field(min_length=2, max_length=2, description="ISO 3166 alpha-2 code, e.g. EG")

    @field_validator("name")
    @classmethod
    def _clean_name(cls, value: str) -> str:
        cleaned = " ".join(value.split())
        if len(cleaned) < 2:
            raise ValueError("Name must be at least 2 characters")
        return cleaned

    @model_validator(mode="after")
    def _normalize_phone(self) -> "PhoneLoginIn":
        self.phone = normalize_phone(self.phone, self.country, mobile_only=True)
        return self


# --- properties ---------------------------------------------------------------


class AgentOut(ORMModel):
    id: str
    name: str
    email: str
    phone: str | None


class ReviewOut(ORMModel):
    id: str
    reviewer_name: str
    text: str
    rating: int
    created_at: datetime


class GalleryImageOut(ORMModel):
    id: str
    image_url: str


class PropertySummary(ORMModel):
    """What list screens need. Detail-only fields are left out to keep lists small."""

    id: str
    name: str
    type: str
    address: str
    price: int
    area: int
    bedrooms: int
    bathrooms: int
    rating: float
    image_url: str
    created_at: datetime


class PropertyDetail(PropertySummary):
    description: str
    facilities: list[str]
    agent: AgentOut | None
    reviews: list[ReviewOut]
    review_count: int
    gallery: list[GalleryImageOut]


class PropertyPage(BaseModel):
    items: list[PropertySummary]
    total: int
    limit: int
    offset: int


# --- notifications ------------------------------------------------------------


class NotificationOut(ORMModel):
    id: str
    title: str
    message: str
    type: NotificationType
    is_read: bool
    related_property_id: str | None
    created_at: datetime


class NewPropertiesCheckOut(BaseModel):
    """Result of the "new properties you might like" check.

    `notification` is set when a new notification was created, so the app can also
    show it as a local push notification.
    """

    reason: str
    notification: NotificationOut | None = None


# --- viewing requests ----------------------------------------------------------


class ViewingRequestIn(BaseModel):
    property_id: str
    preferred_date: date
    time_slot: TimeSlot
    phone: str = Field(min_length=4, max_length=30, description="International format: +20...")
    message: str | None = Field(default=None, max_length=1000)

    @field_validator("phone")
    @classmethod
    def _valid_phone(cls, value: str) -> str:
        return normalize_phone(value)


class ViewingRequestOut(ORMModel):
    id: str
    property_id: str
    preferred_date: date
    time_slot: TimeSlot
    phone: str
    message: str | None
    status: ViewingStatus
    created_at: datetime
    updated_at: datetime
    property: PropertySummary


class ViewingStatusUpdateIn(BaseModel):
    status: ViewingStatus
