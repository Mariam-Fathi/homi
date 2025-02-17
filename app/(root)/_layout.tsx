import { Stack } from "expo-router";
import { NotificationProvider } from "@/context/NotificationContext";
import * as Notifications from "expo-notifications";

export default function RootLayout() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });

  return (
    <NotificationProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="properties/[id]" />
        <Stack.Screen name="success-payment" />
      </Stack>
    </NotificationProvider>
  );
}
