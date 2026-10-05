/**
 * @jest-environment node
 */
jest.mock("@/lib/api", () => ({
  getFavoriteIds: jest.fn(),
  addFavorite: jest.fn(),
  removeFavorite: jest.fn(),
}));

import { addFavorite, getFavoriteIds, removeFavorite } from "@/lib/api";
import { useFavoritesStore } from "@/store/favoritesStore";


describe("favoritesStore", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => {});
    useFavoritesStore.getState().reset();
  });

  it("loads favorite ids once per user", async () => {
    (getFavoriteIds as jest.Mock).mockResolvedValue(["p1", "p2"]);

    await useFavoritesStore.getState().load("u1");
    await useFavoritesStore.getState().load("u1");

    expect(getFavoriteIds).toHaveBeenCalledTimes(1);
    expect(useFavoritesStore.getState().ids.has("p2")).toBe(true);
    expect(useFavoritesStore.getState().loadedFor).toBe("u1");
  });

  it("adds and removes a favorite", async () => {
    (addFavorite as jest.Mock).mockResolvedValue({});
    (removeFavorite as jest.Mock).mockResolvedValue(undefined);

    await useFavoritesStore.getState().toggle("p1");
    expect(useFavoritesStore.getState().ids.has("p1")).toBe(true);

    await useFavoritesStore.getState().toggle("p1");
    expect(useFavoritesStore.getState().ids.has("p1")).toBe(false);
    expect(removeFavorite).toHaveBeenCalledWith("p1");
  });

  it("rolls back the optimistic update when the request fails", async () => {
    (addFavorite as jest.Mock).mockRejectedValue(new Error("offline"));

    await useFavoritesStore.getState().toggle("p1");

    expect(useFavoritesStore.getState().ids.has("p1")).toBe(false);
    expect(useFavoritesStore.getState().pending.size).toBe(0);
  });
});
