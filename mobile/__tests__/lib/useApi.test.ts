/**
 * @jest-environment node
 */
import { renderHook, act, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import { useApi } from "@/lib/useApi";

jest.spyOn(Alert, "alert").mockImplementation(() => {});

describe("useApi", () => {
  it("returns loading then data when fn resolves", async () => {
    const fn = jest.fn().mockResolvedValue([{ id: "1" }]);
    const { result } = renderHook(() =>
      useApi({ fn, params: { q: "x" }, skip: false })
    );

    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toEqual([{ id: "1" }]);
    expect(fn).toHaveBeenCalledWith({ q: "x" });
  });

  it("skips initial fetch when skip is true", async () => {
    const fn = jest.fn().mockResolvedValue(null);
    const { result } = renderHook(() =>
      useApi({ fn, params: {}, skip: true })
    );

    expect(result.current.loading).toBe(false);
    expect(fn).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.refetch({});
    });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("refetch calls fn with new params", async () => {
    const fn = jest.fn().mockResolvedValue({ id: "2" });
    const { result } = renderHook(() =>
      useApi({ fn, params: { a: "1" }, skip: false })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.refetch({ a: "2" });
    });

    expect(fn).toHaveBeenLastCalledWith({ a: "2" });
    expect(result.current.data).toEqual({ id: "2" });
  });

  it("ignores a stale response that resolves after a newer one", async () => {
    let resolveSlow: (v: string) => void = () => {};
    const fn = jest
      .fn()
      .mockImplementationOnce(() => new Promise((r) => (resolveSlow = r)))
      .mockResolvedValueOnce("fresh");
    const { result } = renderHook(() =>
      useApi({ fn, params: { q: "a" }, skip: false })
    );

    await act(async () => {
      await result.current.refetch({ q: "ab" });
    });
    expect(result.current.data).toBe("fresh");

    await act(async () => {
      resolveSlow("stale");
    });
    expect(result.current.data).toBe("fresh");
  });
});
