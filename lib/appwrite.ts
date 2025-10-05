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
    userFavoritesCollectionId: process.env.EXPO_PUBLIC_APPWRITE_USER_FAVORITES_COLLECTION_ID
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

export async function addToFavorites(userId: string, property: any) {
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

export async function removeFromFavorites(userId: string, propertyId: string) {
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

export async function isPropertyFavorited(userId: string, propertyId: string): Promise<boolean> {
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

// lib/appwrite.ts - Fix the function signature
export async function getUserFavorites({ userId }: { userId: string }) {
    try {
        const favorites = await databases.listDocuments(
            config.databaseId!,
            config.userFavoritesCollectionId!,
            [Query.equal('userId', userId), Query.orderDesc('$createdAt')]
        );

        // For each favorite, fetch the complete property data
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
export async function trackUserActivity(property: any, userId: string) {
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

        console.log(`Tracked view for: ${property.name}`);
    } catch (error) {
        console.error('Error tracking user activity:', error);
    }
}