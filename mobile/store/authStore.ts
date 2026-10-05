import { create } from "zustand";
import {
  ApiError,
  deleteMyAccount,
  getMe,
  loginAsGuest as apiLoginAsGuest,
  loginWithPhone as apiLoginWithPhone,
  setUnauthorizedHandler,
} from "@/lib/api";
import { tokenStorage } from "@/lib/tokenStorage";
import type { TokenResponse, User } from "@/types/api";

export interface DeleteAccountResult {
  success: boolean;
  message: string;
}

interface StoreType {
  isAuthenticated: boolean;
  loading: boolean;
  user: User | null;
  fetchCurrentUser: () => Promise<void>;
  loginWithPhone: (input: { name: string; phone: string; country: string }) => Promise<void>;
  loginAsGuest: () => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<DeleteAccountResult>;
}

export const useAuthStore = create<StoreType>((set) => {
  const startSession = async ({ access_token, user }: TokenResponse) => {
    await tokenStorage.set(access_token);
    set({ user, isAuthenticated: true });
  };

  const endSession = async () => {
    await tokenStorage.clear();
    set({ user: null, isAuthenticated: false });
  };

  // A rejected token (expired, or the account was deleted elsewhere) signs us out.
  setUnauthorizedHandler(() => {
    endSession();
  });

  return {
    isAuthenticated: false,
    // Starts true because the stored-session check below runs as soon as the store
    // is created; screens wait for it instead of flashing the login screen.
    loading: true,
    user: null,

    fetchCurrentUser: async () => {
      set({ loading: true });
      try {
        if (!(await tokenStorage.get())) {
          set({ user: null, isAuthenticated: false });
          return;
        }
        const user = await getMe();
        set({ user, isAuthenticated: true });
      } catch (error) {
        // Keep the token on network errors so an offline launch doesn't log people out.
        if (error instanceof ApiError && error.status === 401) await endSession();
        else console.log("Session check failed:", error);
      } finally {
        set({ loading: false });
      }
    },

    loginWithPhone: async (input) => {
      await startSession(await apiLoginWithPhone(input));
    },

    loginAsGuest: async () => {
      await startSession(await apiLoginAsGuest());
    },

    logout: async () => {
      // Tokens are stateless, so signing out is local.
      await endSession();
    },

    deleteAccount: async () => {
      set({ loading: true });
      try {
        await deleteMyAccount();
        await endSession();
        return {
          success: true,
          message: "Your account and all of your data have been permanently deleted.",
        };
      } catch (error) {
        console.error("Delete account error:", error);
        return {
          success: false,
          message:
            error instanceof ApiError
              ? error.message
              : "We couldn't delete your account. Please try again.",
        };
      } finally {
        set({ loading: false });
      }
    },
  };
});

useAuthStore.getState().fetchCurrentUser();
