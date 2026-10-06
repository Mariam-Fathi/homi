/**
 * @jest-environment node
 */
import { renderHook } from "@testing-library/react-native";

// Run focus effects like normal effects, and expose them so a test can "refocus".
let refocus: () => void = () => {};
jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => void) => {
    const { useEffect } = require("react");
    refocus = effect;
    useEffect(effect, [effect]);
  },
}));
jest.mock("@/lib/analytics", () => ({ track: jest.fn() }));

import { track } from "@/lib/analytics";
import { useImpressionTracking } from "@/lib/analytics/hooks";

const token = (id: string, index: number, isViewable = true) =>
  ({ item: { id }, index, isViewable, key: id }) as any;

describe("useImpressionTracking", () => {
  beforeEach(() => (track as jest.Mock).mockClear());

  it("records each visible card once per screen visit, with its position", () => {
    const { result } = renderHook(() => useImpressionTracking("explore"));
    const { onViewableItemsChanged } = result.current;

    onViewableItemsChanged({ viewableItems: [token("a", 0), token("b", 1)], changed: [] } as any);
    // Scrolling back over the same cards doesn't count them again.
    onViewableItemsChanged({ viewableItems: [token("b", 1), token("c", 2)], changed: [] } as any);

    expect((track as jest.Mock).mock.calls).toEqual([
      ["property_impression", { property_id: "a", list: "explore", position: 0 }],
      ["property_impression", { property_id: "b", list: "explore", position: 1 }],
      ["property_impression", { property_id: "c", list: "explore", position: 2 }],
    ]);
  });

  it("ignores cards that aren't actually visible", () => {
    const { result } = renderHook(() => useImpressionTracking("home"));
    result.current.onViewableItemsChanged({
      viewableItems: [token("a", 0, false)],
      changed: [],
    } as any);
    expect(track).not.toHaveBeenCalled();
  });

  it("counts cards again on a new visit to the screen", () => {
    const { result } = renderHook(() => useImpressionTracking("favorites"));
    const seen = { viewableItems: [token("a", 0)], changed: [] } as any;

    result.current.onViewableItemsChanged(seen);
    refocus();
    result.current.onViewableItemsChanged(seen);

    expect(track).toHaveBeenCalledTimes(2);
  });

  it("uses the viewability rule from the tracking plan", () => {
    const { result } = renderHook(() => useImpressionTracking("home"));
    expect(result.current.viewabilityConfig).toEqual({
      itemVisiblePercentThreshold: 50,
      minimumViewTime: 300,
    });
  });
});
