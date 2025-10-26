import {
  ActivityIndicator,
  FlatList,
  Image,
  Text,
  TouchableOpacity,
  View,
  RefreshControl,
} from "react-native";
import { useEffect, useCallback, useState, useRef } from "react";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import icons from "@/constants/icons";

import Search from "@/components/Search";
import Filters from "@/components/Filters";
import NoResults from "@/components/NoResult";
import { Card, FeaturedCard } from "@/components/Cards";

import { useAppwrite } from "@/lib/useAppwrite";
import {
  getLatestProperties,
  getNotifications,
  getProperties,
} from "@/lib/appwrite";
import { useAuthStore } from "@/store/authStore";

const Home = () => {
  const { user } = useAuthStore();
  const [refreshing, setRefreshing] = useState(false);
  const isMountedRef = useRef(false);

  const params = useLocalSearchParams<{ query?: string; filter?: string }>();

  const { data: latestProperties, loading: latestPropertiesLoading } =
    useAppwrite({
      fn: getLatestProperties,
    });

  const {
    data: properties,
    refetch,
    loading,
  } = useAppwrite({
    fn: getProperties,
    params: {
      filter: params.filter!,
      query: params.query!,
      limit: 6,
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
        limit: 6,
      });
    }
  }, [params.filter, params.query]);

  // Create a stable callback for refreshing notifications
  const handleRefreshNotifications = useCallback(async () => {
    if (user?.$id) {
      await refreshNotifications({ userId: user.$id });
    }
  }, [user?.$id, refreshNotifications]);

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

  // Pull to refresh handler
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // Refresh notifications with proper parameters
      if (user?.$id) {
        await refreshNotifications({ userId: user.$id });
      }
      
      // Refresh properties with current parameters
      await refetch({
        filter: params.filter!,
        query: params.query!,
        limit: 6,
      });
    } catch (error) {
      console.error("Refresh error:", error);
    } finally {
      setRefreshing(false);
    }
  }, [refreshNotifications, refetch, params.filter, params.query, user?.$id]);

  const handleCardPress = (id: string) => router.push(`/properties/${id}`);

  return (
    <SafeAreaView className="h-full bg-white">
      <FlatList
        data={properties}
        numColumns={2}
        renderItem={({ item }) => (
          <Card item={item} onPress={() => handleCardPress(item.$id)} />
        )}
        keyExtractor={(item) => item.$id}
        contentContainerClassName="pb-32"
        columnWrapperClassName="flex gap-5 px-5"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
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
              <View className="flex flex-row">
                <Image
                  source={{ uri: user?.avatar }}
                  className="size-12 rounded-full"
                  resizeMode="cover"
                />

                <View className="flex flex-col items-start ml-2 justify-center">
                  <Text className="text-xs font-rubik text-black-100">
                    Good Morning
                  </Text>
                  <Text className="text-base font-rubik-medium text-black-300">
                    {user?.name}
                  </Text>
                </View>
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

            <View className="my-5">
              <View className="flex flex-row items-center justify-between">
                <Text className="text-xl font-rubik-bold text-black-300">
                  Featured
                </Text>
                <TouchableOpacity onPress={() => router.push(`/explore`)}>
                  <Text className="text-base font-rubik-bold text-primary-300">
                    See all
                  </Text>
                </TouchableOpacity>
              </View>

              {latestPropertiesLoading ? (
                <ActivityIndicator size="large" className="text-primary-300" />
              ) : !latestProperties || latestProperties.length === 0 ? (
                <NoResults />
              ) : (
                <FlatList
                  data={latestProperties}
                  renderItem={({ item }) => (
                    <FeaturedCard
                      item={item}
                      onPress={() => handleCardPress(item.$id)}
                    />
                  )}
                  keyExtractor={(item) => item.$id}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerClassName="flex gap-5 mt-5"
                />
              )}
            </View>

            <View className="mt-5">
              <View className="flex flex-row items-center justify-between">
                <Text className="text-xl font-rubik-bold text-black-300">
                  Properties
                </Text>
                <TouchableOpacity onPress={() => router.push(`/explore`)}>
                  <Text className="text-base font-rubik-bold text-primary-300">
                    See all
                  </Text>
                </TouchableOpacity>
              </View>

              <Filters />
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
};

export default Home;