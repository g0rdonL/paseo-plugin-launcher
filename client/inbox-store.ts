import { useSyncExternalStore } from "react";
import { formatCount, type InboxSource } from "../shared/inbox";

export const INBOX_POLL_MS = 30_000;

export interface InboxSnapshot {
  total: number;
  sources: InboxSource[];
}

type Fetcher = () => Promise<InboxSnapshot>;

const EMPTY: InboxSnapshot = { total: 0, sources: [] };

/**
 * One poller per client entry. The daemon already caches producer data, so polling a local
 * file read every 30 s is cheap; components share the snapshot instead of polling themselves.
 */
export class InboxStore {
  private snapshot: InboxSnapshot = EMPTY;
  private readonly listeners = new Set<() => void>();
  private seen: Set<string> | null = null;
  private pendingArrivals: Arrival[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private inflight: Promise<void> | null = null;

  constructor(private readonly fetcher: Fetcher) {}

  getSnapshot = (): InboxSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  start(intervalMs = INBOX_POLL_MS): () => void {
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), intervalMs);
    return () => {
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      this.listeners.clear();
    };
  }

  refresh(): Promise<void> {
    if (this.inflight) return this.inflight;
    this.inflight = this.fetcher()
      .then((next) => this.apply(next))
      .catch(() => {
        // Keep the last snapshot; the next tick retries.
      })
      .finally(() => {
        this.inflight = null;
      });
    return this.inflight;
  }

  /** Arrivals not yet announced. The first consumer takes them, so several bells toast once. */
  takeArrivals(): Arrival[] {
    const arrivals = this.pendingArrivals;
    this.pendingArrivals = [];
    return arrivals;
  }

  apply(next: InboxSnapshot): void {
    const ids = new Set<string>();
    const arrivals: Arrival[] = [];
    for (const source of next.sources) {
      for (const notification of source.notifications) {
        const key = `${source.pluginId}\u0000${notification.id}`;
        ids.add(key);
        // The first snapshot seeds what is already known; only later additions toast.
        if (this.seen && !this.seen.has(key)) {
          arrivals.push({ label: source.shortLabel, title: notification.title });
        }
      }
    }
    this.seen = ids;
    if (arrivals.length > 0) this.pendingArrivals.push(...arrivals);
    if (arrivals.length === 0 && sameSnapshot(this.snapshot, next)) return;
    this.snapshot = next;
    for (const listener of this.listeners) listener();
  }
}

function sameSnapshot(a: InboxSnapshot, b: InboxSnapshot): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export interface Arrival {
  label: string;
  title: string;
}

/** One arrival names itself; several are counted per source, never summed. */
export function toastMessage(arrivals: Arrival[]): string | null {
  const [first] = arrivals;
  if (!first) return null;
  if (arrivals.length === 1) return `${first.label} · ${first.title}`;
  const counts = new Map<string, number>();
  for (const { label } of arrivals) counts.set(label, (counts.get(label) ?? 0) + 1);
  return `New: ${[...counts].map(([label, count]) => `${label} ${formatCount(count)}`).join(" · ")}`;
}

let active: InboxStore | null = null;

export function setActiveInboxStore(store: InboxStore | null): void {
  active = store;
}

export function getActiveInboxStore(): InboxStore | null {
  return active;
}

const noopSubscribe = () => () => {};
const emptySnapshot = () => EMPTY;

export function useInbox(): InboxSnapshot {
  const store = active;
  return useSyncExternalStore(
    store ? store.subscribe : noopSubscribe,
    store ? store.getSnapshot : emptySnapshot,
  );
}
