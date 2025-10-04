import icons from "@/constants/icons";
import images from "@/constants/images";
import { Image, Text, TouchableOpacity, View } from "react-native";
import { Models } from "react-native-appwrite";
import { trackUserActivity } from "@/lib/appwrite";
import { useState } from "react";
import {useAuthStore} from "@/store/authStore"; // Add this import

interface Props {
    item: Models.Document;
    onPress?: () => void;
}

export const FeaturedCard = ({ item, onPress }: Props) => {
    const {user} = useAuthStore();
    const [isSaved, setIsSaved] = useState<boolean>(false);

    const handlePress = () => {
        trackUserActivity('viewed', item, user.$id); // Add userId
        if (onPress) onPress();
    };

    const handleHeartPress = () => {
        if (isSaved) {
            trackUserActivity('unsaved', item, user.$id); // Add userId
        } else {
            trackUserActivity('saved', item, user.$id); // Add userId
        }
        setIsSaved(!isSaved); // Toggle the saved state
    };

    return (
        <TouchableOpacity
            onPress={handlePress}
            className="flex flex-col items-start w-60 h-80 relative"
        >
            <Image source={{ uri: item.image }} className="size-full rounded-2xl" />

            <Image
                source={images.cardGradient}
                className="size-full rounded-2xl absolute bottom-0"
            />

            <View className="flex flex-row items-center bg-white/90 px-3 py-1.5 rounded-full absolute top-5 right-5">
                <Image source={icons.star} className="size-3.5 mt-[-3px]" />
                <Text className="text-xs font-rubik-bold text-primary-300 ml-1">
                    {item.rating}
                </Text>
            </View>

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

                <View className="flex flex-row items-center justify-between w-full">
                    <Text className="text-xl font-rubik-extrabold text-white">
                        EGP {item.price}
                    </Text>
                    <TouchableOpacity onPress={handleHeartPress}>
                        <Image
                            source={icons.heart}
                            className="size-5"
                            tintColor={isSaved ? "#dc2626" : "#ffffff"} // Change color when saved
                        />
                    </TouchableOpacity>
                </View>
            </View>
        </TouchableOpacity>
    );
};

export const Card = ({ item, onPress }: Props) => {
    const [isSaved, setIsSaved] = useState<boolean>(false);

    const handlePress = () => {
        trackUserActivity('viewed', item, "68d973281a3322078585"); // Add userId
        if (onPress) onPress();
    };

    const handleHeartPress = () => {
        if (isSaved) {
            trackUserActivity('unsaved', item, "68d973281a3322078585"); // Add userId
        } else {
            trackUserActivity('saved', item, "68d973281a3322078585"); // Add userId
        }
        setIsSaved(!isSaved); // Toggle the saved state
    };

    return (
        <TouchableOpacity
            className="flex-1 w-full mt-4 px-3 py-4 rounded-lg bg-white shadow-lg shadow-black-100/70 relative"
            onPress={handlePress}
        >
            <View className="flex flex-row items-center absolute px-2 top-5 right-5 bg-white/90 p-1 rounded-full z-50">
                <Image source={icons.star} className="size-2.5 mt-[-3px]" />
                <Text className="text-xs font-rubik-bold text-primary-300 ml-0.5">
                    {item.rating}
                </Text>
            </View>

            <Image source={{ uri: item.image }} className="w-full h-40 rounded-lg" />

            <View className="flex flex-col mt-2">
                <Text className="text-base font-rubik-bold text-black-300">
                    {item.name}
                </Text>
                <Text className="text-xs font-rubik text-black-100">
                    {item.address}
                </Text>

                <View className="flex flex-row items-center justify-between mt-2">
                    <Text className="text-base font-rubik-bold text-primary-300">
                        EGP {item.price}
                    </Text>
                    <TouchableOpacity onPress={handleHeartPress}>
                        <Image
                            source={icons.heart}
                            className="w-5 h-5 mr-2"
                            tintColor={isSaved ? "#dc2626" : "#191D31"} // Change color when saved
                        />
                    </TouchableOpacity>
                </View>
            </View>
        </TouchableOpacity>
    );
};