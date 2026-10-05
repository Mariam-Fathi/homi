/**
 * @jest-environment node
 */
import { ApiError, addFavorite, getProperties, setUnauthorizedHandler } from "@/lib/api";
import { tokenStorage } from "@/lib/tokenStorage";

const mockFetch = (status: number, body?: unknown) =>
  (global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as any);

describe("api client", () => {
  beforeEach(async () => {
    await tokenStorage.clear();
    setUnauthorizedHandler(null);
  });

  it("sends the stored token and builds the query string", async () => {
    await tokenStorage.set("abc");
    mockFetch(200, { items: [{ id: "p1" }], total: 1, limit: 6, offset: 0 });

    const items = await getProperties({ filter: "Villas", query: "", limit: 6 });

    expect(items).toEqual([{ id: "p1" }]);
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    // Empty params are dropped instead of sent as `q=`.
    expect(url).toBe("http://api.test/properties?type=Villas&limit=6");
    expect(init.headers.Authorization).toBe("Bearer abc");
  });

  it("surfaces FastAPI error messages", async () => {
    mockFetch(409, { detail: "You already have an open request for this property" });

    await expect(addFavorite("p1")).rejects.toMatchObject({
      status: 409,
      message: "You already have an open request for this property",
    });
  });

  it("uses the first validation message for 422 responses", async () => {
    mockFetch(422, { detail: [{ msg: "phone may only contain digits" }] });

    await expect(addFavorite("p1")).rejects.toThrow("phone may only contain digits");
  });

  it("calls the unauthorized handler on 401", async () => {
    const onUnauthorized = jest.fn();
    setUnauthorizedHandler(onUnauthorized);
    mockFetch(401, { detail: "Not authenticated" });

    await expect(addFavorite("p1")).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("turns network failures into a readable error", async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError("Network request failed")) as any;

    await expect(addFavorite("p1")).rejects.toMatchObject({ status: 0 });
  });
});
