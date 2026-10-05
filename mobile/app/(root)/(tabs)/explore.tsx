import {
  ActivityIndicator,
  FlatList,
  Image,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import icons from "@/constants/icons";
import Search from "@/components/Search";
import { Card } from "@/components/Cards";
import Filters from "@/components/Filters";
import NoResults from "@/components/NoResult";
import NotificationBell from "@/components/NotificationBell";

import { getProperties } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useNotificationsBadge } from "@/hooks/useNotificationsBadge";

const Explore = () => {
  const params = useLocalSearchParams<{ query?: string; filter?: string }>();
  const { unreadCount } = useNotificationsBadge();

  // useApi refetches by itself whenever filter/query change.
  const { data: properties, loading } = useApi({
    fn: getProperties,
    params: {
      filter: params.filter,
      query: params.query,
    },
  });

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
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator size="large" className="text-primary-300 mt-5" />
          ) : (
            <NoResults />
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
                  Explore
                </Text>
              </View>
              <NotificationBell unreadCount={unreadCount} />
            </View>

            <Search />

            <View className="mt-5">
              <Filters />

              <Text className="text-xl font-rubik-bold text-black-300 mt-5">
                {loading
                  ? "Searching..."
                  : `Found ${properties?.length ?? 0} ${
                      properties?.length === 1 ? "Property" : "Properties"
                    }`}
              </Text>
            </View>
          </View>
        }
      />
    </SafeAreaView>
  );
};

export default Explore;
