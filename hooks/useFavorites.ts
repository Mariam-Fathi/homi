import { useState, useEffect } from "react";
import { useAuthStore } from "@/store/authStore";
import { isPropertyFavorited, addToFavorites, removeFromFavorites } from "@/lib/appwrite";
import { Models } from "react-native-appwrite";

export const useFavorites = (property: Models.Document) => {
    const { user } = useAuthStore();
    const [isSaved, setIsSaved] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState<boolean>(false);

    useEffect(() => {
        if (user?.$id) {
            checkFavoriteStatus();
        } else {
            setIsSaved(false);
        }
    }, [property.$id, user?.$id]);

    const checkFavoriteStatus = async () => {
        if (!user?.$id) return;

        try {
            const favorited = await isPropertyFavorited(user.$id, property.$id);
            setIsSaved(favorited);
        } catch (error) {
            console.error('Error checking favorite status:', error);
        }
    };

    const handleHeartPress = async () => {
        if (!user?.$id) {
            console.log('User must be logged in to save favorites');
            return;
        }

        if (isLoading) return;

        setIsLoading(true);
        try {
            if (isSaved) {
                await removeFromFavorites(user.$id, property.$id);
                setIsSaved(false);
            } else {
                await addToFavorites(user.$id, property);
                setIsSaved(true);
            }
        } catch (error) {
            console.error('Favorite operation failed:', error);
        } finally {
            setIsLoading(false);
        }
    };

    return {
        isSaved,
        isLoading,
        handleHeartPress,
        hasUser: !!user?.$id
    };
};