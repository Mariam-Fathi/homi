import {
  Alert,
  Image,
  ImageSourcePropType,
  Modal,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { getNotifications, logout } from "@/lib/appwrite";
import icons from "@/constants/icons";
import { settings } from "@/constants/data";
import { useAuthStore } from "@/store/authStore";
import { Redirect, router } from "expo-router";
import { useNotification } from "@/context/NotificationContext";
import { useAppwrite } from "@/lib/useAppwrite";
import { useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";

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

// Delete Account Modal Component
const DeleteAccountModal = ({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const { deleteAccount } = useAuthStore();

  const handleDeleteAccount = async () => {
    Alert.alert(
      "Delete Account",
      "Are you sure you want to delete your account? This will permanently remove:\n\n• Your profile\n• All your favorites\n• Your activity history\n• All personal data\n\nThis action cannot be undone!",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete Account",
          style: "destructive",
          onPress: async () => {
            try {
              setIsDeleting(true);
              const success = await deleteAccount();

              if (success) {
                Alert.alert(
                  "Account Deleted",
                  "Your account has been permanently deleted.",
                  [{ text: "OK" }]
                );
                onClose();
                // User will be automatically redirected to auth screen due to isAuthenticated change
              } else {
                Alert.alert(
                  "Deletion Failed",
                  "Failed to delete account. Please try again."
                );
              }
            } catch (error) {
              Alert.alert(
                "Error",
                "An error occurred while deleting your account."
              );
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ]
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-center items-center bg-black/50">
        <View className="bg-white rounded-2xl p-6 mx-4 w-11/12">
          <Text className="text-2xl font-rubik-bold text-center text-red-600 mb-4">
            Delete Account
          </Text>

          <Text className="text-base font-rubik text-gray-700 text-center mb-2">
            This action will permanently delete your account and all associated
            data.
          </Text>

          <Text className="text-sm font-rubik text-gray-500 text-center mb-6">
            You will lose all your favorites, activity history, and personal
            information. This cannot be undone.
          </Text>

          <View className="flex-row justify-between space-x-4 gap-2">
            <TouchableOpacity
              onPress={onClose}
              disabled={isDeleting}
              className="flex-1 bg-gray-200 rounded-full py-3"
            >
              <Text className="text-lg font-rubik-medium text-gray-700 text-center">
                Cancel
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleDeleteAccount}
              disabled={isDeleting}
              className="flex-1 bg-red-600 rounded-full py-3 flex-row justify-center items-center"
            >
              {isDeleting ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Text className="text-lg font-rubik-medium text-white text-center">
                  Delete
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const Profile = () => {
  const { notification, expoPushToken, error } = useNotification();
  const { user, fetchCurrentUser, isAuthenticated, logout } = useAuthStore();
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);

  const {
    data: notifications,
    refetch,
    loading: notificationsLoading,
  } = useAppwrite({
    fn: getNotifications,
    params: { userId: user?.$id || "" },
    skip: !user?.$id,
  });

  const unreadCount = notifications?.filter((n: any) => !n.isRead).length || 0;

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

  if (error) {
    return <Text>Error: {error.message}</Text>;
  }

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

        {/* NewPropertiesCheck component removed from here */}

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
              icon={icons.run} // Using logout icon as placeholder, replace with delete icon
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
