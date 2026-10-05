import {
  ActivityIndicator,
  FlatList,
  Image,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useCallback, useEffect, useRef } from "react";
import { router, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import icons from "@/constants/icons";
import { Card } from "@/components/Cards";

import { getFavorites } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useAuthStore } from "@/store/authStore";
import { useFavoritesStore } from "@/store/favoritesStore";

const Favorites = () => {
  const { user } = useAuthStore();
  const favoriteIds = useFavoritesStore((state) => state.ids);
  const loadFavoriteIds = useFavoritesStore((state) => state.load);
  const favoriteIdsReady = useFavoritesStore(
    (state) => !!user?.id && state.loadedFor === user.id
  );
  const hasFocusedRef = useRef(false);

  const {
    data: favorites,
    refetch,
    loading,
  } = useApi({
    fn: getFavorites,
    skip: !user?.id,
  });

  useEffect(() => {
    if (user?.id) loadFavoriteIds(user.id);
  }, [user?.id, loadFavoriteIds]);

  // Pick up favorites added elsewhere when returning to this screen.
  useFocusEffect(
    useCallback(() => {
      if (!hasFocusedRef.current) {
        hasFocusedRef.current = true;
        return;
      }
      if (user?.id) refetch({});
    }, [user?.id, refetch])
  );

  // Hide properties un-hearted since the last fetch without waiting for a refetch.
  const visibleFavorites = (favorites ?? []).filter(
    (property) => !favoriteIdsReady || favoriteIds.has(property.id)
  );

  const handleCardPress = (propertyId: string) => {
    router.push(`/properties/${propertyId}`);
  };

  return (
    <SafeAreaView className="h-full bg-white">
      <FlatList
        data={visibleFavorites}
        numColumns={2}
        renderItem={({ item }) => (
          <Card item={item} onPress={() => handleCardPress(item.id)} />
        )}
        keyExtractor={(item) => item.id}
        contentContainerClassName="pb-32"
        columnWrapperClassName="flex gap-5 px-5"
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator size="large" className="text-primary-300 mt-5" />
          ) : (
            <View className="flex items-center justify-center mt-20 px-5">
              <Image
                source={icons.heart}
                className="w-24 h-24 mb-4"
                tintColor="#9CA3AF"
              />
              <Text className="text-2xl font-rubik-bold text-black-300 mt-5">
                No Favorites Yet
              </Text>
              <Text className="text-base text-black-100 mt-2 text-center">
                Properties you save will appear here
              </Text>
            </View>
          )
        }
        ListHeaderComponent={
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
                  Favorites
                </Text>
              </View>
            </View>
          </View>
        }
      />
    </SafeAreaView>
  );
};

export default Favorites;
