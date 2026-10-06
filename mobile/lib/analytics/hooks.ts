import { useCallback, useRef } from "react";
import type { ViewToken } from "react-native";
import { useFocusEffect } from "expo-router";

import { track, type PropertyList, type Screen } from "./index";

/** Records screen_viewed every time the screen comes into focus. */
export function useScreenView(screen: Screen) {
  useFocusEffect(
    useCallback(() => {
      track("screen_viewed", { screen });
    }, [screen])
  );
}

const VIEWABILITY = { itemVisiblePercentThreshold: 50, minimumViewTime: 300 };

/**
 * FlatList props that record property_impression for cards that are actually seen
 * (at least half visible for 300 ms), once per card per screen visit.
 */
export function useImpressionTracking(list: PropertyList) {
  const seen = useRef(new Set<string>());

  // A new visit to the screen counts impressions again.
  useFocusEffect(
    useCallback(() => {
      seen.current = new Set();
    }, [])
  );

  // FlatList requires this callback to keep the same identity across renders.
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      for (const { item, index, isViewable } of viewableItems) {
        const id: string | undefined = item?.id;
        if (!isViewable || !id || index == null || seen.current.has(id))
          continue;
        seen.current.add(id);
        track("property_impression", {
          property_id: id,
          list,
          position: index,
        });
      }
    }
  ).current;

  return { onViewableItemsChanged, viewabilityConfig: VIEWABILITY };
}

type SearchParams = { filter?: string; query?: string; limit?: number };

/**
 * Wraps a property-search function so each completed search records
 * search_performed / filter_applied with the total matches for exactly that query
 * (recording from the screen instead could pair a new query with stale results).
 * Returns a stable function, as useApi requires.
 */
export function useTrackedSearch<R extends { total: number }>(
  search: (params: SearchParams) => Promise<R>
) {
  const last = useRef({ query: "", filter: "All" });

  return useRef(async (params: SearchParams) => {
    const result = await search(params);
    const current = {
      query: (params.query ?? "").trim(),
      filter: params.filter || "All",
    };

    if (current.query && current.query !== last.current.query) {
      track("search_performed", {
        query: current.query.slice(0, 100),
        results_count: result.total,
      });
    }
    if (current.filter !== last.current.filter) {
      track("filter_applied", {
        filter: current.filter,
        results_count: result.total,
      });
    }
    last.current = current;
    return result;
  }).current;
}
