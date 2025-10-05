import icons from "@/constants/icons";
import images from "@/constants/images";
import { Image, Text, TouchableOpacity, View } from "react-native";
import { Models } from "react-native-appwrite";
import { useFavorites } from "@/hooks/useFavorites";
import {useViewTracking} from "@/hooks/useViewTracking";

interface Props {
    item: Models.Document;
    onPress?: () => void;
}

export const FeaturedCard = ({ item, onPress }: Props) => {
    const { isSaved, handleHeartPress, hasUser } = useFavorites(item);
    const { handleTrackView } = useViewTracking(item);

    const handlePress = () => {
        handleTrackView();
        if (onPress) onPress();
    };

    return (
        <TouchableOpacity
            onPress={handlePress}
            className="flex flex-col items-start w-60 h-80 relative"
            activeOpacity={0.9}
        >
            <Image
                source={{ uri: item.image }}
                className="size-full rounded-2xl"
                resizeMode="cover"
            />

            {/* Gradient Overlay */}
            <Image
                source={images.cardGradient}
                className="size-full rounded-2xl absolute bottom-0"
                resizeMode="cover"
            />

            {/* Rating Badge */}
            <View className="flex flex-row items-center bg-white/90 px-3 py-1.5 rounded-full absolute top-5 right-5">
                <Image source={icons.star} className="size-3.5" />
                <Text className="text-xs font-rubik-bold text-primary-300 ml-1">
                    {item.rating}
                </Text>
            </View>

            {/* Content Overlay */}
            <View className="flex flex-col items-start absolute bottom-5 inset-x-5">
                <Text
                    className="text-xl font-rubik-extrabold text-white"
                    numberOfLines={1}
                >
                    {item.name}
                </Text>
                <Text className="text-base font-rubik text-white" numberOfLines={1}>
                    {item.address}
                </Text>

                <View className="flex flex-row items-center justify-between w-full mt-2">
                    <Text className="text-xl font-rubik-extrabold text-white">
                        EGP {item.price}
                    </Text>
                    <TouchableOpacity
                        onPress={handleHeartPress}
                        className="p-2"
                        disabled={!hasUser}
                    >
                        <Image
                            source={icons.heart}
                            className="size-5"
                            tintColor={isSaved ? "#dc2626" : "#ffffff"}
                        />
                    </TouchableOpacity>
                </View>
            </View>
        </TouchableOpacity>
    );
};

export const Card = ({ item, onPress }: Props) => {
    const { isSaved, handleHeartPress, hasUser } = useFavorites(item);
    const { handleTrackView } = useViewTracking(item);

    const handlePress = () => {
        handleTrackView();
        if (onPress) onPress();
    };

    return (
        <TouchableOpacity
            className="flex-1 w-full mt-4 px-3 py-4 rounded-lg bg-white shadow-lg shadow-black-100/70 relative"
            onPress={handlePress}
            activeOpacity={0.9}
        >
            <View className="flex flex-row items-center absolute px-2 top-5 right-5 bg-white/90 p-1 rounded-full z-50">
                <Image source={icons.star} className="size-2.5" />
                <Text className="text-xs font-rubik-bold text-primary-300 ml-0.5">
                    {item.rating}
                </Text>
            </View>

            <Image
                source={{ uri: item.image }}
                className="w-full h-40 rounded-lg"
                resizeMode="cover"
            />

            <View className="flex flex-col mt-2">
                <Text className="text-base font-rubik-bold text-black-300" numberOfLines={1}>
                    {item.name}
                </Text>
                <Text className="text-xs font-rubik text-black-100 mt-1" numberOfLines={1}>
                    {item.address}
                </Text>

                <View className="flex flex-row items-center justify-between mt-3">
                    <Text className="text-base font-rubik-bold text-primary-300">
                        EGP {item.price}
                    </Text>
                    <TouchableOpacity
                        onPress={handleHeartPress}
                        className="p-1"
                        disabled={!hasUser}
                    >
                        <Image
                            source={icons.heart}
                            className="w-5 h-5"
                            tintColor={isSaved ? "#dc2626" : "#191D31"}
                        />
                    </TouchableOpacity>
                </View>
            </View>
        </TouchableOpacity>
    );
};