import { useEffect } from "react";
import { useAuthStore } from "@/store/authStore";
import { useFavoritesStore } from "@/store/favoritesStore";
import { Models } from "react-native-appwrite";
import type { Property } from "@/types/appwrite";

export const useFavorites = (property: Models.Document) => {
    const userId = useAuthStore((state) => state.user?.$id);
    const load = useFavoritesStore((state) => state.load);
    const toggle = useFavoritesStore((state) => state.toggle);
    const isSaved = useFavoritesStore((state) => state.ids.has(property.$id));
    const isLoading = useFavoritesStore((state) => state.pending.has(property.$id));

    useEffect(() => {
        if (userId) load(userId);
    }, [userId, load]);

    const handleHeartPress = async () => {
        if (!userId) {
            console.log('User must be logged in to save favorites');
            return;
        }
        await toggle(userId, property as unknown as Property);
    };

    return {
        isSaved: !!userId && isSaved,
        isLoading,
        handleHeartPress,
        hasUser: !!userId
    };
};
