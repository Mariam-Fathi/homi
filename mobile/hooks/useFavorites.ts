import { useEffect } from "react";
import { useAuthStore } from "@/store/authStore";
import { useFavoritesStore } from "@/store/favoritesStore";

export const useFavorites = (propertyId: string) => {
  const userId = useAuthStore((state) => state.user?.id);
  const load = useFavoritesStore((state) => state.load);
  const toggle = useFavoritesStore((state) => state.toggle);
  const isSaved = useFavoritesStore((state) => state.ids.has(propertyId));
  const isLoading = useFavoritesStore((state) => state.pending.has(propertyId));

  useEffect(() => {
    if (userId) load(userId);
  }, [userId, load]);

  const handleHeartPress = async () => {
    if (!userId) return;
    await toggle(propertyId);
  };

  return {
    isSaved: !!userId && isSaved,
    isLoading,
    handleHeartPress,
    hasUser: !!userId,
  };
};
