import {
  ActivityIndicator,
  FlatList,
  Image,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { notify } from "@/lib/dialog";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import icons from "@/constants/icons";
import { useAuthStore } from "@/store/authStore";
import {
  getNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { track } from "@/lib/analytics";
import { useScreenView } from "@/lib/analytics/hooks";
import type { AppNotification } from "@/types/api";

const NotificationItem = ({
  notification,
  onPress,
}: {
  notification: AppNotification;
  onPress: () => void;
}) => {
  return (
    <TouchableOpacity
      onPress={onPress}
      className={`flex flex-row items-start p-4 border-b border-gray-200 ${
        !notification.is_read ? "bg-primary-100" : "bg-white"
      }`}
    >
      <View className="flex-1 ml-3">
        <Text className="text-base font-rubik-bold text-black-300">
          {notification.title}
        </Text>
        <Text className="text-sm font-rubik text-gray-600 mt-1">
          {notification.message}
        </Text>
        <Text className="text-xs font-rubik text-gray-400 mt-2">
          {new Date(notification.created_at).toLocaleDateString()}
        </Text>
      </View>

      {!notification.is_read && (
        <View className="w-2 h-2 bg-primary-300 rounded-full" />
      )}
    </TouchableOpacity>
  );
};

const Notifications = () => {
  useScreenView("notifications");
  const { user } = useAuthStore();

  const {
    data: notifications,
    refetch,
    loading,
  } = useApi({
    fn: getNotifications,
    skip: !user?.id,
  });

  const hasUnread = !!notifications?.some((n) => !n.is_read);

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsAsRead();
      refetch({});
    } catch {
      notify("Error", "Couldn't update your notifications. Please try again.");
    }
  };

  const handleNotificationPress = async (notification: AppNotification) => {
    track("notification_opened", {
      notification_id: notification.id,
      kind: notification.kind,
      property_id: notification.related_property_id,
      via: "list",
    });
    if (!notification.is_read) {
      try {
        await markNotificationAsRead(notification.id);
        refetch({});
      } catch {
        notify("Error", "Couldn't update this notification. Please try again.");
      }
    }

    if (notification.related_property_id) {
      router.push(
        `/properties/${notification.related_property_id}?source=notification`
      );
    }
  };

  return (
    <SafeAreaView className="h-full bg-white">
      <FlatList
        data={notifications || []}
        renderItem={({ item }) => (
          <NotificationItem
            notification={item}
            onPress={() => handleNotificationPress(item)}
          />
        )}
        keyExtractor={(item) => item.id}
        contentContainerClassName="pb-20"
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator size="large" className="text-primary-300 mt-5" />
          ) : (
            <View className="flex items-center justify-center mt-20 px-5">
              <Image
                source={icons.bell}
                className="w-24 h-24 mb-4"
                tintColor="#9CA3AF"
              />
              <Text className="text-2xl font-rubik-bold text-black-300 mt-5">
                No Notifications
              </Text>
              <Text className="text-base text-black-100 mt-2 text-center">
                You don't have any notifications yet
              </Text>
            </View>
          )
        }
        ListHeaderComponent={
          <View className="px-5">
            <View className="flex flex-row items-center justify-between mt-5 mb-6">
              <View className={"flex-row gap-2 items-center"}>
                <TouchableOpacity
                  onPress={() => router.back()}
                  className="flex flex-row bg-primary-200 rounded-full size-11 items-center justify-center"
                >
                  <Image source={icons.backArrow} className="size-5" />
                </TouchableOpacity>

                <Text className="text-2xl mr-2 text-center font-rubik text-black-300">
                  Notifications
                </Text>
              </View>
              {hasUnread && (
                <TouchableOpacity onPress={handleMarkAllRead}>
                  <Text className="text-sm font-rubik-medium text-primary-300">
                    Mark all read
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        }
      />
    </SafeAreaView>
  );
};

export default Notifications;
