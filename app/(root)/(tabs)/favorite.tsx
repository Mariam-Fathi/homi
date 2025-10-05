// app/favorites.tsx
import {
    ActivityIndicator,
    FlatList,
    Image,
    SafeAreaView,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { useEffect } from "react";
import { router } from "expo-router";

import icons from "@/constants/icons";
import { Card } from "@/components/Cards";

import { getUserFavorites } from "@/lib/appwrite";
import { useAppwrite } from "@/lib/useAppwrite";
import { useAuthStore } from "@/store/authStore";

const Favorites = () => {
    const { user } = useAuthStore();

    const {
        data: favorites,
        refetch,
        loading,
    } = useAppwrite({
        fn: getUserFavorites,
        params: { userId: user?.$id || "" },
        skip: !user?.$id,
    });

    useEffect(() => {
        if (user?.$id) {
            refetch({ userId: user.$id });
        }
    }, [user?.$id]);

    const handleCardPress = (property: any) => {
        router.push(`/properties/${property.$id}`);
    };

    const handleBackPress = () => {
        router.back();
    };

    return (
        <SafeAreaView className="h-full bg-white">
            <FlatList
                data={favorites || []}
                numColumns={2}
                renderItem={({ item }) => (
                    <Card item={item} onPress={() => handleCardPress(item)} />
                )}
                keyExtractor={(item) => item.$id}
                contentContainerClassName="pb-32"
                columnWrapperClassName="flex gap-5 px-5"
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                    loading ? (
                        <ActivityIndicator size="large" className="text-primary-300 mt-5" />
                    ) : !user?.$id ? (
                        <View className="flex items-center justify-center mt-20 px-5">
                            <Image
                                source={icons.heart}
                                className="w-24 h-24 mb-4"
                                tintColor="#9CA3AF"
                            />
                            <Text className="text-2xl font-rubik-bold text-black-300 mt-5">
                                Please Log In
                            </Text>
                            <Text className="text-base text-black-100 mt-2 text-center">
                                Sign in to view your favorite properties
                            </Text>
                            <TouchableOpacity
                                className="bg-primary-300 px-6 py-3 rounded-full mt-6"
                                onPress={() => router.push('/(auth)/auth')}
                            >
                                <Text className="text-white font-rubik-bold text-base">
                                    Log In
                                </Text>
                            </TouchableOpacity>
                        </View>
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
                ListHeaderComponent={() => (
                    <View className="px-5">
                        <View className="flex flex-row items-center justify-between mt-5">
                            <TouchableOpacity
                                onPress={handleBackPress}
                                className="flex flex-row bg-primary-200 rounded-full size-11 items-center justify-center"
                            >
                                <Image source={icons.backArrow} className="size-5" />
                            </TouchableOpacity>

                            <Text className="text-base mr-2 text-center font-rubik-medium text-black-300">
                                Your Favorite Properties
                            </Text>
                            <Image source={icons.bell} className="w-6 h-6" />
                        </View>

                        <View className="mt-5">
                            <Text className="text-xl font-rubik-bold text-black-300">
                                {favorites?.length || 0} Saved Properties
                            </Text>
                            <Text className="text-sm font-rubik text-gray-500 mt-1">
                                Properties you've added to favorites
                            </Text>
                        </View>
                    </View>
                )}
            />
        </SafeAreaView>
    );
};

export default Favorites;