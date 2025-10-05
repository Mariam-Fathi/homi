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

interface NotificationContextType {
  expoPushToken: string | null;
  notification: Notifications.Notification | null;
  error: Error | null;
  sendPushNotification: (title: string, body: string, data?: any) => Promise<void>;
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

  const sendPushNotification = async (title: string, body: string, data?: any) => {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data: data || {},
          sound: 'default',
          badge: 1,
        },
        trigger: null,
      });
      console.log('📱 Push notification sent:', title);
    } catch (error) {
      console.error('Error sending push notification:', error);
      throw error;
    }
  };

  useEffect(() => {
    registerForPushNotificationsAsync().then(
        (token) => setExpoPushToken(token),
        (error) => setError(error)
    );

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

          const data = response.notification.request.content.data;
          const propertyId = data?.id;

          if (propertyId) {
            router.push(`/properties/${propertyId}`);
          }
        });

    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(
            notificationListener.current
        );
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, []);

  return (
      <NotificationContext.Provider
          value={{ expoPushToken, notification, error, sendPushNotification }}
      >
        {children}
      </NotificationContext.Provider>
  );
};