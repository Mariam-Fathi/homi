import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const KEY = "homi.accessToken";

// SecureStore keeps the token in the iOS Keychain / Android Keystore. It isn't
// available on web, where localStorage is the closest equivalent.
export const tokenStorage = {
  async get(): Promise<string | null> {
    try {
      if (Platform.OS === "web") return globalThis.localStorage?.getItem(KEY) ?? null;
      return await SecureStore.getItemAsync(KEY);
    } catch {
      return null;
    }
  },
  async set(token: string): Promise<void> {
    if (Platform.OS === "web") {
      globalThis.localStorage?.setItem(KEY, token);
      return;
    }
    await SecureStore.setItemAsync(KEY, token);
  },
  async clear(): Promise<void> {
    try {
      if (Platform.OS === "web") {
        globalThis.localStorage?.removeItem(KEY);
        return;
      }
      await SecureStore.deleteItemAsync(KEY);
    } catch {
      // Nothing stored; nothing to clear.
    }
  },
};
