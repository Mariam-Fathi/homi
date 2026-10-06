/**
 * @jest-environment node
 */
import {
  FLUSH_AT,
  MAX_QUEUE,
  SESSION_TIMEOUT_MS,
  Tracker,
  type QueuedEvent,
  type TrackerDeps,
} from "@/lib/analytics/tracker";

const tick = () => new Promise((r) => setImmediate(r));

function setup(overrides: Partial<TrackerDeps> = {}) {
  const saved = new Map<string, string>();
  const uploads: QueuedEvent[][] = [];
  let clock = Date.parse("2026-10-05T10:00:00Z");
  let n = 0;
  const deps: TrackerDeps = {
    storage: {
      getItem: async (k) => saved.get(k) ?? null,
      setItem: async (k, v) => void saved.set(k, v),
    },
    upload: jest.fn(async (events: QueuedEvent[]) => {
      uploads.push(events);
      return { rejected: [] };
    }),
    uuid: () => `id-${++n}`,
    now: () => clock,
    platform: "android",
    appVersion: "1.0.0",
    ...overrides,
  };
  return {
    deps,
    saved,
    uploads,
    advance: (ms: number) => (clock += ms),
    tracker: new Tracker(deps),
  };
}

const opened = { cold_start: true } as const;

describe("Tracker", () => {
  it("stamps events with ids, time, device and session", async () => {
    const { tracker, uploads } = setup();
    tracker.track("app_opened", opened);
    await tracker.flush();

    const [event] = uploads[0];
    expect(event).toMatchObject({
      event_name: "app_opened",
      occurred_at: "2026-10-05T10:00:00.000Z",
      platform: "android",
      app_version: "1.0.0",
      properties: opened,
    });
    expect(event.event_id).toBeTruthy();
    expect(event.anonymous_id).toBeTruthy();
    expect(event.session_id).toBe(tracker.getContext().sessionId);
  });

  it("records who was signed in when each event happened", async () => {
    const { tracker, uploads } = setup();
    tracker.track("sign_in_failed", { reason: "invalid_phone" });
    tracker.setUserId("user-1");
    tracker.track("screen_viewed", { screen: "home" });
    tracker.setUserId(null);
    tracker.track("screen_viewed", { screen: "auth" });
    await tracker.flush();

    expect(uploads.flat().map((e) => e.user_id)).toEqual([null, "user-1", null]);
  });

  it("keeps the same device id across restarts", async () => {
    const first = setup();
    first.tracker.track("app_opened", opened);
    await first.tracker.flush();
    const deviceId = first.uploads[0][0].anonymous_id;

    const restarted = new Tracker({ ...first.deps, uuid: () => "new-uuid" });
    restarted.track("app_opened", { cold_start: true });
    await restarted.flush();
    expect(first.uploads[1][0].anonymous_id).toBe(deviceId);
  });

  it("uploads automatically once enough events are queued", async () => {
    const { tracker, uploads } = setup();
    for (let i = 0; i < FLUSH_AT - 1; i++) tracker.track("app_opened", opened);
    await tick();
    expect(uploads).toHaveLength(0);

    tracker.track("app_opened", opened);
    await tick();
    await tracker.flush();
    expect(uploads.flat()).toHaveLength(FLUSH_AT);
  });

  it("keeps events when offline and resends them with the same ids", async () => {
    let online = false;
    const { tracker, uploads, advance, deps } = setup({
      upload: jest.fn(async (events: QueuedEvent[]) => {
        if (!online) throw new Error("Network request failed");
        uploads.push(events);
        return { rejected: [] };
      }),
    });
    tracker.track("app_opened", opened);
    await tracker.flush();
    expect(deps.upload).toHaveBeenCalledTimes(1);
    const firstAttemptId = (deps.upload as jest.Mock).mock.calls[0][0][0].event_id;

    // Backs off: an immediate retry doesn't hit the network again.
    await tracker.flush();
    expect(deps.upload).toHaveBeenCalledTimes(1);

    online = true;
    advance(60_000);
    await tracker.flush();
    expect(uploads[0][0].event_id).toBe(firstAttemptId);
  });

  it("restores unsent events after the app restarts", async () => {
    const first = setup({ upload: jest.fn().mockRejectedValue(new Error("offline")) });
    first.tracker.track("screen_viewed", { screen: "home" });
    await first.tracker.flush();

    const uploads: QueuedEvent[][] = [];
    const restarted = new Tracker({
      ...first.deps,
      upload: async (events) => {
        uploads.push(events);
        return { rejected: [] };
      },
    });
    await restarted.flush();
    expect(uploads.flat().map((e) => e.event_name)).toEqual(["screen_viewed"]);
  });

  it("drops events the server rejects instead of retrying them forever", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
    const { tracker, deps } = setup({
      upload: jest.fn(async (events: QueuedEvent[]) => ({
        rejected: events.map((e) => ({ event_id: e.event_id, error: "invalid" })),
      })),
    });
    tracker.track("app_opened", opened);
    await tracker.flush();
    await tracker.flush();
    expect(deps.upload).toHaveBeenCalledTimes(1);
  });

  it("caps the queue, dropping the oldest events", async () => {
    const { tracker, uploads } = setup({ upload: jest.fn().mockRejectedValue(new Error("off")) });
    for (let i = 0; i < MAX_QUEUE + 5; i++) {
      tracker.track("property_impression", { property_id: `p${i}`, list: "home", position: i });
    }
    await tick();

    const sent: QueuedEvent[] = [];
    const drain = new Tracker({
      ...(tracker as any).deps,
      upload: async (events: QueuedEvent[]) => {
        sent.push(...events);
        return { rejected: [] };
      },
    });
    await drain.flush();
    expect(sent).toHaveLength(MAX_QUEUE);
    expect(sent[0].properties.property_id).toBe("p5");
    expect(uploads).toHaveLength(0);
  });

  it("starts a new session after 30 minutes without events", async () => {
    const { tracker, advance } = setup();
    tracker.track("app_opened", opened);
    const first = tracker.getContext().sessionId;

    advance(SESSION_TIMEOUT_MS - 1000);
    tracker.track("screen_viewed", { screen: "home" });
    expect(tracker.getContext().sessionId).toBe(first);

    advance(SESSION_TIMEOUT_MS + 1000);
    tracker.track("screen_viewed", { screen: "home" });
    expect(tracker.getContext().sessionId).not.toBe(first);
  });

  it("doesn't touch device APIs until it's used", () => {
    // Regression: the web build pre-renders pages in Node, where storage and crypto
    // access crashed the render ("window is not defined").
    const getItem = jest.fn();
    const uuid = jest.fn(() => "x");
    new Tracker({ ...setup().deps, uuid, storage: { getItem, setItem: jest.fn() } });
    expect(getItem).not.toHaveBeenCalled();
    expect(uuid).not.toHaveBeenCalled();
  });

  it("never throws, even if storage fails", async () => {
    const { tracker } = setup({
      storage: {
        getItem: async () => {
          throw new Error("storage broken");
        },
        setItem: async () => {
          throw new Error("storage broken");
        },
      },
    });
    expect(() => tracker.track("app_opened", opened)).not.toThrow();
    await expect(tracker.flush()).resolves.toBeUndefined();
  });
});
