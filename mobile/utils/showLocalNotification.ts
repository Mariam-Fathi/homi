import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

/** Shows a notification on this device immediately (no push server involved). */
export async function showLocalNotification(
  title: string,
  body: string,
  data: Record<string, unknown> = {}
) {
  // No web implementation; the in-app notifications list still shows it.
  if (Platform.OS === "web") return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, data, sound: "default" },
      trigger: null,
    });
  } catch (error) {
    console.error("Error showing notification:", error);
  }
}
