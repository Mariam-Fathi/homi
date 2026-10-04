import { getCurrentUser, logout as appwriteLogout, deleteAccount } from "@/lib/appwrite";
import { create } from "zustand";
import type { DeleteAccountResult } from "@/types/appwrite";

interface StoreType {
  isAuthenticated: boolean;
  loading: boolean;
  user: User | null;
  fetchCurrentUser: () => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<DeleteAccountResult>;
}

interface User {
  $id: string;
  name: string;
  email: string;
  avatar: string;
}

export const useAuthStore = create<StoreType>((set) => ({
  isAuthenticated: false,
  // Starts true because the session check below runs as soon as the store is created;
  // screens wait for it instead of redirecting to the login screen prematurely.
  loading: true,
  user: null,
  fetchCurrentUser: async () => {
    set({ loading: true });
    try {
      const currentUser = await getCurrentUser();
      set({
        user: currentUser,
        isAuthenticated: !!currentUser,
        loading: false,
      });
    } catch (error) {
      console.log(error);
      set({ loading: false });
    }
  },
  logout: async () => {
    try {
      await appwriteLogout();
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      set({ user: null, isAuthenticated: false });
    }
  },
  deleteAccount: async (): Promise<DeleteAccountResult> => {
    set({ loading: true });
    try {
      const result = await deleteAccount();
      // Once the account is deactivated its sessions are gone, so sign out locally
      // even if some data could not be removed.
      if (result.details?.sessionsCleared) {
        set({ user: null, isAuthenticated: false });
      }
      return result;
    } catch (error) {
      console.error("Delete account error:", error);
      return {
        success: false,
        message: "We couldn't delete your account. Please check your connection and try again.",
      };
    } finally {
      set({ loading: false });
    }
  },
}));

useAuthStore.getState().fetchCurrentUser();
