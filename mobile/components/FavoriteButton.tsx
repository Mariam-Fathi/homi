import icons from "@/constants/icons";
import { useFavorites } from "@/hooks/useFavorites";
import { Image, TouchableOpacity } from "react-native";

export const FavoriteButton = ({ propertyId }: { propertyId: string }) => {
  const { isSaved, handleHeartPress } = useFavorites(propertyId);

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
