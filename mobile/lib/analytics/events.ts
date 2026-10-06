/**
 * Events the app sends, with their properties, as defined in docs/tracking-plan.md.
 * Events recorded by the server (sign-ups, favorites, viewing requests...) are not
 * here. A test checks these names against shared/tracking-plan.json.
 */

export type PropertyList = "featured" | "home" | "explore" | "favorites";
export type Screen =
  | "auth"
  | "home"
  | "explore"
  | "property"
  | "favorites"
  | "notifications"
  | "viewings"
  | "profile";
export type PropertyViewSource =
  | "card"
  | "notification"
  | "viewings"
  | "push"
  | "link";
export type NotificationKind = "welcome" | "recommendation" | "viewing_status";

export interface AppEvents {
  app_opened: { cold_start: boolean };
  screen_viewed: { screen: Screen };
  sign_in_failed: {
    reason: "invalid_name" | "invalid_phone" | "not_mobile" | "server_error";
  };
  signed_out: Record<string, never>;
  search_performed: { query: string; results_count: number };
  filter_applied: { filter: string; results_count: number };
  property_impression: {
    property_id: string;
    list: PropertyList;
    position: number;
  };
  property_card_clicked: {
    property_id: string;
    list: PropertyList;
    position: number;
  };
  property_viewed: { property_id: string; source: PropertyViewSource };
  viewing_form_opened: { property_id: string };
  viewing_form_validation_failed: { property_id: string; field: "phone" };
  viewing_form_abandoned: { property_id: string; seconds_open: number };
  notification_opened: {
    notification_id: string | null;
    kind: NotificationKind;
    property_id: string | null;
    via: "list" | "push";
  };
}

export type AppEventName = keyof AppEvents;

/** Runtime list of the names above, used by the contract test. */
export const APP_EVENT_NAMES: AppEventName[] = [
  "app_opened",
  "screen_viewed",
  "sign_in_failed",
  "signed_out",
  "search_performed",
  "filter_applied",
  "property_impression",
  "property_card_clicked",
  "property_viewed",
  "viewing_form_opened",
  "viewing_form_validation_failed",
  "viewing_form_abandoned",
  "notification_opened",
];
