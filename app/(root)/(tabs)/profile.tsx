import {
  Alert,
  Image,
  ImageSourcePropType,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
} from "react-native";
import icons from "@/constants/icons";
import { settings } from "@/constants/data";
import { useAuthStore } from "@/store/authStore";
import { Redirect, router } from "expo-router";
import { useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import DeleteAccountModal from "@/components/DeleteAccountModal";

interface SettingsItemProp {
  icon: ImageSourcePropType;
  title: string;
  href?: string;
  onPress?: () => void;
  textStyle?: string;
  showArrow?: boolean;
}

const SettingsItem = ({
  icon,
  href,
  title,
  onPress,
  textStyle,
  showArrow = true,
}: SettingsItemProp) => (
  <TouchableOpacity
    onPress={onPress ? onPress : () => href && router.push(href as any)}
    className="flex flex-row items-center justify-between py-3"
  >
    <View className="flex flex-row items-center gap-3">
      <Image source={icon} className="size-6" tintColor={"black"} />
      <Text className={`text-lg font-rubik-medium text-black-300 ${textStyle}`}>
        {title}
      </Text>
    </View>

    {showArrow && <Image source={icons.rightArrow} className="size-5" />}
  </TouchableOpacity>
);

const Profile = () => {
  const { user, isAuthenticated, logout } = useAuthStore();
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);

  const handleLogout = async () => {
    Alert.alert("Logout", "Are you sure you want to logout?", [
      {
        text: "Cancel",
        style: "cancel",
      },
      {
        text: "Logout",
        style: "destructive",
        onPress: async () => {
          try {
            await logout();
            console.log("✅ Logged out successfully");
          } catch (error) {
            console.error("Logout error:", error);
            Alert.alert("Error", "Failed to logout. Please try again.");
          }
        },
      },
    ]);
  };

  if (!isAuthenticated) return <Redirect href="/(auth)/auth" />;

  return (
    <SafeAreaView className="h-full bg-white">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerClassName="pb-24 px-6"
      >
        <View className="flex flex-row items-center justify-between mt-5">
          <View className={"flex-row gap-2 items-center"}>
            <TouchableOpacity
              onPress={() => router.back()}
              className="flex flex-row bg-primary-200 rounded-full size-11 items-center justify-center"
            >
              <Image source={icons.backArrow} className="size-5" />
            </TouchableOpacity>

            <Text className="text-2xl mr-2 text-center font-rubik text-black-300">
              Profile
            </Text>
          </View>
        </View>

        <View className="flex flex-row justify-center mt-5">
          <View className="flex flex-col items-center relative mt-5">
            <Image
              source={{ uri: user?.avatar }}
              className="size-44 relative rounded-full"
            />

            <Text className="text-2xl font-rubik mt-2">{user?.name}</Text>
            <Text className="text-base font-rubik text-gray-500 mt-1">
              {user?.email}
            </Text>
          </View>
        </View>

        <View className="flex flex-col border-t pt-5 border-primary-200 mt-5">
          {settings.map((item, index) => (
            <SettingsItem key={index} {...item} />
          ))}
        </View>

        {/* Account Actions Section */}
        <View className="flex flex-col border-t mt-5 pt-5 border-primary-200">
          <SettingsItem
            icon={icons.logout}
            title="Logout"
            textStyle="text-orange-500"
            showArrow={false}
            onPress={handleLogout}
          />

          <View className="border-t border-gray-200 mt-2 pt-2">
            <SettingsItem
              icon={icons.run}
              title="Delete Account"
              textStyle="text-red-600"
              showArrow={false}
              onPress={() => setDeleteModalVisible(true)}
            />
          </View>
        </View>
      </ScrollView>

      {/* Delete Account Modal */}
      <DeleteAccountModal
        visible={deleteModalVisible}
        onClose={() => setDeleteModalVisible(false)}
      />
    </SafeAreaView>
  );
};

export default Profile;
