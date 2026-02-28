/**
 * Shared types for Appwrite entities and API responses.
 * Used across lib/appwrite, hooks, and components to reduce `any` and improve type safety.
 */

/** Base Appwrite document fields (all collections) */
export interface AppwriteDocument {
  $id: string;
  $createdAt?: string;
  $updatedAt?: string;
}

/** Property listing as stored in Appwrite and used in UI */
export interface Property extends AppwriteDocument {
  name: string;
  address?: string;
  type: string;
  image: string;
  rating?: number;
  reviews?: { length: number } | unknown[];
  bedrooms: number;
  bathrooms: number;
  area: string | number;
}

/** In-app notification document */
export interface AppwriteNotification extends AppwriteDocument {
  userId: string;
  title: string;
  message: string;
  type?: "info" | "success" | "warning" | "error";
  isRead: boolean;
  relatedPropertyId?: string;
}

/** Result of user preference analysis (view history) */
export interface UserPreferenceResult {
  type: string;
  confidence: number;
}

/** Delete-account API result */
export interface DeleteAccountResult {
  success: boolean;
  message: string;
  details?: {
    dataDeleted?: string[];
    identityDeleted?: boolean;
    sessionsCleared?: boolean;
    partial?: boolean;
  };
}
