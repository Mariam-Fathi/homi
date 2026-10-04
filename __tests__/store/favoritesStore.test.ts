/**
 * @jest-environment node
 */
jest.mock("@/lib/appwrite", () => ({
  getUserFavoriteIds: jest.fn(),
  addToFavorites: jest.fn(),
  removeFromFavorites: jest.fn(),
}));

import {
  addToFavorites,
  getUserFavoriteIds,
  removeFromFavorites,
} from "@/lib/appwrite";
import { useFavoritesStore } from "@/store/favoritesStore";

const property = { $id: "p1", name: "Villa" } as any;

describe("favoritesStore", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => {});
    useFavoritesStore.getState().reset();
  });

  it("loads favorite ids once per user", async () => {
    (getUserFavoriteIds as jest.Mock).mockResolvedValue(["p1", "p2"]);

    await useFavoritesStore.getState().load("u1");
    await useFavoritesStore.getState().load("u1");

    expect(getUserFavoriteIds).toHaveBeenCalledTimes(1);
    expect(useFavoritesStore.getState().ids.has("p2")).toBe(true);
    expect(useFavoritesStore.getState().loadedFor).toBe("u1");
  });

  it("adds and removes a favorite", async () => {
    (addToFavorites as jest.Mock).mockResolvedValue({});
    (removeFromFavorites as jest.Mock).mockResolvedValue(undefined);

    await useFavoritesStore.getState().toggle("u1", property);
    expect(useFavoritesStore.getState().ids.has("p1")).toBe(true);

    await useFavoritesStore.getState().toggle("u1", property);
    expect(useFavoritesStore.getState().ids.has("p1")).toBe(false);
    expect(removeFromFavorites).toHaveBeenCalledWith({ userId: "u1", propertyId: "p1" });
  });

  it("rolls back the optimistic update when the request fails", async () => {
    (addToFavorites as jest.Mock).mockRejectedValue(new Error("offline"));

    await useFavoritesStore.getState().toggle("u1", property);

    expect(useFavoritesStore.getState().ids.has("p1")).toBe(false);
    expect(useFavoritesStore.getState().pending.size).toBe(0);
  });
});
