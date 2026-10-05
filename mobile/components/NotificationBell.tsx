import { Image, Text, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";

import icons from "@/constants/icons";

const NotificationBell = ({ unreadCount }: { unreadCount: number }) => (
  <TouchableOpacity
    onPress={() => router.push("/notifications")}
    className="relative"
  >
    <Image source={icons.bell} className="w-6 h-6" />
    {unreadCount > 0 && (
      <View className="absolute -top-1.5 -right-1.5 bg-red-500 rounded-full min-w-4 h-4 px-0.5 items-center justify-center">
        <Text className="text-white text-[10px] font-rubik-bold">
          {unreadCount > 9 ? "9+" : unreadCount}
        </Text>
      </View>
    )}
  </TouchableOpacity>
);

export default NotificationBell;
