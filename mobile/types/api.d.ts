/**
 * Shapes returned by the Homi API (backend/app/schemas.py). Keep the two in sync.
 */

export type UserRole = "user" | "admin";

export interface User {
  id: string;
  name: string;
  /** International (E.164) format, e.g. +201001234567. Null for guests. */
  phone: string | null;
  is_demo: boolean;
  role: UserRole;
}

export interface TokenResponse {
  access_token: string;
  token_type: "bearer";
  user: User;
}

export interface Agent {
  id: string;
  name: string;
  email: string;
  phone: string | null;
}

export interface Review {
  id: string;
  reviewer_name: string;
  text: string;
  rating: number;
  created_at: string;
}

export interface GalleryImage {
  id: string;
  image_url: string;
}

export interface PropertySummary {
  id: string;
  name: string;
  type: string;
  address: string;
  price: number;
  area: number;
  bedrooms: number;
  bathrooms: number;
  rating: number;
  image_url: string;
  created_at: string;
}

export interface PropertyDetail extends PropertySummary {
  description: string;
  facilities: string[];
  agent: Agent | null;
  reviews: Review[];
  review_count: number;
  gallery: GalleryImage[];
}

export interface PropertyPage {
  items: PropertySummary[];
  total: number;
  limit: number;
  offset: number;
}

export type NotificationType = "info" | "success" | "warning" | "error";

export type NotificationKind = "welcome" | "recommendation" | "viewing_status";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  message: string;
  type: NotificationType;
  is_read: boolean;
  related_property_id: string | null;
  created_at: string;
}

export interface NewPropertiesCheck {
  reason: "welcome" | "new_match" | "no_preference_yet" | "no_new_matches";
  notification: AppNotification | null;
}

export type TimeSlot = "morning" | "afternoon" | "evening";

export type ViewingStatus =
  | "requested"
  | "contacted"
  | "scheduled"
  | "completed"
  | "cancelled";

export interface ViewingRequest {
  id: string;
  property_id: string;
  preferred_date: string;
  time_slot: TimeSlot;
  phone: string;
  message: string | null;
  status: ViewingStatus;
  created_at: string;
  updated_at: string;
  property: PropertySummary;
}

export interface ViewingRequestInput {
  property_id: string;
  preferred_date: string; // YYYY-MM-DD
  time_slot: TimeSlot;
  phone: string;
  message?: string;
}
