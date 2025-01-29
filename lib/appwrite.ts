import {
  Client,
  Account,
  OAuthProvider,
  Avatars,
  Databases,
} from "react-native-appwrite";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";

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
const client = new Client()
  .setEndpoint(config.endpoint!)
  .setProject(config.projectId!)
  .setPlatform(config.platform!);

export const account = new Account(client);
export const avatars = new Avatars(client);
export const databases = new Databases(client);

export const login = async () => {
  try {
    const deepLink = Linking.createURL("/");
    const response = account.createOAuth2Token(
      OAuthProvider.Google,
      `${deepLink}`,
      `${deepLink}`
    );
    if (!response) throw new Error("Create OAuth2 token failed");

    const browserResult = await WebBrowser.openAuthSessionAsync(
      response.toString(),
      `${deepLink}`
    );
    if (browserResult.type !== "success")
      throw new Error("Create session failed");

    const url = new URL(browserResult.url);
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
