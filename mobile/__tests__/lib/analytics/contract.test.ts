/**
 * @jest-environment node
 *
 * The app's events must match the API's registry (exported to
 * shared/tracking-plan.json by `python -m app.events`), so an event can't be added
 * in one place and forgotten in the other.
 */
import plan from "../../../../shared/tracking-plan.json";
import { APP_EVENT_NAMES } from "@/lib/analytics/events";

type PlanEntry = {
  source: "app" | "server";
  properties: { properties?: Record<string, unknown>; required?: string[] };
};
const entries = plan as Record<string, PlanEntry>;

describe("tracking plan contract", () => {
  it("the app sends exactly the events the plan assigns to the app", () => {
    const planned = Object.keys(entries).filter((name) => entries[name].source === "app");
    expect([...APP_EVENT_NAMES].sort()).toEqual(planned.sort());
  });

  it("the app never sends server-side events", () => {
    for (const name of APP_EVENT_NAMES) {
      expect(entries[name].source).toBe("app");
    }
  });
});
