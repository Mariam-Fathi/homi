import type { AppEventName, AppEvents } from "./events";

/**
 * Collects app events and uploads them in batches (see docs/tracking-plan.md):
 *
 * - track() never blocks or throws: analytics must not break the app.
 * - The queue is saved on the device, so events survive restarts and offline periods.
 * - Each event gets its id when tracked; a retried upload reuses it, and the server
 *   stores each id once, so retries never double-count.
 * - A session ends after 30 minutes without events.
 */

export interface QueuedEvent {
  event_id: string;
  event_name: AppEventName;
  occurred_at: string;
  anonymous_id: string;
  session_id: string;
  /** Who was signed in when the event happened (the server verifies it). */
  user_id: string | null;
  platform: "ios" | "android" | "web";
  app_version: string;
  properties: Record<string, unknown>;
}

export interface UploadResult {
  /** Events the server permanently refused (invalid); they're dropped, not retried. */
  rejected: { event_id: string; error: string }[];
}

export interface TrackerDeps {
  storage: {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
  };
  upload(events: QueuedEvent[]): Promise<UploadResult>;
  uuid(): string;
  now(): number;
  platform: QueuedEvent["platform"];
  appVersion: string;
}

export const BATCH_SIZE = 50; // the API's per-request maximum
export const FLUSH_AT = 20; // queued events that trigger an upload
export const MAX_QUEUE = 1000; // oldest events are dropped beyond this
export const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const MAX_BACKOFF_MS = 5 * 60 * 1000;

const QUEUE_KEY = "homi.analytics.queue";
const DEVICE_KEY = "homi.analytics.anonymousId";

export class Tracker {
  private queue: QueuedEvent[] = [];
  private anonymousId: string | null = null;
  private sessionId: string | null = null;
  private userId: string | null = null;
  private lastEventAt = 0;
  private loaded: Promise<void> | null = null;
  private flushing: Promise<void> | null = null;
  private failures = 0;
  private retryAt = 0;

  // Nothing touches device APIs (storage, crypto) until first use: the web build
  // pre-renders pages in Node, where they don't exist.
  constructor(private deps: TrackerDeps) {}

  /** Loads the device id and saved queue, once. */
  private ready(): Promise<void> {
    return (this.loaded ??= this.restore());
  }

  /**
   * Ids the API client sends as headers, so server events join this session.
   * An API call counts as activity, so it keeps the session alive.
   */
  getContext() {
    this.ready().catch(() => {}); // so the device id is known for later requests
    return { sessionId: this.currentSession(), anonymousId: this.anonymousId };
  }

  /** Call on sign-in and sign-out, so each event records who it belongs to. */
  setUserId(userId: string | null) {
    this.userId = userId;
  }

  track<N extends AppEventName>(name: N, properties: AppEvents[N]): void {
    const sessionId = this.currentSession();
    const event: Omit<QueuedEvent, "anonymous_id"> = {
      event_id: this.deps.uuid(),
      event_name: name,
      occurred_at: new Date(this.deps.now()).toISOString(),
      session_id: sessionId,
      user_id: this.userId,
      platform: this.deps.platform,
      app_version: this.deps.appVersion,
      properties: properties as Record<string, unknown>,
    };
    // The device id may still be loading from storage; queue once it's known.
    this.ready()
      .then(() => {
        this.queue.push({ ...event, anonymous_id: this.anonymousId! });
        if (this.queue.length > MAX_QUEUE)
          this.queue.splice(0, this.queue.length - MAX_QUEUE);
        this.persist();
        if (this.queue.length >= FLUSH_AT) this.flush();
      })
      .catch(() => {});
  }

  /** Uploads queued events. Safe to call any time; concurrent calls share one upload. */
  flush(): Promise<void> {
    if (!this.flushing) {
      this.flushing = this.uploadQueued().finally(() => {
        this.flushing = null;
      });
    }
    return this.flushing;
  }

  private currentSession(): string {
    const now = this.deps.now();
    if (
      !this.sessionId ||
      (this.lastEventAt && now - this.lastEventAt > SESSION_TIMEOUT_MS)
    ) {
      this.sessionId = this.deps.uuid();
    }
    this.lastEventAt = now;
    return this.sessionId;
  }

  private async uploadQueued(): Promise<void> {
    await this.ready();
    if (this.deps.now() < this.retryAt) return;

    while (this.queue.length > 0) {
      const batch = this.queue.slice(0, BATCH_SIZE);
      try {
        const { rejected } = await this.deps.upload(batch);
        if (rejected.length)
          console.warn("Analytics events rejected:", rejected);
      } catch {
        // Offline or server error: keep the events and back off exponentially.
        this.failures += 1;
        this.retryAt =
          this.deps.now() + Math.min(MAX_BACKOFF_MS, 1000 * 2 ** this.failures);
        return;
      }
      this.failures = 0;
      this.retryAt = 0;
      const sent = new Set(batch.map((e) => e.event_id));
      this.queue = this.queue.filter((e) => !sent.has(e.event_id));
      await this.persist();
    }
  }

  private async restore(): Promise<void> {
    try {
      this.anonymousId = await this.deps.storage.getItem(DEVICE_KEY);
      if (!this.anonymousId) {
        this.anonymousId = this.deps.uuid();
        await this.deps.storage.setItem(DEVICE_KEY, this.anonymousId);
      }
      const saved = await this.deps.storage.getItem(QUEUE_KEY);
      if (saved) this.queue = [...JSON.parse(saved), ...this.queue];
    } catch {
      this.anonymousId ??= this.deps.uuid();
    }
  }

  private async persist(): Promise<void> {
    try {
      await this.deps.storage.setItem(QUEUE_KEY, JSON.stringify(this.queue));
    } catch {
      // Storage full or unavailable: events stay in memory until the next upload.
    }
  }
}
