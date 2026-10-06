"""Machine-readable version of docs/tracking-plan.md.

Each event has a pydantic model for its properties (unknown properties are rejected)
and a source: events marked "server" are recorded by the API itself and can't be
sent by the app, so outcomes such as `viewing_requested` can't be faked. "both" is for
events either side can observe (exposure to a server-side experiment, for example).
"""

from dataclasses import dataclass
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Source = Literal["app", "server", "both"]


class Props(BaseModel):
    model_config = ConfigDict(extra="forbid")


class NoProps(Props):
    pass


PropertyList = Literal["featured", "home", "explore", "favorites"]
Screen = Literal[
    "auth", "home", "explore", "property", "favorites", "notifications", "viewings", "profile"
]
ViewingStatusName = Literal["requested", "contacted", "scheduled", "completed", "cancelled"]
NotificationKindName = Literal["welcome", "recommendation", "viewing_status"]
PropertyId = Field(min_length=1, max_length=36)

# --- session & account ----------------------------------------------------------


class AppOpened(Props):
    cold_start: bool


class ScreenViewed(Props):
    screen: Screen


class SignInFailed(Props):
    reason: Literal["invalid_name", "invalid_phone", "not_mobile", "server_error"]


class SignedUp(Props):
    method: Literal["phone", "guest"]


class SignedIn(Props):
    method: Literal["phone"]


# --- discovery -------------------------------------------------------------------


class SearchPerformed(Props):
    query: str = Field(max_length=100)
    results_count: int = Field(ge=0)


class FilterApplied(Props):
    filter: str = Field(max_length=50)
    results_count: int = Field(ge=0)


class PropertyImpression(Props):
    property_id: str = PropertyId
    list: PropertyList
    position: int = Field(ge=0)


class PropertyCardClicked(PropertyImpression):
    pass


class PropertyViewed(Props):
    property_id: str = PropertyId
    source: Literal["card", "notification", "viewings", "push", "link"]


# --- engagement & conversion ---------------------------------------------------------


class PropertyOnly(Props):
    property_id: str = PropertyId


class ViewingFormValidationFailed(PropertyOnly):
    field: Literal["phone"]


class ViewingFormAbandoned(PropertyOnly):
    seconds_open: int = Field(ge=0)


class ViewingRequested(PropertyOnly):
    request_id: str
    time_slot: Literal["morning", "afternoon", "evening"]
    days_ahead: int = Field(ge=0)


class ViewingStatusChanged(PropertyOnly):
    request_id: str
    from_status: ViewingStatusName
    to_status: ViewingStatusName
    changed_by: Literal["agent", "user"]


# --- notifications ---------------------------------------------------------------------


class NotificationCreated(Props):
    notification_id: str
    kind: NotificationKindName
    property_id: str | None


class NotificationOpened(Props):
    notification_id: str | None
    kind: NotificationKindName
    property_id: str | None
    via: Literal["list", "push"]


# --- experiments -------------------------------------------------------------------------


class ExperimentExposed(Props):
    experiment: str = Field(max_length=64)
    variant: str = Field(max_length=32)


@dataclass(frozen=True)
class EventSpec:
    source: Source
    props: type[Props]


EVENTS: dict[str, EventSpec] = {
    "app_opened": EventSpec("app", AppOpened),
    "screen_viewed": EventSpec("app", ScreenViewed),
    "sign_in_failed": EventSpec("app", SignInFailed),
    "signed_up": EventSpec("server", SignedUp),
    "signed_in": EventSpec("server", SignedIn),
    "signed_out": EventSpec("app", NoProps),
    "search_performed": EventSpec("app", SearchPerformed),
    "filter_applied": EventSpec("app", FilterApplied),
    "property_impression": EventSpec("app", PropertyImpression),
    "property_card_clicked": EventSpec("app", PropertyCardClicked),
    "property_viewed": EventSpec("app", PropertyViewed),
    "favorite_added": EventSpec("server", PropertyOnly),
    "favorite_removed": EventSpec("server", PropertyOnly),
    "viewing_form_opened": EventSpec("app", PropertyOnly),
    "viewing_form_validation_failed": EventSpec("app", ViewingFormValidationFailed),
    "viewing_form_abandoned": EventSpec("app", ViewingFormAbandoned),
    "viewing_requested": EventSpec("server", ViewingRequested),
    "viewing_status_changed": EventSpec("server", ViewingStatusChanged),
    "notification_created": EventSpec("server", NotificationCreated),
    "notification_opened": EventSpec("app", NotificationOpened),
    # The app records exposure to UI experiments; the server to server-side ones
    # (e.g. which model chose a recommendation).
    "experiment_exposed": EventSpec("both", ExperimentExposed),
}


def export_plan() -> dict:
    """The registry as JSON Schema, committed to shared/tracking-plan.json so the app's
    event types can be checked against it."""
    return {
        name: {"source": spec.source, "properties": spec.props.model_json_schema()}
        for name, spec in sorted(EVENTS.items())
    }
