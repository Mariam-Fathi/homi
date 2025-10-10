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
import { makeRedirectUri } from 'expo-auth-session'

export const config = {
    platform: "com.mf.homihunt",
    endpoint: process.env.EXPO_PUBLIC_APPWRITE_ENDPOINT,
    projectId: process.env.EXPO_PUBLIC_APPWRITE_PROJECT_ID,
    databaseId: process.env.EXPO_PUBLIC_APPWRITE_DATABASE_ID,
    galleriesCollectionId: process.env.EXPO_PUBLIC_APPWRITE_GALLERIES_COLLECTION_ID,
    reviewsCollectionId: process.env.EXPO_PUBLIC_APPWRITE_REVIEWS_COLLECTION_ID,
    agentsCollectionId: process.env.EXPO_PUBLIC_APPWRITE_AGENTS_COLLECTION_ID,
    propertiesCollectionId: process.env.EXPO_PUBLIC_APPWRITE_PROPERTIES_COLLECTION_ID,
    userActivityCollectionId: process.env.EXPO_PUBLIC_APPWRITE_USER_ACTIVITY_COLLECTION_ID,
    userFavoritesCollectionId: process.env.EXPO_PUBLIC_APPWRITE_USER_FAVORITES_COLLECTION_ID,
    userNotificationsCollectionId : process.env.EXPO_PUBLIC_APPWRITE_NOTIFICATIONS_COLLECTION_ID
};

const client = new Client()
    .setEndpoint(config.endpoint!)
    .setProject(config.projectId!)
    .setPlatform(config.platform!);

export const account = new Account(client);
export const avatars = new Avatars(client);
export const databases = new Databases(client);

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

        if (result.type !== "success")
            throw new Error("Create session failed");

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
        if (name) {
            const userAvatar = avatars.getInitials(name);
            return { $id, name, email, avatar: userAvatar.toString() };
        }
        return null;
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
            [Query.orderAsc("$createdAt"), Query.limit(5)]
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

export async function addToFavorites({ userId, property }: { userId: string; property: any }) {
    try {
        const existingFav = await databases.listDocuments(
            config.databaseId!,
            config.userFavoritesCollectionId!,
            [Query.equal('userId', userId), Query.equal('propertyId', property.$id)]
        );

        if (existingFav.documents.length > 0) {
            console.log('Property already in favorites');
            return existingFav.documents[0];
        }

        const favorite = await databases.createDocument(
            config.databaseId!,
            config.userFavoritesCollectionId!,
            ID.unique(),
            {
                userId: userId,
                propertyId: property.$id
            }
        );

        console.log('Added to favorites:', property.name);
        return favorite;
    } catch (error) {
        console.error('Error adding to favorites:', error);
        throw error;
    }
}

export async function removeFromFavorites({ userId, propertyId }: { userId: string; propertyId: string }) {
    try {
        const favorites = await databases.listDocuments(
            config.databaseId!,
            config.userFavoritesCollectionId!,
            [Query.equal('userId', userId), Query.equal('propertyId', propertyId)]
        );

        if (favorites.documents.length === 0) {
            console.log('Favorite not found');
            return;
        }

        await databases.deleteDocument(
            config.databaseId!,
            config.userFavoritesCollectionId!,
            favorites.documents[0].$id
        );

        console.log('Removed from favorites');
    } catch (error) {
        console.error('Error removing from favorites:', error);
        throw error;
    }
}

export async function isPropertyFavorited({ userId, propertyId }: { userId: string; propertyId: string }): Promise<boolean> {
    try {
        const favorites = await databases.listDocuments(
            config.databaseId!,
            config.userFavoritesCollectionId!,
            [Query.equal('userId', userId), Query.equal('propertyId', propertyId)]
        );

        return favorites.documents.length > 0;
    } catch (error) {
        console.error('Error checking favorite status:', error);
        return false;
    }
}

export async function getUserFavorites({ userId }: { userId: string }) {
    try {
        const favorites = await databases.listDocuments(
            config.databaseId!,
            config.userFavoritesCollectionId!,
            [Query.equal('userId', userId), Query.orderDesc('$createdAt')]
        );

        const favoriteProperties = await Promise.all(
            favorites.documents.map(async (favorite) => {
                try {
                    const property = await databases.getDocument(
                        config.databaseId!,
                        config.propertiesCollectionId!,
                        favorite.propertyId
                    );
                    return property;
                } catch (error) {
                    console.error('Error fetching property for favorite:', error);
                    return null;
                }
            })
        );

        return favoriteProperties.filter(property => property !== null);
    } catch (error) {
        console.error('Error getting user favorites:', error);
        return [];
    }
}

export async function trackUserActivity({ property, userId }: { property: any; userId: string }) {
    try {
        if (!config.userActivityCollectionId) {
            console.log('User activity tracking disabled');
            return;
        }

        await databases.createDocument(
            config.databaseId!,
            config.userActivityCollectionId,
            ID.unique(),
            {
                userId: userId,
                propertyId: property.$id,
                action: 'viewed'
            }
        );

        console.log(`✅ Tracked view for: ${property.name}`);
    } catch (error) {
        console.error('❌ Error tracking user activity:', error);
    }
}
export async function analyzeUserPreferences({ userId }: { userId: string }) {
    try {
        const userActivities = await databases.listDocuments(
            config.databaseId!,
            config.userActivityCollectionId!,
            [
                Query.equal('userId', userId),
                Query.equal('action', 'viewed'),
                Query.orderDesc('$createdAt'),
                Query.limit(20)
            ]
        );

        console.log('🔍 User activities found:', userActivities.documents.length);

        if (userActivities.documents.length < 3) {
            console.log('❌ Not enough activities to analyze preferences');
            return null;
        }

        const typeCount: { [key: string]: number } = {};

        for (const activity of userActivities.documents) {
            try {
                if (!activity.propertyId) {
                    console.log('❌ No propertyId found for activity:', activity.$id);
                    continue;
                }

                const property = await databases.getDocument(
                    config.databaseId!,
                    config.propertiesCollectionId!,
                    activity.propertyId
                );

                if (property && property.type) {
                    typeCount[property.type] = (typeCount[property.type] || 0) + 1;
                    console.log(`✅ Found property type: ${property.type}`);
                } else {
                    console.log('❌ Could not fetch property or property has no type:', activity.propertyId);
                }

            } catch (error) {
                console.error('❌ Error fetching property for activity:', error);
            }
        }

        const typeKeys = Object.keys(typeCount);
        console.log('📊 Property types distribution:', typeCount);

        if (typeKeys.length === 0) {
            console.log('❌ No property types found in activities');
            return null;
        }

        const favoriteType = typeKeys.reduce((a, b) =>
            typeCount[a] > typeCount[b] ? a : b
        );

        const totalViews = Object.values(typeCount).reduce((a, b) => a + b, 0);
        const confidence = typeCount[favoriteType] / totalViews;

        console.log('🎯 Analysis result:', {
            favoriteType,
            confidence,
            distribution: typeCount
        });

        if (confidence < 0.4) {
            console.log('❌ Confidence too low:', confidence);
            return null;
        }

        console.log('✅ User preferences analyzed successfully');
        return {
            type: favoriteType,
            confidence: confidence
        };
    } catch (error) {
        console.error('Error analyzing user preferences:', error);
        return null;
    }
}

export async function createNotification({
                                             userId,
                                             title,
                                             message,
                                             type = 'info',
                                             relatedPropertyId
                                         }: {
    userId: string;
    title: string;
    message: string;
    type?: 'info' | 'success' | 'warning' | 'error';
    relatedPropertyId?: string;
}) {
    try {
        const notificationData: any = {
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
            config.userNotificationsCollectionId,
            ID.unique(),
            notificationData
        );

        console.log('📝 Database notification created:', title);
        return notification;
    } catch (error) {
        console.error('Error creating notification:', error);
        throw error;
    }
}

export async function getNotifications({ userId }: { userId: string }) {
    try {
        const notifications = await databases.listDocuments(
            config.databaseId!,
            'notifications',
            [
                Query.equal('userId', userId),
                Query.orderDesc('$createdAt'),
                Query.limit(50)
            ]
        );

        return notifications.documents;
    } catch (error) {
        console.error('Error getting notifications:', error);
        return [];
    }
}

export async function markNotificationAsRead({ notificationId }: { notificationId: string }) {
    try {
        await databases.updateDocument(
            config.databaseId!,
            'notifications',
            notificationId,
            {
                isRead: true
            }
        );

        console.log('Notification marked as read');
    } catch (error) {
        console.error('Error marking notification as read:', error);
        throw error;
    }
}

export async function checkAndNotifyNewProperties({ userId }: { userId: string }) {
    try {
        const preferences = await analyzeUserPreferences({ userId });

        if (!preferences) {
            throw new Error('Cannot determine user preferences');
        }

        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

        const newProperties = await databases.listDocuments(
            config.databaseId!,
            config.propertiesCollectionId!,
            [
                Query.equal('type', preferences.type),
                Query.greaterThan('$createdAt', oneWeekAgo.toISOString()),
                Query.limit(5)
            ]
        );

        if (newProperties.documents.length === 0) {
            throw new Error('No new properties matching your preferences');
        }

        const property = newProperties.documents[0];

        // Create database notification
        await createNotification({
            userId: userId,
            title: '🏠 New Property You Might Like!',
            message: `New ${property.type} in ${property.address?.split(',')[0] || 'your area'}: ${property.name}`,
            type: 'info',
            relatedPropertyId: property.$id
        });

        return {
            success: true,
            count: newProperties.documents.length,
            property: property // Return the property for push notification
        };
    } catch (error) {
        console.error('Error checking new properties:', error);
        throw error;
    }
}


export const getPayments = async ({ email }: { email: string }) => {
    try {
        const response = await databases.listDocuments(
            process.env.EXPO_PUBLIC_APPWRITE_DATABASE_ID,
            process.env.EXPO_PUBLIC_APPWRITE_PAYMENTS_COLLECTION_ID,
            [
                Query.equal('email', email),
            ]
        );
        return response.documents;
    } catch (error) {
        throw error;
    }
};