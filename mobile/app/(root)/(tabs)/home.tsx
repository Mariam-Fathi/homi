import {
  ActivityIndicator,
  FlatList,
  Text,
  TouchableOpacity,
  View,
  RefreshControl,
} from "react-native";
import { useCallback, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import Search from "@/components/Search";
import Filters from "@/components/Filters";
import NoResults from "@/components/NoResult";
import NotificationBell from "@/components/NotificationBell";
import { Card, FeaturedCard } from "@/components/Cards";
import UserAvatar from "@/components/UserAvatar";

import { useApi } from "@/lib/useApi";
import { getFeaturedProperties, getProperties } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { useNotificationsBadge } from "@/hooks/useNotificationsBadge";

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good Morning";
  if (hour < 18) return "Good Afternoon";
  return "Good Evening";
};

const Home = () => {
  const { user } = useAuthStore();
  const [refreshing, setRefreshing] = useState(false);
  const { unreadCount, refreshNotifications } = useNotificationsBadge();

  const params = useLocalSearchParams<{ query?: string; filter?: string }>();

  const {
    data: latestProperties,
    loading: latestPropertiesLoading,
    refetch: refetchLatest,
  } = useApi({
    fn: getFeaturedProperties,
  });

  // useApi refetches by itself whenever filter/query change.
  const {
    data: properties,
    refetch,
    loading,
  } = useApi({
    fn: getProperties,
    params: {
      filter: params.filter,
      query: params.query,
      limit: 6,
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        refreshNotifications(),
        refetchLatest({}),
        refetch({
          filter: params.filter,
          query: params.query,
          limit: 6,
        }),
      ]);
    } catch (error) {
      console.error("Refresh error:", error);
    } finally {
      setRefreshing(false);
    }
  }, [
    refreshNotifications,
    refetchLatest,
    refetch,
    params.filter,
    params.query,
  ]);

  const handleCardPress = (id: string) => router.push(`/properties/${id}`);

  return (
    <SafeAreaView className="h-full bg-white">
      <FlatList
        data={properties}
        numColumns={2}
        renderItem={({ item }) => (
          <Card item={item} onPress={() => handleCardPress(item.id)} />
        )}
        keyExtractor={(item) => item.id}
        contentContainerClassName="pb-32"
        columnWrapperClassName="flex gap-5 px-5"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
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
        // An element (not an inline component) so the header — and the search
        // input inside it — isn't remounted on every render.
        ListHeaderComponent={
          <View className="px-5">
            <View className="flex flex-row items-center justify-between mt-5">
              <View className="flex flex-row">
                <UserAvatar name={user?.name ?? ""} size={48} />

                <View className="flex flex-col items-start ml-2 justify-center">
                  <Text className="text-xs font-rubik text-black-100">
                    {getGreeting()}
                  </Text>
                  <Text className="text-base font-rubik-medium text-black-300">
                    {user?.name}
                  </Text>
                </View>
              </View>
              <NotificationBell unreadCount={unreadCount} />
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
                      onPress={() => handleCardPress(item.id)}
                    />
                  )}
                  keyExtractor={(item) => item.id}
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
        }
      />
    </SafeAreaView>
  );
};

export default Home;
