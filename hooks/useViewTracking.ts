import { useAuthStore } from "@/store/authStore";
import { trackUserActivity } from "@/lib/appwrite";
import { Models } from "react-native-appwrite";

export const useViewTracking = (property: Models.Document) => {
    const { user } = useAuthStore();

    const handleTrackView = async () => {
        if (user?.$id) {
            await trackUserActivity({
                property,
                userId: user.$id
            });
        }
    };

    return {
        handleTrackView
    };
};