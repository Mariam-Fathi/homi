import { View, Text, Image } from "react-native";

import icons from "@/constants/icons";
import UserAvatar from "@/components/UserAvatar";
import type { Review } from "@/types/api";

interface Props {
  item: Review;
}

const Comment = ({ item }: Props) => {
  return (
    <View className="flex flex-col items-start">
      <View className="flex flex-row items-center">
        <UserAvatar name={item.reviewer_name} size={56} />
        <Text className="text-base text-black-300 text-start font-rubik-bold ml-3">
          {item.reviewer_name}
        </Text>
      </View>

      <Text className="text-black-200 text-base font-rubik mt-2">
        {item.text}
      </Text>

      <View className="flex flex-row items-center w-full justify-between mt-4">
        <View className="flex flex-row items-center">
          <Image source={icons.star} className="size-5" />
          <Text className="text-black-300 text-sm font-rubik-medium ml-2">
            {item.rating} / 5
          </Text>
        </View>
        <Text className="text-black-100 text-sm font-rubik">
          {new Date(item.created_at).toDateString()}
        </Text>
      </View>
    </View>
  );
};

export default Comment;
