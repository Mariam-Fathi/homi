import { Alert } from "react-native";
import { useEffect, useState, useCallback, useRef } from "react";

/**
 * Options for useAppwrite.
 * - fn: async function that takes params and returns data (e.g. getProperties, getPropertyById).
 * - params: initial/current params. When these change (by serialized key), a refetch is triggered if !skip.
 * - skip: if true, initial fetch and param-based refetch are disabled; call refetch() manually when needed.
 */
interface UseAppwriteOptions<T, P extends Record<string, string | number | undefined>> {
  fn: (params: P) => Promise<T>;
  params?: P;
  skip?: boolean;
}

interface UseAppwriteReturn<T, P extends Record<string, string | number | undefined>> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: (newParams: P) => Promise<void>;
}

/**
 * Generic data-fetching hook for Appwrite (or any async fn with params).
 * - Runs initial fetch when !skip. When `params` change (by serialized key), triggers a refetch so screens
 *   don't need a separate useEffect for filter/query changes.
 * - Skip: use skip=true when params are not ready (e.g. no userId); then call refetch(newParams) when ready.
 * - Refetch: always available for pull-to-refresh or manual refresh.
 */
export const useAppwrite = <T, P extends Record<string, string | number | undefined>>({
  fn,
  params = {} as P,
  skip = false,
}: UseAppwriteOptions<T, P>): UseAppwriteReturn<T, P> => {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!skip);
  const [error, setError] = useState<string | null>(null);
  const paramsKeyRef = useRef<string>("");
  const isMountedRef = useRef(true);

  const fetchData = useCallback(
    async (fetchParams: P) => {
      setLoading(true);
      setError(null);

      try {
        const result = await fn(fetchParams);
        if (isMountedRef.current) setData(result);
      } catch (err: unknown) {
        const errorMessage =
          err instanceof Error ? err.message : "An unknown error occurred";
        if (isMountedRef.current) setError(errorMessage);
        Alert.alert("Error", errorMessage);
      } finally {
        if (isMountedRef.current) setLoading(false);
      }
    },
    [fn]
  );

  const paramsKey = JSON.stringify(params ?? {});

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Single effect: when !skip and paramsKey changed, refetch (includes initial mount)
  useEffect(() => {
    if (skip) return;
    if (paramsKeyRef.current === paramsKey) return;
    paramsKeyRef.current = paramsKey;
    fetchData(params);
  }, [paramsKey, skip, fetchData, params]);

  const refetch = useCallback(
    async (newParams: P) => {
      paramsKeyRef.current = JSON.stringify(newParams ?? {});
      await fetchData(newParams);
    },
    [fetchData]
  );

  return { data, loading, error, refetch };
};
