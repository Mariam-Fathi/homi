/**
 * @jest-environment node
 */
import { renderHook, act, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import { useAppwrite } from "@/lib/useAppwrite";

jest.spyOn(Alert, "alert").mockImplementation(() => {});

describe("useAppwrite", () => {
  it("returns loading then data when fn resolves", async () => {
    const fn = jest.fn().mockResolvedValue([{ id: "1" }]);
    const { result } = renderHook(() =>
      useAppwrite({ fn, params: { q: "x" }, skip: false })
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
      useAppwrite({ fn, params: {}, skip: true })
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
      useAppwrite({ fn, params: { a: "1" }, skip: false })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.refetch({ a: "2" });
    });

    expect(fn).toHaveBeenLastCalledWith({ a: "2" });
    expect(result.current.data).toEqual({ id: "2" });
  });
});
