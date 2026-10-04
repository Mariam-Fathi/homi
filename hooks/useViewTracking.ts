import { useAuthStore } from "@/store/authStore";
import { trackUserActivity } from "@/lib/appwrite";
import { Models } from "react-native-appwrite";
import type { Property } from "@/types/appwrite";

export const useViewTracking = (property: Models.Document) => {
    const { user } = useAuthStore();

    const handleTrackView = async () => {
        if (user?.$id) {
            await trackUserActivity({
                property: property as unknown as Property,
                userId: user.$id
            });
        }
    };

    return {
        handleTrackView
    };
};