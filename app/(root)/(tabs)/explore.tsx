import {
  ActivityIndicator,
  FlatList,
  Image,
  SafeAreaView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useEffect, useCallback, useRef } from "react";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";

import icons from "@/constants/icons";
import Search from "@/components/Search";
import { Card } from "@/components/Cards";
import Filters from "@/components/Filters";
import NoResults from "@/components/NoResult";

import { getNotifications, getProperties } from "@/lib/appwrite";
import { useAppwrite } from "@/lib/useAppwrite";
import { useAuthStore } from "@/store/authStore";

const Explore = () => {
  const params = useLocalSearchParams<{ query?: string; filter?: string }>();
  const { user } = useAuthStore();
  const isMountedRef = useRef(false);

  const {
    data: properties,
    refetch,
    loading,
  } = useAppwrite({
    fn: getProperties,
    params: {
      filter: params.filter!,
      query: params.query!,
    },
    skip: true,
  });

  const {
    data: notifications,
    refetch: refreshNotifications,
    loading: notificationsLoading,
  } = useAppwrite({
    fn: getNotifications,
    params: { userId: user?.$id || "" },
    skip: !user?.$id,
  });

  const unreadCount = notifications?.filter((n: any) => !n.isRead).length || 0;

  // Use ref to track if component is mounted to prevent infinite loops
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Refetch properties when filter or query changes
  useEffect(() => {
    if (isMountedRef.current) {
      refetch({
        filter: params.filter!,
        query: params.query!,
      });
    }
  }, [params.filter, params.query]);

  // Refetch notifications when screen comes into focus - with proper cleanup
  useFocusEffect(
    useCallback(() => {
      if (!user?.$id) return;

      let isActive = true;

      const fetchNotifications = async () => {
        try {
          if (isActive) {
            await refreshNotifications({ userId: user.$id });
          }
        } catch (error) {
          console.error("Failed to refresh notifications:", error);
        }
      };

      fetchNotifications();

      return () => {
        isActive = false;
      };
    }, [user?.$id]) // Only depend on user?.$id, not refreshNotifications
  );

  const handleCardPress = () => {};

  return (
    <SafeAreaView className="h-full bg-white">
      <FlatList
        data={properties}
        numColumns={2}
        renderItem={({ item }) => (
          <Card item={item} onPress={handleCardPress} />
        )}
        keyExtractor={(item) => item.$id}
        contentContainerClassName="pb-32"
        columnWrapperClassName="flex gap-5 px-5"
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator size="large" className="text-primary-300 mt-5" />
          ) : (
            <NoResults />
          )
        }
        ListHeaderComponent={() => (
          <View className="px-5">
            <View className="flex flex-row items-center justify-between mt-5">
              <View className={"flex-row gap-2 items-center"}>
                <TouchableOpacity
                  onPress={() => router.back()}
                  className="flex flex-row bg-primary-200 rounded-full size-11 items-center justify-center"
                >
                  <Image source={icons.backArrow} className="size-5" />
                </TouchableOpacity>

                <Text className="text-2xl mr-2 text-center font-rubik text-black-300">
                  Explore
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => router.push("/notifications")}
                className="relative"
              >
                <Image source={icons.bell} className="w-6 h-6" />
                {unreadCount > 0 && (
                  <View className="absolute -top-1 -right-1 bg-red-500 rounded-full w-4 h-4 items-center justify-center">
                    <Text className="text-white text-xs font-rubik-bold">
                      {unreadCount}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            <Search />

            <View className="mt-5">
              <Filters />

              <Text className="text-xl font-rubik-bold text-black-300 mt-5">
                Found {properties?.length} Properties
              </Text>
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
};

export default Explore;
