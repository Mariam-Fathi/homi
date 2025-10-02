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
  galleriesCollectionId:
    process.env.EXPO_PUBLIC_APPWRITE_GALLERIES_COLLECTION_ID,
  reviewsCollectionId: process.env.EXPO_PUBLIC_APPWRITE_REVIEWS_COLLECTION_ID,
  agentsCollectionId: process.env.EXPO_PUBLIC_APPWRITE_AGENTS_COLLECTION_ID,
  propertiesCollectionId:
    process.env.EXPO_PUBLIC_APPWRITE_PROPERTIES_COLLECTION_ID,
};

export const analyticsCollectionId = process.env.EXPO_PUBLIC_APPWRITE_ANALYTICS_COLLECTION_ID;

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

class AnalyticsService {
    private static instance: AnalyticsService;

    static getInstance(): AnalyticsService {
        if (!AnalyticsService.instance) {
            AnalyticsService.instance = new AnalyticsService();
        }
        return AnalyticsService.instance;
    }

    async track(event: string, properties: Record<string, any> = {}) {
        try {
            const documentData = {
                event,
                properties: JSON.stringify(properties),
                timestamp: new Date().toISOString(),
                sessionId: `session_${Date.now()}`,
            };

            await databases.createDocument(
                config.databaseId!,
                analyticsCollectionId!,
                ID.unique(),
                documentData
            );

            if (__DEV__) {
                console.log(`[Analytics] ${event}`, properties);
            }
        } catch (error) {
            console.warn('Analytics tracking failed:', error);
        }
    }
}

export const analytics = AnalyticsService.getInstance();

// Add to your appwrite.ts file
export async function getAnalyticsData(timeRange: string = '7d') {
    try {
        // Calculate date range
        const now = new Date();
        const startDate = new Date();

        switch(timeRange) {
            case '1d':
                startDate.setDate(now.getDate() - 1);
                break;
            case '7d':
                startDate.setDate(now.getDate() - 7);
                break;
            case '30d':
                startDate.setDate(now.getDate() - 30);
                break;
            default:
                startDate.setDate(now.getDate() - 7);
        }

        const queries = [
            Query.orderDesc('$createdAt'),
            Query.greaterThan('timestamp', startDate.toISOString())
        ];

        const result = await databases.listDocuments(
            config.databaseId!,
            analyticsCollectionId!,
            queries
        );

        return result.documents;
    } catch (error) {
        console.error('Error fetching analytics:', error);
        return [];
    }
}

export async function getCardAnalyticsSummary() {
    try {
        const analyticsData = await getAnalyticsData('7d');

        const summary = {
            totalViews: analyticsData.filter(doc => doc.event === 'card_viewed').length,
            totalClicks: analyticsData.filter(doc => doc.event === 'card_clicked').length,
            totalFavorites: analyticsData.filter(doc => doc.event === 'card_favorited').length,
            popularProperties: getPopularProperties(analyticsData),
            dailyStats: getDailyStats(analyticsData),
        };

        return summary;
    } catch (error) {
        console.error('Error generating analytics summary:', error);
        return null;
    }
}

function getPopularProperties(analyticsData: any[]) {
    const propertyCounts: { [key: string]: { name: string; views: number; clicks: number; favorites: number } } = {};

    analyticsData.forEach(doc => {
        const properties = JSON.parse(doc.properties);
        const itemId = properties.itemId;
        const itemName = properties.itemName;

        if (!propertyCounts[itemId]) {
            propertyCounts[itemId] = { name: itemName, views: 0, clicks: 0, favorites: 0 };
        }

        switch(doc.event) {
            case 'card_viewed':
                propertyCounts[itemId].views++;
                break;
            case 'card_clicked':
                propertyCounts[itemId].clicks++;
                break;
            case 'card_favorited':
                propertyCounts[itemId].favorites++;
                break;
        }
    });

    return Object.entries(propertyCounts)
        .map(([id, data]) => ({ id, ...data }))
        .sort((a, b) => b.views - a.views)
        .slice(0, 5); // Top 5 properties
}

function getDailyStats(analyticsData: any[]) {
    const dailyStats: { [key: string]: { views: number; clicks: number; favorites: number } } = {};

    analyticsData.forEach(doc => {
        const date = new Date(doc.timestamp).toDateString();

        if (!dailyStats[date]) {
            dailyStats[date] = { views: 0, clicks: 0, favorites: 0 };
        }

        switch(doc.event) {
            case 'card_viewed':
                dailyStats[date].views++;
                break;
            case 'card_clicked':
                dailyStats[date].clicks++;
                break;
            case 'card_favorited':
                dailyStats[date].favorites++;
                break;
        }
    });

    return dailyStats;
}