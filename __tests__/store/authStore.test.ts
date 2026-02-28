/**
 * @jest-environment node
 */
import { create } from "zustand";

// Mock appwrite before store imports it
jest.mock("@/lib/appwrite", () => ({
  getCurrentUser: jest.fn().mockResolvedValue(null),
  logout: jest.fn().mockResolvedValue(undefined),
  deleteAccount: jest.fn(),
}));

import { deleteAccount as appwriteDeleteAccount } from "@/lib/appwrite";
import { useAuthStore } from "@/store/authStore";
import type { DeleteAccountResult } from "@/types/appwrite";

describe("authStore", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({
      user: { $id: "u1", name: "Test", email: "t@t.com", avatar: "https://..." },
      isAuthenticated: true,
      loading: false,
    });
  });

  describe("deleteAccount", () => {
    it("returns result with success and message when appwrite succeeds", async () => {
      const result: DeleteAccountResult = {
        success: true,
        message: "All your personal data has been permanently deleted.",
        details: { dataDeleted: ["favorites"], identityDeleted: true, sessionsCleared: true },
      };
      (appwriteDeleteAccount as jest.Mock).mockResolvedValue(result);

      const storeResult = await useAuthStore.getState().deleteAccount();

      expect(storeResult).toEqual(result);
      expect(storeResult.success).toBe(true);
      expect(storeResult.message).toBeDefined();
    });

    it("returns partial success object when appwrite throws", async () => {
      (appwriteDeleteAccount as jest.Mock).mockRejectedValue(new Error("Network error"));

      const storeResult = await useAuthStore.getState().deleteAccount();

      expect(storeResult).toMatchObject({
        success: true,
        message: "Account deactivated. Most of your data has been deleted.",
        details: { partial: true },
      });
    });
  });
});
