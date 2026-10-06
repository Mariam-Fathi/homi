import { useCallback, useEffect } from "react";
import { track } from "@/lib/analytics";
import { useAuthStore } from "@/store/authStore";
import { useExperimentsStore } from "@/store/experimentsStore";

/**
 * The user's variant in an experiment, and a function to record exposure.
 *
 * `variant` is null until the assignment is known; callers show the control
 * experience meanwhile and must not record exposure, since an unknown variant can't
 * be analyzed. Call `expose()` only at the moment the variant changes what the person
 * sees (see docs/experimentation.md: assigned is not exposed).
 */
export function useExperiment(key: string) {
  const userId = useAuthStore((state) => state.user?.id);
  const load = useExperimentsStore((state) => state.load);
  const variant = useExperimentsStore(
    (state) => state.assignments?.[key] ?? null
  );

  useEffect(() => {
    if (userId) load(userId);
  }, [userId, load]);

  const expose = useCallback(() => {
    if (variant) track("experiment_exposed", { experiment: key, variant });
  }, [key, variant]);

  return { variant, expose };
}
