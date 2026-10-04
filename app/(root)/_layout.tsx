import { useEffect, useRef } from "react";
import { Redirect, Stack } from "expo-router";
import { NotificationProvider } from "@/context/NotificationContext";
import * as Notifications from "expo-notifications";
import { useAuthStore } from "@/store/authStore";
import { checkAndNotifyNewProperties } from "@/lib/appwrite";

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
  // (This used to live on the auth screen, which unmounts on redirect before its
  // timer fired, so the check never ran.)
  useEffect(() => {
    if (!user?.$id || checkedUserRef.current === user.$id) return;
    checkedUserRef.current = user.$id;
    checkAndNotifyNewProperties({ userId: user.$id }).catch((error) =>
      console.error("Error in new properties check:", error)
    );
  }, [user?.$id]);

  if (!loading && !isAuthenticated) return <Redirect href="/(auth)/auth" />;

  return (
    <NotificationProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="properties/[id]" />
        <Stack.Screen name="success-payment" />
        <Stack.Screen name="notifications" />
      </Stack>
    </NotificationProvider>
  );
}
