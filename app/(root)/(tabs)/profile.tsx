import {
  Alert,
  Image,
  ImageSourcePropType,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { logout } from "@/lib/appwrite";
import icons from "@/constants/icons";
import { settings } from "@/constants/data";
import { useAuthStore } from "@/store/authStore";
import { Redirect, router } from "expo-router";
import { useNotification } from "@/context/NotificationContext";
import { NewPropertiesCheck } from "@/components/NewPropertiesCheck";

interface SettingsItemProp {
  icon: ImageSourcePropType;
  title: string;
  onPress?: () => void;
  textStyle?: string;
  showArrow?: boolean;
}

const SettingsItem = ({
                        icon,
                        title,
                        onPress,
                        textStyle,
                        showArrow = true,
                      }: SettingsItemProp) => (
    <TouchableOpacity
        onPress={onPress}
        className="flex flex-row items-center justify-between py-3"
    >
      <View className="flex flex-row items-center gap-3">
        <Image source={icon} className="size-6" tintColor={'black'} />
        <Text className={`text-lg font-rubik-medium text-black-300 ${textStyle}`}>
          {title}
        </Text>
      </View>

      {showArrow && <Image source={icons.rightArrow} className="size-5" />}
    </TouchableOpacity>
);

const Profile = () => {
  const { notification, expoPushToken, error } = useNotification();

  const { user, fetchCurrentUser, isAuthenticated } = useAuthStore();

  const handleNotificationPress = () => {
    router.push('../notifications');
  };

  const handleLogout = async () => {
    const result = await logout();
    if (result) {
      fetchCurrentUser();
    } else {
      Alert.alert("Error", "Failed to logout");
    }
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
            <View className={'flex-row gap-2 items-center'}>
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

            <Image source={icons.bell} className="w-6 h-6" />
          </View>


          <View className="flex flex-row justify-center mt-5">
            <View className="flex flex-col items-center relative mt-5">
              <Image
                  source={{ uri: user?.avatar }}
                  className="size-44 relative rounded-full"
              />

              <Text className="text-2xl font-rubik mt-2">{user?.name}</Text>
            </View>
          </View>

          <NewPropertiesCheck />

          <View className="flex flex-col border-t pt-5 border-primary-200 mt-5">
            {settings.map((item, index) => (
                <SettingsItem key={index} {...item} />
            ))}
          </View>

          <View className="flex flex-col border-t mt-5 pt-5 border-primary-200">
            <SettingsItem
                icon={icons.logout}
                title="Logout"
                textStyle="text-danger"
                showArrow={false}
                onPress={handleLogout}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
  );
};

export default Profile;