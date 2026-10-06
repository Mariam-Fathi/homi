import { create } from "zustand";
import { getExperimentAssignments } from "@/lib/api";

/**
 * The signed-in user's experiment variants, fetched once per user. Assignment is
 * decided by the API (a hash of experiment + user id), so it's the same on every
 * device and session.
 */
interface ExperimentsStore {
  userId: string | null;
  assignments: Record<string, string> | null;
  load: (userId: string) => Promise<void>;
}

export const useExperimentsStore = create<ExperimentsStore>((set, get) => ({
  userId: null,
  assignments: null,
  load: async (userId) => {
    if (get().userId === userId) return;
    set({ userId, assignments: null });
    try {
      const assignments = await getExperimentAssignments();
      if (get().userId === userId) set({ assignments });
    } catch (error) {
      console.log("Couldn't load experiments:", error);
      if (get().userId === userId) set({ userId: null }); // allow a retry
    }
  },
}));
