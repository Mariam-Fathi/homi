import { useCallback } from "react";
import { useFocusEffect } from "expo-router";
import { getNotifications } from "@/lib/appwrite";
import { useAppwrite } from "@/lib/useAppwrite";
import { useAuthStore } from "@/store/authStore";
import type { AppwriteNotification } from "@/types/appwrite";

/**
 * Centralizes notification list + unread count + refetch on focus for tab screens.
 * Use on Home and Explore to avoid duplicating useAppwrite + useFocusEffect logic.
 */
export function useNotificationsBadge() {
  const { user } = useAuthStore();
  const {
    data: notifications,
    refetch: refreshNotifications,
    loading: notificationsLoading,
  } = useAppwrite({
    fn: getNotifications,
    params: { userId: user?.$id ?? "" },
    skip: !user?.$id,
  });

  const unreadCount =
    notifications?.filter((n: AppwriteNotification) => !n.isRead).length ?? 0;

  useFocusEffect(
    useCallback(() => {
      if (!user?.$id) return;
      let isActive = true;
      const run = async () => {
        try {
          if (isActive) await refreshNotifications({ userId: user.$id });
        } catch (e) {
          console.error("Failed to refresh notifications:", e);
        }
      };
      run();
      return () => {
        isActive = false;
      };
    }, [user?.$id, refreshNotifications])
  );

  const refresh = useCallback(async () => {
    if (user?.$id) await refreshNotifications({ userId: user.$id });
  }, [user?.$id, refreshNotifications]);

  return {
    notifications: notifications ?? [],
    unreadCount,
    refreshNotifications: refresh,
    notificationsLoading,
  };
}
