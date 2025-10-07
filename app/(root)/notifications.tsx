import {
    FlatList,
    Image,
    SafeAreaView,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { router } from "expo-router";
import { useEffect } from "react";

import icons from "@/constants/icons";
import { useAuthStore } from "@/store/authStore";
import { getNotifications, markNotificationAsRead } from "@/lib/appwrite";
import { useAppwrite } from "@/lib/useAppwrite";

const NotificationItem = ({ notification, onPress }: {
    notification: any;
    onPress: () => void;
}) => {
    return (
        <TouchableOpacity
            onPress={onPress}
            className={`flex flex-row items-start p-4 border-b border-gray-200 ${
                !notification.isRead ? 'bg-primary-50' : 'bg-white'
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
                    {new Date(notification.$createdAt).toLocaleDateString()}
                </Text>
            </View>

            {!notification.isRead && (
                <View className="w-2 h-2 bg-primary-300 rounded-full" />
            )}
        </TouchableOpacity>
    );
};

const Notifications = () => {
    const { user } = useAuthStore();

    const {
        data: notifications,
        refetch,
        loading,
    } = useAppwrite({
        fn: getNotifications,
        params: { userId: user?.$id || "" },
        skip: !user?.$id,
    });

    useEffect(() => {
        if (user?.$id) {
            refetch({ userId: user.$id });
        }
    }, [user?.$id]);

    const handleNotificationPress = async (notification: any) => {
        if (!notification.isRead) {
            await markNotificationAsRead({ notificationId: notification.$id });
        }

        if (notification.relatedPropertyId) {
            router.push(`/properties/${notification.relatedPropertyId}`);
        }

        refetch({ userId: user?.$id || "" });
    };

    const handleBackPress = () => {
        router.back();
    };

    const unreadCount = notifications?.filter((n: any) => !n.isRead).length || 0;

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
                keyExtractor={(item) => item.$id}
                contentContainerClassName="pb-20"
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
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
                }
                ListHeaderComponent={() => (
                    <View className="px-5">
                        <View className="flex flex-row items-center justify-between mt-5 mb-6">
                            <View className={'flex-row gap-2 items-center'}>
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
                        </View>
                    </View>
                )}
            />
        </SafeAreaView>
    );
};

export default Notifications;