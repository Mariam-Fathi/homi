import {
  Client,
  Account,
  OAuthProvider,
  Avatars,
  Databases,
  Query,
  ID,
} from "react-native-appwrite";
import * as WebBrowser from "expo-web-browser";
import { makeRedirectUri } from "expo-auth-session";
import * as Notifications from "expo-notifications";
import type { Property, AppwriteNotification, UserPreferenceResult, DeleteAccountResult } from "@/types/appwrite";

export const config = {
  platform: "com.mf.homihunt",
  endpoint: process.env.EXPO_PUBLIC_APPWRITE_ENDPOINT,
  projectId: process.env.EXPO_PUBLIC_APPWRITE_PROJECT_ID,
  databaseId: process.env.EXPO_PUBLIC_APPWRITE_DATABASE_ID,
  galleriesCollectionId:
    process.env.EXPO_PUBLIC_APPWRITE_GALLERIES_COLLECTION_ID,
  reviewsCollectionId: process.env.EXPO_PUBLIC_APPWRITE_REVIEWS_COLLECTION_ID,
  agentsCollectionId: process.env.EXPO_PUBLIC_APPWRITE_AGENTS_COLLECTION_ID,
  propertiesCollectionId:
    process.env.EXPO_PUBLIC_APPWRITE_PROPERTIES_COLLECTION_ID,
  userActivityCollectionId:
    process.env.EXPO_PUBLIC_APPWRITE_USER_ACTIVITY_COLLECTION_ID,
  userFavoritesCollectionId:
    process.env.EXPO_PUBLIC_APPWRITE_USER_FAVORITES_COLLECTION_ID,
  userNotificationsCollectionId:
    process.env.EXPO_PUBLIC_APPWRITE_NOTIFICATIONS_COLLECTION_ID,
  paymentsCollectionId: process.env.EXPO_PUBLIC_APPWRITE_PAYMENTS_COLLECTION_ID,
};

// Appwrite caps a single page at 100 documents (and defaults to 25).
const PAGE_SIZE = 100;

if (!config.endpoint || !config.projectId || !config.databaseId) {
  throw new Error(
    "Missing Appwrite configuration. Copy .env.example to .env and fill in the EXPO_PUBLIC_APPWRITE_* values."
  );
}

const client = new Client()
  .setEndpoint(config.endpoint!)
  .setProject(config.projectId!)
  .setPlatform(config.platform!);

export const account = new Account(client);
export const avatars = new Avatars(client);
export const databases = new Databases(client);

/** Deletes every document in a collection matching `queries`, page by page. */
async function deleteAllDocuments(collectionId: string, queries: string[]) {
  while (true) {
    const page = await databases.listDocuments(config.databaseId!, collectionId, [
      ...queries,
      Query.limit(PAGE_SIZE),
    ]);
    for (const doc of page.documents) {
      await databases.deleteDocument(config.databaseId!, collectionId, doc.$id);
    }
    if (page.documents.length < PAGE_SIZE) break;
  }
}

/** Fetches properties by id in a single request, preserving the order of `ids`. */
async function getPropertiesByIds(ids: string[]) {
  const uniqueIds = [...new Set(ids)].slice(0, PAGE_SIZE);
  if (uniqueIds.length === 0) return [];
  const result = await databases.listDocuments(
    config.databaseId!,
    config.propertiesCollectionId!,
    [Query.equal("$id", uniqueIds), Query.limit(uniqueIds.length)]
  );
  const byId = new Map(result.documents.map((doc) => [doc.$id, doc]));
  return uniqueIds.map((id) => byId.get(id)).filter((doc) => doc !== undefined);
}

export const login = async () => {
  try {
    const deepLink = new URL(makeRedirectUri({ preferLocalhost: true }));
    const scheme = `${deepLink.protocol}//`;

    const response = account.createOAuth2Token(
      OAuthProvider.Google,
      `${deepLink}`,
      `${deepLink}`
    );
    if (!response) throw new Error("Create OAuth2 token failed");

    const result = await WebBrowser.openAuthSessionAsync(`${response}`, scheme);

    if (result.type !== "success") throw new Error("Create session failed");

    const url = new URL(result.url);
    const secret = url.searchParams.get("secret")?.toString();
    const userId = url.searchParams.get("userId")?.toString();
    if (!secret || !userId) throw new Error("Create OAuth2 token failed");

    const session = await account.createSession(userId, secret);
    if (!session) throw new Error("Failed to create session");

    return session;
  } catch (error) {
    console.error(error);
    return false;
  }
};

export const logout = async () => {
  try {
    const result = await account.deleteSession("current");
    return result;
  } catch (error) {
    console.error(error);
    return false;
  }
};

export const getCurrentUser = async () => {
  try {
    const { $id, name, email } = await account.get();
    // A session without a display name is still a valid login; fall back to the email.
    const displayName = name || email;
    const userAvatar = avatars.getInitials(displayName);
    return { $id, name: displayName, email, avatar: userAvatar.toString() };
  } catch (error) {
    console.log(error);
    return null;
  }
};

export async function getLatestProperties() {
  try {
    const result = await databases.listDocuments(
      config.databaseId!,
      config.propertiesCollectionId!,
      [Query.orderDesc("$createdAt"), Query.limit(5)]
    );

    return result.documents;
  } catch (error) {
    console.error(error);
    return [];
  }
}

export async function getProperties({
  filter,
  query,
  limit,
}: {
  filter: string;
  query: string;
  limit?: number;
}) {
  try {
    const buildQuery = [Query.orderDesc("$createdAt")];

    if (filter && filter !== "All")
      buildQuery.push(Query.equal("type", filter));

    if (query)
      buildQuery.push(
        Query.or([
          Query.search("name", query),
          Query.search("address", query),
          Query.search("type", query),
        ])
      );

    if (limit) buildQuery.push(Query.limit(limit));

    const result = await databases.listDocuments(
      config.databaseId!,
      config.propertiesCollectionId!,
      buildQuery
    );

    return result.documents;
  } catch (error) {
    console.error(error);
    return [];
  }
}

export async function getPropertyById({ id }: { id: string }) {
  try {
    const result = await databases.getDocument(
      config.databaseId!,
      config.propertiesCollectionId!,
      id
    );
    return result;
  } catch (error) {
    console.error(error);
    return null;
  }
}

export async function addToFavorites({
  userId,
  property,
}: {
  userId: string;
  property: Property;
}) {
  try {
    const existingFav = await databases.listDocuments(
      config.databaseId!,
      config.userFavoritesCollectionId!,
      [Query.equal("userId", userId), Query.equal("propertyId", property.$id)]
    );

    if (existingFav.documents.length > 0) {
      console.log("Property already in favorites");
      return existingFav.documents[0];
    }

    const favorite = await databases.createDocument(
      config.databaseId!,
      config.userFavoritesCollectionId!,
      ID.unique(),
      {
        userId: userId,
        propertyId: property.$id,
      }
    );

    console.log("Added to favorites:", property.name);
    return favorite;
  } catch (error) {
    console.error("Error adding to favorites:", error);
    throw error;
  }
}

export async function removeFromFavorites({
  userId,
  propertyId,
}: {
  userId: string;
  propertyId: string;
}) {
  try {
    const favorites = await databases.listDocuments(
      config.databaseId!,
      config.userFavoritesCollectionId!,
      [Query.equal("userId", userId), Query.equal("propertyId", propertyId)]
    );

    if (favorites.documents.length === 0) {
      console.log("Favorite not found");
      return;
    }

    await databases.deleteDocument(
      config.databaseId!,
      config.userFavoritesCollectionId!,
      favorites.documents[0].$id
    );

    console.log("Removed from favorites");
  } catch (error) {
    console.error("Error removing from favorites:", error);
    throw error;
  }
}

export async function isPropertyFavorited({
  userId,
  propertyId,
}: {
  userId: string;
  propertyId: string;
}): Promise<boolean> {
  try {
    const favorites = await databases.listDocuments(
      config.databaseId!,
      config.userFavoritesCollectionId!,
      [Query.equal("userId", userId), Query.equal("propertyId", propertyId)]
    );

    return favorites.documents.length > 0;
  } catch (error) {
    console.error("Error checking favorite status:", error);
    return false;
  }
}

export async function getUserFavoriteIds({
  userId,
}: {
  userId: string;
}): Promise<string[]> {
  const favorites = await databases.listDocuments(
    config.databaseId!,
    config.userFavoritesCollectionId!,
    [Query.equal("userId", userId), Query.limit(PAGE_SIZE)]
  );
  return favorites.documents.map((favorite) => favorite.propertyId);
}

export async function getUserFavorites({ userId }: { userId: string }) {
  try {
    const favorites = await databases.listDocuments(
      config.databaseId!,
      config.userFavoritesCollectionId!,
      [
        Query.equal("userId", userId),
        Query.orderDesc("$createdAt"),
        Query.limit(PAGE_SIZE),
      ]
    );

    return await getPropertiesByIds(
      favorites.documents.map((favorite) => favorite.propertyId)
    );
  } catch (error) {
    console.error("Error getting user favorites:", error);
    return [];
  }
}

export async function trackUserActivity({
  property,
  userId,
}: {
  property: Property;
  userId: string;
}) {
  try {
    if (!config.userActivityCollectionId) {
      console.log("User activity tracking disabled");
      return;
    }

    await databases.createDocument(
      config.databaseId!,
      config.userActivityCollectionId,
      ID.unique(),
      {
        userId: userId,
        propertyId: property.$id,
        action: "viewed",
      }
    );

    console.log(`✅ Tracked view for: ${property.name}`);
  } catch (error) {
    console.error("❌ Error tracking user activity:", error);
  }
}
export async function analyzeUserPreferences({ userId }: { userId: string }): Promise<UserPreferenceResult | null> {
  try {
    if (!config.userActivityCollectionId) {
      console.log("📊 User activity tracking not configured");
      return null;
    }

    const userActivities = await databases.listDocuments(
      config.databaseId!,
      config.userActivityCollectionId,
      [
        Query.equal("userId", userId),
        Query.equal("action", "viewed"),
        Query.orderDesc("$createdAt"),
        Query.limit(20),
      ]
    );

    console.log("🔍 User activities found:", userActivities.documents.length);

    if (userActivities.documents.length < 3) {
      console.log("❌ Not enough activities to analyze preferences");
      return null;
    }

    const typeCount: { [key: string]: number } = {};
    let processedActivities = 0;

    const viewedIds: string[] = userActivities.documents
      .map((activity) => activity.propertyId)
      .filter(Boolean);
    const viewedProperties = await getPropertiesByIds(viewedIds);
    const typeById = new Map(
      viewedProperties.map((property) => [property.$id, property.type])
    );

    for (const propertyId of viewedIds) {
      const type = typeById.get(propertyId);
      if (type) {
        typeCount[type] = (typeCount[type] || 0) + 1;
        processedActivities++;
      }
    }

    const typeKeys = Object.keys(typeCount);
    console.log("📊 Property types distribution:", typeCount);

    if (typeKeys.length === 0) {
      console.log("❌ No property types found in activities");
      return null;
    }

    const favoriteType = typeKeys.reduce((a, b) =>
      typeCount[a] > typeCount[b] ? a : b
    );

    const totalViews = Object.values(typeCount).reduce((a, b) => a + b, 0);
    const confidence = typeCount[favoriteType] / totalViews;

    console.log("🎯 Analysis result:", {
      favoriteType,
      confidence,
      distribution: typeCount,
      processedActivities,
    });

    if (confidence < 0.4) {
      console.log("❌ Confidence too low:", confidence);
      return null;
    }

    console.log("✅ User preferences analyzed successfully");
    return {
      type: favoriteType,
      confidence: confidence,
    };
  } catch (error) {
    console.error("Error analyzing user preferences:", error);
    return null;
  }
}

export async function getNotifications({ userId }: { userId: string }): Promise<AppwriteNotification[]> {
  try {
    if (!config.userNotificationsCollectionId) return [];
    const notifications = await databases.listDocuments(
      config.databaseId!,
      config.userNotificationsCollectionId,
      [
        Query.equal("userId", userId),
        Query.orderDesc("$createdAt"),
        Query.limit(50),
      ]
    );

    return notifications.documents as unknown as AppwriteNotification[];
  } catch (error) {
    console.error("Error getting notifications:", error);
    return [];
  }
}

export async function markNotificationAsRead({
  notificationId,
}: {
  notificationId: string;
}) {
  try {
    if (!config.userNotificationsCollectionId) throw new Error("Notifications collection not configured");
    await databases.updateDocument(
      config.databaseId!,
      config.userNotificationsCollectionId,
      notificationId,
      {
        isRead: true,
      }
    );

    console.log("Notification marked as read");
  } catch (error) {
    console.error("Error marking notification as read:", error);
    throw error;
  }
}

export async function checkAndNotifyNewProperties({
  userId,
}: {
  userId: string;
}) {
  try {
    if (!config.userNotificationsCollectionId) {
      return { success: false, error: "Notifications collection not configured" };
    }

    const preferences = await analyzeUserPreferences({ userId });

    if (!preferences) {
      console.log("👋 No user preferences found (new user or no activities)");

      // Greet a user only once: skip if they already have any notification.
      const existing = await databases.listDocuments(
        config.databaseId!,
        config.userNotificationsCollectionId,
        [Query.equal("userId", userId), Query.limit(1)]
      );
      if (existing.documents.length > 0) {
        return { success: true, noNewProperties: true };
      }

      const latestProperties = await databases.listDocuments(
        config.databaseId!,
        config.propertiesCollectionId!,
        [Query.orderDesc("$createdAt"), Query.limit(3)]
      );

      if (latestProperties.documents.length > 0) {
        const property = latestProperties.documents[0];

        await createNotification({
          userId: userId,
          title: "🏠 Welcome to Homi!",
          message: `Check out our latest property: ${property.name}`,
          type: "info",
          relatedPropertyId: property.$id,
          sendPush: false,
        });

        await sendAppPushNotification(
          "🏠 Welcome to Homi!",
          `Check out our latest property: ${property.name}`,
          { id: property.$id, type: "welcome" }
        );

        console.log("✅ Welcome notification sent to new user");
      }
      return { success: true, isNewUser: true };
    }

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const newProperties = await databases.listDocuments(
      config.databaseId!,
      config.propertiesCollectionId!,
      [
        Query.equal("type", preferences.type),
        Query.greaterThan("$createdAt", oneWeekAgo.toISOString()),
        Query.orderDesc("$createdAt"),
        Query.limit(5),
      ]
    );

    // Skip properties the user has already been notified about.
    const alreadyNotified = await databases.listDocuments(
      config.databaseId!,
      config.userNotificationsCollectionId,
      [
        Query.equal("userId", userId),
        Query.isNotNull("relatedPropertyId"),
        Query.orderDesc("$createdAt"),
        Query.limit(PAGE_SIZE),
      ]
    );
    const notifiedIds = new Set(
      alreadyNotified.documents.map((doc) => doc.relatedPropertyId)
    );
    const unseen = newProperties.documents.filter(
      (doc) => !notifiedIds.has(doc.$id)
    );

    if (unseen.length === 0) {
      console.log("📭 No new properties matching preferences");
      return { success: true, noNewProperties: true };
    }

    const property = unseen[0];

    await createNotification({
      userId: userId,
      title: "🏠 New Property You Might Like!",
      message: `New ${property.type} in ${property.address?.split(",")[0] || "your area"}: ${property.name}`,
      type: "info",
      relatedPropertyId: property.$id,
      sendPush: false,
    });

    await sendAppPushNotification(
      "🏠 New Property You Might Like!",
      `New ${property.type} in ${property.address?.split(",")[0] || "your area"}: ${property.name}`,
      {
        id: property.$id,
        type: "new_property",
        propertyType: property.type,
      }
    );

    console.log("✅ New property notification sent");
    return {
      success: true,
      count: unseen.length,
      property: property,
    };
  } catch (error) {
    console.error("Error checking new properties:", error);
    return { success: false, error: error.message };
  }
}

export const getPayments = async ({ email }: { email: string }) => {
  if (!config.paymentsCollectionId) return [];
  const response = await databases.listDocuments(
    config.databaseId!,
    config.paymentsCollectionId,
    [
      Query.equal("email", email),
      Query.orderDesc("$createdAt"),
      Query.limit(PAGE_SIZE),
    ]
  );
  return response.documents;
};

export const createPaymentRecord = async (payment: {
  amount: string;
  status: "completed" | "pending" | "failed";
  fullName: string;
  email: string;
  propertyTitle: string;
}) => {
  if (!config.paymentsCollectionId) {
    throw new Error("Payments collection not configured");
  }
  return databases.createDocument(
    config.databaseId!,
    config.paymentsCollectionId,
    ID.unique(),
    payment
  );
};
export const deleteAccount = async (): Promise<DeleteAccountResult> => {
  try {
    const currentUser = await account.get();

    if (!currentUser || !currentUser.$id) {
      throw new Error("No user logged in");
    }

    const userId = currentUser.$id;
    const userEmail = currentUser.email;

    console.log("🗑️ Starting account deletion for:", userId);

    const deletionSteps = [];

    try {
      await deleteAllDocuments(config.userFavoritesCollectionId!, [
        Query.equal("userId", userId),
      ]);
      deletionSteps.push("favorites");
      console.log("✅ Deleted user favorites");
    } catch (error) {
      console.error("Error deleting favorites:", error);
    }

    try {
      if (config.userActivityCollectionId) {
        await deleteAllDocuments(config.userActivityCollectionId, [
          Query.equal("userId", userId),
        ]);
        deletionSteps.push("activities");
        console.log("✅ Deleted user activities");
      }
    } catch (error) {
      console.error("Error deleting activities:", error);
    }

    try {
      if (config.userNotificationsCollectionId) {
        await deleteAllDocuments(config.userNotificationsCollectionId, [
          Query.equal("userId", userId),
        ]);
        deletionSteps.push("notifications");
        console.log("✅ Deleted user notifications");
      }
    } catch (error) {
      console.error("Error deleting notifications:", error);
    }
    try {
      if (config.paymentsCollectionId) {
        await deleteAllDocuments(config.paymentsCollectionId, [
          Query.equal("email", userEmail),
        ]);
        deletionSteps.push("payments");
        console.log("✅ Deleted user payments");
      }
    } catch (error) {
      console.error("Error deleting payments:", error);
    }

    let identityDeleted = false;
    try {
      const identities = await account.listIdentities();
      console.log("🔍 Found identities:", identities);

      if (identities.identities && identities.identities.length > 0) {
        for (const identity of identities.identities) {
          try {
            await account.deleteIdentity(identity.$id);
            identityDeleted = true;
            console.log(`✅ Deleted identity: ${identity.provider}`);
          } catch (identityError) {
            console.error(
              `Error deleting identity ${identity.$id}:`,
              identityError
            );
          }
        }
      }
    } catch (identityError) {
      console.log(
        "⚠️ Could not list or delete OAuth identities:",
        identityError
      );
    }

    // The client SDK can't hard-delete a user, but it can block the account,
    // which also invalidates every session.
    let accountDeactivated = false;
    let sessionsCleared = false;
    try {
      await account.updateStatus();
      accountDeactivated = true;
      sessionsCleared = true;
      console.log("✅ Account deactivated");
    } catch (statusError) {
      console.error("Error deactivating account:", statusError);
      try {
        await account.deleteSessions();
        sessionsCleared = true;
        console.log("✅ All sessions deleted");
      } catch (sessionError) {
        console.error("Error deleting sessions:", sessionError);
      }
    }

    console.log("📊 Deletion summary:", {
      dataDeleted: deletionSteps,
      identityDeleted,
      accountDeactivated,
      sessionsCleared,
    });

    const expectedSteps = ["favorites"];
    if (config.userActivityCollectionId) expectedSteps.push("activities");
    if (config.userNotificationsCollectionId) expectedSteps.push("notifications");
    if (config.paymentsCollectionId) expectedSteps.push("payments");
    const partial = expectedSteps.some((step) => !deletionSteps.includes(step));

    return {
      success: accountDeactivated && !partial,
      message: !accountDeactivated
        ? "We couldn't deactivate your account. Please try again or contact support."
        : partial
          ? "Your account has been deactivated, but some of your data could not be removed. Please contact support."
          : "All your personal data has been permanently deleted. Your account has been deactivated.",
      details: {
        dataDeleted: deletionSteps,
        identityDeleted,
        sessionsCleared,
        partial,
      },
    };
  } catch (error) {
    console.error("❌ Error in account deletion process:", error);
    throw error;
  }
};

export async function createNotification({
  userId,
  title,
  message,
  type = "info",
  relatedPropertyId,
  sendPush = true,
}: {
  userId: string;
  title: string;
  message: string;
  type?: "info" | "success" | "warning" | "error";
  relatedPropertyId?: string;
  sendPush?: boolean;
}) {
  try {
    const notificationData: Record<string, unknown> = {
      userId,
      title,
      message,
      type,
      isRead: false,
    };

    if (relatedPropertyId) {
      notificationData.relatedPropertyId = relatedPropertyId;
    }

    const notification = await databases.createDocument(
      config.databaseId!,
      config.userNotificationsCollectionId!,
      ID.unique(),
      notificationData
    );

    console.log("📝 Database notification created:", title);

    if (sendPush) {
      console.log("📱 Push notification ready to be sent:", title);
    }

    return notification;
  } catch (error) {
    console.error("Error creating notification:", error);
    throw error;
  }
}

export async function sendAppPushNotification(
  title: string,
  body: string,
  data?: any
) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: data || {},
        sound: "default",
        badge: 1,
      },
      trigger: null,
    });
    console.log("📱 Push notification sent:", title);
    return true;
  } catch (error) {
    console.error("Error sending push notification:", error);
    return false;
  }
}
