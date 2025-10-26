import icons from "@/constants/icons";
import { useFavorites } from "@/hooks/useFavorites";
import { Image, TouchableOpacity } from "react-native";
import { Models } from "react-native-appwrite";

export const FavoriteButton = ({ property }: { property: Models.Document }) => {
  const { isSaved, handleHeartPress } = useFavorites(property);
  
  return (
    <TouchableOpacity onPress={handleHeartPress}>
      <Image
        source={icons.heart}
        className="size-7"
        tintColor={isSaved ? "#dc2626" : "#191D31"}
      />
    </TouchableOpacity>
  );
};












