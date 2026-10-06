/**
 * @jest-environment node
 */
jest.mock("@/lib/api", () => {
  return {
    ApiError: jest.requireActual("@/lib/api").ApiError,
    getMe: jest.fn(),
    loginAsGuest: jest.fn(),
    loginWithPhone: jest.fn(),
    deleteMyAccount: jest.fn(),
    setUnauthorizedHandler: jest.fn(),
  };
});

jest.mock("@/lib/analytics", () => ({
  track: jest.fn(),
  flushAnalytics: jest.fn().mockResolvedValue(undefined),
  setAnalyticsUser: jest.fn(),
}));

import { ApiError, deleteMyAccount, getMe, loginAsGuest } from "@/lib/api";
import { flushAnalytics, track } from "@/lib/analytics";
import { tokenStorage } from "@/lib/tokenStorage";
import { useAuthStore } from "@/store/authStore";
import type { User } from "@/types/api";

const user: User = {
  id: "u1",
  name: "Test",
  phone: "+201001234567",
  is_demo: false,
  role: "user",
};

describe("authStore", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => {});
    await tokenStorage.clear();
    useAuthStore.setState({ user: null, isAuthenticated: false, loading: false });
  });

  it("guest login stores the token and signs in", async () => {
    (loginAsGuest as jest.Mock).mockResolvedValue({ access_token: "tok", user });

    await useAuthStore.getState().loginAsGuest();

    expect(await tokenStorage.get()).toBe("tok");
    expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: true, user });
  });

  it("restores a stored session on launch", async () => {
    await tokenStorage.set("tok");
    (getMe as jest.Mock).mockResolvedValue(user);

    await useAuthStore.getState().fetchCurrentUser();

    expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: true, loading: false });
  });

  it("drops an expired token but keeps it on network errors", async () => {
    await tokenStorage.set("tok");
    (getMe as jest.Mock).mockRejectedValueOnce(new ApiError(0, "offline"));
    await useAuthStore.getState().fetchCurrentUser();
    expect(await tokenStorage.get()).toBe("tok");

    (getMe as jest.Mock).mockRejectedValueOnce(new ApiError(401, "expired"));
    await useAuthStore.getState().fetchCurrentUser();
    expect(await tokenStorage.get()).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it("deleting the account signs out and clears the token", async () => {
    await tokenStorage.set("tok");
    useAuthStore.setState({ user, isAuthenticated: true });
    (deleteMyAccount as jest.Mock).mockResolvedValue(undefined);

    const result = await useAuthStore.getState().deleteAccount();

    expect(result.success).toBe(true);
    expect(await tokenStorage.get()).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it("a failed deletion keeps the user signed in", async () => {
    useAuthStore.setState({ user, isAuthenticated: true });
    (deleteMyAccount as jest.Mock).mockRejectedValue(new ApiError(500, "boom"));

    const result = await useAuthStore.getState().deleteAccount();

    expect(result).toEqual({ success: false, message: "boom" });
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it("logout records signed_out and uploads it before the token is cleared", async () => {
    await tokenStorage.set("tok");
    useAuthStore.setState({ user, isAuthenticated: true });
    let tokenAtFlush: string | null = "unset";
    (flushAnalytics as jest.Mock).mockImplementation(async () => {
      tokenAtFlush = await tokenStorage.get();
    });

    await useAuthStore.getState().logout();

    expect(track).toHaveBeenCalledWith("signed_out", {});
    // Uploaded while still signed in, so the event is attributed to the user.
    expect(tokenAtFlush).toBe("tok");
    expect(await tokenStorage.get()).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});
