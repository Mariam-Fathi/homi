import { create } from "zustand";
import { addFavorite, getFavoriteIds, removeFavorite } from "@/lib/api";

/**
 * Single source of truth for which properties the current user has saved, so every
 * heart icon (cards, details screen, favorites list) stays in sync and the app makes
 * one request per user instead of one per rendered card.
 */
interface FavoritesStore {
  userId: string | null;
  /** userId whose favorites have finished loading */
  loadedFor: string | null;
  ids: Set<string>;
  pending: Set<string>;
  load: (userId: string) => Promise<void>;
  toggle: (propertyId: string) => Promise<void>;
  reset: () => void;
}

export const useFavoritesStore = create<FavoritesStore>((set, get) => ({
  userId: null,
  loadedFor: null,
  ids: new Set(),
  pending: new Set(),
  load: async (userId) => {
    if (get().userId === userId) return;
    set({ userId, loadedFor: null, ids: new Set() });
    try {
      const ids = await getFavoriteIds();
      if (get().userId === userId) set({ ids: new Set(ids), loadedFor: userId });
    } catch (error) {
      console.error("Error loading favorites:", error);
      // Allow a later retry.
      if (get().userId === userId) set({ userId: null });
    }
  },
  toggle: async (propertyId) => {
    const { pending, ids } = get();
    if (pending.has(propertyId)) return;

    const wasSaved = ids.has(propertyId);
    const withId = (s: Set<string>) => new Set(s).add(propertyId);
    const withoutId = (s: Set<string>) => {
      const next = new Set(s);
      next.delete(propertyId);
      return next;
    };

    // Optimistic update, rolled back on failure.
    set({
      pending: withId(pending),
      ids: wasSaved ? withoutId(ids) : withId(ids),
    });
    try {
      if (wasSaved) {
        await removeFavorite(propertyId);
      } else {
        await addFavorite(propertyId);
      }
    } catch (error) {
      console.error("Favorite operation failed:", error);
      set((state) => ({
        ids: wasSaved ? withId(state.ids) : withoutId(state.ids),
      }));
    } finally {
      set((state) => ({ pending: withoutId(state.pending) }));
    }
  },
  reset: () =>
    set({ userId: null, loadedFor: null, ids: new Set(), pending: new Set() }),
}));
