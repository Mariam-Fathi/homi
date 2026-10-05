import type {
  AppNotification,
  NewPropertiesCheck,
  PropertyDetail,
  PropertyPage,
  PropertySummary,
  TokenResponse,
  User,
  ViewingRequest,
  ViewingRequestInput,
} from "@/types/api";
import { API_URL } from "./config";
import { tokenStorage } from "./tokenStorage";

if (!API_URL) {
  throw new Error(
    "Missing EXPO_PUBLIC_API_URL. Copy .env.example to .env and point it at the Homi API."
  );
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// Called when the API rejects our token (expired or the account was deleted).
let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (handler: (() => void) | null) => {
  onUnauthorized = handler;
};

type Query = Record<string, string | number | undefined>;

async function request<T>(
  method: string,
  path: string,
  { body, query, auth = true }: { body?: unknown; query?: Query; auth?: boolean } = {}
): Promise<T> {
  const url = new URL(path, API_URL);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) {
    const token = await tokenStorage.get();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection and try again.");
  }

  if (response.status === 401 && auth) onUnauthorized?.();

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new ApiError(response.status, describeError(payload, response.status));
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

// FastAPI returns {detail: string} for HTTP errors and {detail: [{msg}]} for validation.
function describeError(payload: any, status: number): string {
  const detail = payload?.detail;
  if (typeof detail === "string") return detail;
  // Pydantic prefixes messages from custom validators with "Value error, ".
  if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg.replace(/^Value error, /, "");
  return `Request failed (${status})`;
}

// --- auth ---------------------------------------------------------------------

export const loginWithPhone = (input: { name: string; phone: string; country: string }) =>
  request<TokenResponse>("POST", "/auth/phone", { body: input, auth: false });

export const loginAsGuest = () =>
  request<TokenResponse>("POST", "/auth/demo", { auth: false });

export const getMe = () => request<User>("GET", "/users/me");

export const deleteMyAccount = () => request<void>("DELETE", "/users/me");

// --- properties -----------------------------------------------------------------

export const getProperties = ({
  filter,
  query,
  limit,
}: {
  filter?: string;
  query?: string;
  limit?: number;
}) =>
  request<PropertyPage>("GET", "/properties", {
    query: { type: filter, q: query, limit },
  }).then((page) => page.items);

export const getFeaturedProperties = () =>
  request<PropertySummary[]>("GET", "/properties/featured");

export const getPropertyById = ({ id }: { id: string }) =>
  request<PropertyDetail>("GET", `/properties/${encodeURIComponent(id)}`);

export const recordPropertyView = (propertyId: string) =>
  request<void>("POST", `/properties/${encodeURIComponent(propertyId)}/views`);

// --- favorites ------------------------------------------------------------------

export const getFavorites = () => request<PropertySummary[]>("GET", "/favorites");

export const getFavoriteIds = () => request<string[]>("GET", "/favorites/ids");

export const addFavorite = (propertyId: string) =>
  request<void>("PUT", `/favorites/${encodeURIComponent(propertyId)}`);

export const removeFavorite = (propertyId: string) =>
  request<void>("DELETE", `/favorites/${encodeURIComponent(propertyId)}`);

// --- notifications --------------------------------------------------------------

export const getNotifications = () => request<AppNotification[]>("GET", "/notifications");

export const markNotificationAsRead = (notificationId: string) =>
  request<void>("POST", `/notifications/${encodeURIComponent(notificationId)}/read`);

export const markAllNotificationsAsRead = () =>
  request<void>("POST", "/notifications/read-all");

export const checkNewProperties = () =>
  request<NewPropertiesCheck>("POST", "/notifications/check-new-properties");

// --- viewing requests -----------------------------------------------------------

export const createViewingRequest = (input: ViewingRequestInput) =>
  request<ViewingRequest>("POST", "/viewing-requests", { body: input });

export const getMyViewingRequests = ({ propertyId }: { propertyId?: string } = {}) =>
  request<ViewingRequest[]>("GET", "/viewing-requests", {
    query: { property_id: propertyId },
  });

export const cancelViewingRequest = (requestId: string) =>
  request<ViewingRequest>("POST", `/viewing-requests/${encodeURIComponent(requestId)}/cancel`);
