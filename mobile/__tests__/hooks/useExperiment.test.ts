/**
 * @jest-environment node
 */
import { act, renderHook, waitFor } from "@testing-library/react-native";

jest.mock("@/lib/api", () => ({ getExperimentAssignments: jest.fn() }));
jest.mock("@/lib/analytics", () => ({ track: jest.fn() }));
jest.mock("@/store/authStore", () => ({
  useAuthStore: (select: (s: unknown) => unknown) => select({ user: { id: "u1" } }),
}));

import { getExperimentAssignments } from "@/lib/api";
import { track } from "@/lib/analytics";
import { useExperiment } from "@/hooks/useExperiment";
import { useExperimentsStore } from "@/store/experimentsStore";

describe("useExperiment", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useExperimentsStore.setState({ userId: null, assignments: null });
  });

  it("returns the assigned variant and records exposure only when asked", async () => {
    (getExperimentAssignments as jest.Mock).mockResolvedValue({ phone_autoformat: "treatment" });
    const { result } = renderHook(() => useExperiment("phone_autoformat"));

    await waitFor(() => expect(result.current.variant).toBe("treatment"));
    expect(track).not.toHaveBeenCalled(); // assigned is not exposed

    act(() => result.current.expose());
    expect(track).toHaveBeenCalledWith("experiment_exposed", {
      experiment: "phone_autoformat",
      variant: "treatment",
    });
  });

  it("records no exposure while the variant is unknown", () => {
    (getExperimentAssignments as jest.Mock).mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useExperiment("phone_autoformat"));

    expect(result.current.variant).toBeNull();
    act(() => result.current.expose());
    expect(track).not.toHaveBeenCalled();
  });

  it("fetches assignments once per user", async () => {
    (getExperimentAssignments as jest.Mock).mockResolvedValue({ phone_autoformat: "control" });
    const first = renderHook(() => useExperiment("phone_autoformat"));
    await waitFor(() => expect(first.result.current.variant).toBe("control"));
    renderHook(() => useExperiment("phone_autoformat"));

    expect(getExperimentAssignments).toHaveBeenCalledTimes(1);
  });
});
