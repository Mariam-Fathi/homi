import {
  Client,
  Account,
  ID,
  OAuthProvider,
  Avatars,
} from "react-native-appwrite";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";

const client = new Client()
  .setEndpoint("https://cloud.appwrite.io/v1")
  .setProject("678cf37a003e229fd1a8")
  .setPlatform("com.mf.homihunt");

const account = new Account(client);
const avatars = new Avatars(client);

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
