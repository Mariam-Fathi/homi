import {
  ActivityIndicator,
  FlatList,
  Image,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { confirm, notify } from "@/lib/dialog";
import { useCallback, useRef } from "react";
import { router, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import icons from "@/constants/icons";
import {
  TIME_SLOT_LABELS,
  VIEWING_STATUS_COLORS,
  VIEWING_STATUS_LABELS,
} from "@/constants/viewings";
import {
  ApiError,
  cancelViewingRequest,
  getMyViewingRequests,
} from "@/lib/api";
import { useApi } from "@/lib/useApi";
import type { ViewingRequest } from "@/types/api";

const CANCELLABLE = new Set(["requested", "contacted", "scheduled"]);

const ViewingItem = ({
  request,
  onCancel,
}: {
  request: ViewingRequest;
  onCancel: () => void;
}) => {
  const [bg, fg] = VIEWING_STATUS_COLORS[request.status];
  return (
    <TouchableOpacity
      onPress={() => router.push(`/properties/${request.property_id}`)}
      className="flex-row p-4 border-b border-gray-200 bg-white"
    >
      <Image
        source={{ uri: request.property.image_url }}
        className="size-20 rounded-xl"
      />
      <View className="flex-1 ml-3">
        <Text
          className="text-base font-rubik-bold text-black-300"
          numberOfLines={1}
        >
          {request.property.name}
        </Text>
        <Text className="text-sm font-rubik text-black-200 mt-1">
          {new Date(`${request.preferred_date}T00:00:00`).toDateString()} ·{" "}
          {TIME_SLOT_LABELS[request.time_slot]}
        </Text>
        <View className="flex-row items-center justify-between mt-2">
          <View className={`px-2 py-1 rounded-full ${bg}`}>
            <Text className={`text-xs font-rubik-bold ${fg}`}>
              {VIEWING_STATUS_LABELS[request.status]}
            </Text>
          </View>
          {CANCELLABLE.has(request.status) && (
            <TouchableOpacity onPress={onCancel}>
              <Text className="text-sm font-rubik-medium text-red-600">
                Cancel
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

const Viewings = () => {
  const hasFocusedRef = useRef(false);
  const {
    data: requests,
    loading,
    refetch,
  } = useApi({ fn: getMyViewingRequests });

  // Statuses change on the agent's side, so refresh whenever the screen is revisited.
  useFocusEffect(
    useCallback(() => {
      if (!hasFocusedRef.current) {
        hasFocusedRef.current = true;
        return;
      }
      refetch({});
    }, [refetch])
  );

  const confirmCancel = async (request: ViewingRequest) => {
    const confirmed = await confirm({
      title: "Cancel viewing?",
      message: `Cancel your viewing of ${request.property.name}?`,
      confirmText: "Cancel viewing",
      cancelText: "Keep it",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await cancelViewingRequest(request.id);
      refetch({});
    } catch (error) {
      notify(
        "Error",
        error instanceof ApiError ? error.message : "Please try again."
      );
    }
  };

  return (
    <SafeAreaView className="h-full bg-white">
      <FlatList
        data={requests ?? []}
        renderItem={({ item }) => (
          <ViewingItem request={item} onCancel={() => confirmCancel(item)} />
        )}
        keyExtractor={(item) => item.id}
        contentContainerClassName="pb-20"
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator size="large" className="text-primary-300 mt-5" />
          ) : (
            <View className="flex items-center justify-center mt-20 px-5">
              <Image
                source={icons.calendar}
                className="w-24 h-24 mb-4"
                tintColor="#9CA3AF"
              />
              <Text className="text-2xl font-rubik-bold text-black-300 mt-5">
                No Viewings Yet
              </Text>
              <Text className="text-base text-black-100 mt-2 text-center">
                Request a viewing from any property page
              </Text>
            </View>
          )
        }
        ListHeaderComponent={
          <View className="px-5">
            <View className="flex flex-row items-center mt-5 mb-6 gap-2">
              <TouchableOpacity
                onPress={() => router.back()}
                className="flex flex-row bg-primary-200 rounded-full size-11 items-center justify-center"
              >
                <Image source={icons.backArrow} className="size-5" />
              </TouchableOpacity>
              <Text className="text-2xl text-center font-rubik text-black-300">
                My Viewings
              </Text>
            </View>
          </View>
        }
      />
    </SafeAreaView>
  );
};

export default Viewings;
