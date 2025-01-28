import { getCurrentUser } from "@/lib/appwrite";
import { create } from "zustand";

interface StoreType {
  isAuthenticated: boolean;
  loading: boolean;
  user: User | null;
  fetchCurrentUser: () => void;
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
}));

useAuthStore.getState().fetchCurrentUser();
