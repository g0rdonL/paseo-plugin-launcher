import { useSyncExternalStore } from "react";
import { formatCount, type InboxSource } from "../shared/inbox";

export const INBOX_POLL_MS = 30_000;

export interface InboxSnapshot {
  total: number;
  sources: InboxSource[];
}

type Fetcher = () => Promise<InboxSnapshot>;

const EMPTY: InboxSnapshot = { total: 0, sources: [] };

export interface InboxStore {
  getSnapshot(): InboxSnapshot;
  subscribe(listener: () => void): () => void;
  start(intervalMs?: number): () => void;
  refresh(): Promise<void>;
  /** Arrivals not yet announced. The first consumer takes them, so several bells toast once. */
  takeArrivals(): Arrival[];
  apply(next: InboxSnapshot): void;
}

/**
 * One poller per client entry. The daemon already caches producer data, so polling a local
 * file read every 30 s is cheap; components share the snapshot instead of polling themselves.
 *
 * A closure rather than a class: the mobile app runs plugin code on Hermes, which rejects
 * `class` syntax outright (see tests/hermes.test.ts).
 */
export function createInboxStore(fetcher: Fetcher): InboxStore {
  let snapshot = EMPTY;
  const listeners = new Set<() => void>();
  let seen: Set<string> | null = null;
  let pendingArrivals: Arrival[] = [];
  let timer: ReturnType<typeof setInterval> | null = null;
  let inflight: Promise<void> | null = null;

  const apply = (next: InboxSnapshot): void => {
    const ids = new Set<string>();
    const arrivals: Arrival[] = [];
    for (const source of next.sources) {
      for (const notification of source.notifications) {
        const key = `${source.pluginId}\u0000${notification.id}`;
        ids.add(key);
        // The first snapshot seeds what is already known; only later additions toast.
        if (seen && !seen.has(key)) {
          arrivals.push({ label: source.shortLabel, title: notification.title });
        }
      }
    }
    seen = ids;
    if (arrivals.length > 0) pendingArrivals.push(...arrivals);
    if (arrivals.length === 0 && sameSnapshot(snapshot, next)) return;
    snapshot = next;
    for (const listener of listeners) listener();
  };

  const refresh = (): Promise<void> => {
    if (inflight) return inflight;
    inflight = fetcher()
      .then(apply)
      .catch(() => {
        // Keep the last snapshot; the next tick retries.
      })
      .finally(() => {
        inflight = null;
      });
    return inflight;
  };

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start(intervalMs = INBOX_POLL_MS) {
      void refresh();
      timer = setInterval(() => void refresh(), intervalMs);
      return () => {
        if (timer) clearInterval(timer);
        timer = null;
        listeners.clear();
      };
    },
    refresh,
    takeArrivals() {
      const arrivals = pendingArrivals;
      pendingArrivals = [];
      return arrivals;
    },
    apply,
  };
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
