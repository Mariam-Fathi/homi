import { useEffect, useRef } from "react";
import { Redirect, Stack } from "expo-router";
import { NotificationProvider } from "@/context/NotificationContext";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { useAuthStore } from "@/store/authStore";
import { checkNewProperties } from "@/lib/api";
import { showLocalNotification } from "@/utils/showLocalNotification";

// expo-notifications has no web implementation.
if (Platform.OS !== "web")
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });

export default function RootLayout() {
  const { user, isAuthenticated, loading } = useAuthStore();
  const checkedUserRef = useRef<string | null>(null);

  // Check for new matching properties once per signed-in user per app session.
  // The server decides and records the notification; we also show it on-device.
  useEffect(() => {
    if (!user?.id || checkedUserRef.current === user.id) return;
    checkedUserRef.current = user.id;
    checkNewProperties()
      .then(({ notification }) => {
        if (notification) {
          showLocalNotification(notification.title, notification.message, {
            id: notification.related_property_id,
          });
        }
      })
      .catch((error) => console.error("Error in new properties check:", error));
  }, [user?.id]);

  if (!loading && !isAuthenticated) return <Redirect href="/(auth)/auth" />;

  return (
    <NotificationProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="properties/[id]" />
        <Stack.Screen name="notifications" />
        <Stack.Screen name="favorite" />
        <Stack.Screen name="viewings" />
      </Stack>
    </NotificationProvider>
  );
}
