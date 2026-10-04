/**
 * @jest-environment node
 */
import { fetchAPI } from "@/lib/fetch";

describe("fetchAPI", () => {
  beforeEach(() => {
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  it("throws the server's error message on a non-2xx response", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: "Missing or invalid payment details" }),
    }) as any;

    await expect(fetchAPI("/api/payment-sheet")).rejects.toThrow(
      "Missing or invalid payment details"
    );
  });

  it("returns parsed JSON on success", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ url: "https://checkout" }),
    }) as any;

    await expect(fetchAPI("/api/x")).resolves.toEqual({ url: "https://checkout" });
  });
});
