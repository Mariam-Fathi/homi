import { useCallback } from "react";
import { useFocusEffect } from "expo-router";
import { getNotifications } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useAuthStore } from "@/store/authStore";
import type { AppNotification } from "@/types/api";

/**
 * Centralizes notification list + unread count + refetch on focus for tab screens.
 * Use on Home and Explore to avoid duplicating useApi + useFocusEffect logic.
 */
export function useNotificationsBadge() {
  const { user } = useAuthStore();
  const {
    data: notifications,
    refetch: refreshNotifications,
    loading: notificationsLoading,
  } = useApi({
    fn: getNotifications,
    // Fetching is driven by useFocusEffect below (it also runs on first focus).
    skip: true,
  });

  const unreadCount =
    notifications?.filter((n: AppNotification) => !n.is_read).length ?? 0;

  useFocusEffect(
    useCallback(() => {
      if (!user?.id) return;
      let isActive = true;
      const run = async () => {
        try {
          if (isActive) await refreshNotifications({});
        } catch (e) {
          console.error("Failed to refresh notifications:", e);
        }
      };
      run();
      return () => {
        isActive = false;
      };
    }, [user?.id, refreshNotifications])
  );

  const refresh = useCallback(async () => {
    if (user?.id) await refreshNotifications({});
  }, [user?.id, refreshNotifications]);

  return {
    notifications: notifications ?? [],
    unreadCount,
    refreshNotifications: refresh,
    notificationsLoading,
  };
}
