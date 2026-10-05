import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  ReactNode,
} from "react";
import * as Notifications from "expo-notifications";
import { registerForPushNotificationsAsync } from "@/utils/registerForPushNotificationsAsync";
import { router } from "expo-router";
import { Platform } from "react-native";

interface NotificationContextType {
  expoPushToken: string | null;
  notification: Notifications.Notification | null;
  error: Error | null;
}

const NotificationContext = createContext<NotificationContextType | undefined>(
    undefined
);

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error(
        "useNotification must be used within a NotificationProvider"
    );
  }
  return context;
};

interface NotificationProviderProps {
  children: ReactNode;
}

export const NotificationProvider: React.FC<NotificationProviderProps> = ({
                                                                            children,
                                                                          }: {
  children: ReactNode;
}) => {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [notification, setNotification] =
      useState<Notifications.Notification | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const notificationListener = useRef<Notifications.EventSubscription>();
  const responseListener = useRef<Notifications.EventSubscription>();

  useEffect(() => {
    // expo-notifications has no web implementation.
    if (Platform.OS === "web") return;

    registerForPushNotificationsAsync().then(
        (token) => setExpoPushToken(token),
        (error) => setError(error)
    );

    const openNotificationTarget = (
        response: Notifications.NotificationResponse
    ) => {
      const propertyId = response.notification.request.content.data?.id;
      if (propertyId) {
        router.push(`/properties/${propertyId}`);
      }
    };

    // Handle a notification tap that launched the app from a killed state;
    // the response listener below only sees taps while the app is running.
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) openNotificationTarget(response);
    });

    notificationListener.current =
        Notifications.addNotificationReceivedListener((notification) => {
          console.log("🔔 Notification Received: ", notification);
          setNotification(notification);
        });

    responseListener.current =
        Notifications.addNotificationResponseReceivedListener((response) => {
          console.log(
              "🔔 Notification Response: ",
              JSON.stringify(response, null, 2),
              JSON.stringify(response.notification.request.content.data, null, 2)
          );

          openNotificationTarget(response);
        });

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, []);

  return (
      <NotificationContext.Provider
          value={{ expoPushToken, notification, error }}
      >
        {children}
      </NotificationContext.Provider>
  );
};