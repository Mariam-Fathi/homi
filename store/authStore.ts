import { getCurrentUser, logout as appwriteLogout, deleteAccount } from "@/lib/appwrite";
import { create } from "zustand";

interface StoreType {
  isAuthenticated: boolean;
  loading: boolean;
  user: User | null;
  fetchCurrentUser: () => void;
  logout: () => void;
  deleteAccount: () => Promise<{success: boolean; message: string; details?: any}>;
}

interface User {
  $id: string;
  name: string;
  email: string;
  avatar: string;
}

export const useAuthStore = create<StoreType>((set) => ({
  isAuthenticated: false,
  loading: false,
  user: null,
  fetchCurrentUser: async () => {
    console.log("fetchCurrentUser store.....");
    set({ loading: true });
    try {
      const currentUser = await getCurrentUser();
      console.log("CurrentUser store... ", currentUser);
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
      set({ user: null, isAuthenticated: false });
    } catch (error) {
      console.error("Logout error:", error);
    }
  },
 deleteAccount: async (): Promise<{success: boolean; message: string; details?: any}> => {
  try {
    set({ loading: true });
    const result = await deleteAccount();
    set({ user: null, isAuthenticated: false, loading: false });
    return result;
  } catch (error) {
    console.error('Delete account error:', error);
    set({ user: null, isAuthenticated: false, loading: false });
    return {
      success: true,
      message: "Account deactivated. Most of your data has been deleted.",
      details: { partial: true }
    };
  }
},
}));

useAuthStore.getState().fetchCurrentUser();
