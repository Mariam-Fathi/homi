import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { randomUUID } from "expo-crypto";

import { setContextHeadersProvider, uploadEvents } from "@/lib/api";
import type { AppEventName, AppEvents } from "./events";
import { Tracker } from "./tracker";

export type { PropertyList, PropertyViewSource, Screen } from "./events";

const FLUSH_INTERVAL_MS = 10_000;

const tracker = new Tracker({
  storage: AsyncStorage,
  upload: uploadEvents,
  uuid: randomUUID,
  now: Date.now,
  platform:
    Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : "web",
  appVersion: Constants.expoConfig?.version ?? "unknown",
});

setContextHeadersProvider(() => {
  const { sessionId, anonymousId } = tracker.getContext();
  const headers: Record<string, string> = { "X-Session-Id": sessionId };
  if (anonymousId) headers["X-Anonymous-Id"] = anonymousId;
  return headers;
});

/** Records an analytics event. Never throws and never blocks the UI. */
export function track<N extends AppEventName>(
  name: N,
  properties: AppEvents[N]
): void {
  try {
    tracker.track(name, properties);
  } catch (error) {
    console.warn("Analytics error:", error);
  }
}

export const flushAnalytics = () => tracker.flush();

/** Called by the auth store whenever the signed-in user changes. */
export const setAnalyticsUser = (userId: string | null) => tracker.setUserId(userId);

/**
 * Mount once at the app root: records app_opened, uploads on a timer, and uploads
 * whenever the app goes to the background (it may be killed there).
 */
export function useAnalyticsLifecycle() {
  useEffect(() => {
    track("app_opened", { cold_start: true });
    const timer = setInterval(() => tracker.flush(), FLUSH_INTERVAL_MS);
    let previous = AppState.currentState;
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active" && previous !== "active") {
        track("app_opened", { cold_start: false });
      } else if (next !== "active") {
        tracker.flush();
      }
      previous = next;
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, []);
}
