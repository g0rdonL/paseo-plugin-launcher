import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createInboxStore, type InboxSnapshot, toastMessage } from "../client/inbox-store";
import { markSeen, resolveInbox } from "../server/inbox";
import { countsLabel, deriveShortLabel, formatTimestamp, sidebarTitle } from "../shared/inbox";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "plugin-inbox-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function inboxFile(pluginId: string, ids: string[]) {
  return JSON.stringify({
    version: 1,
    pluginId,
    itemId: "radar",
    title: "PR Radar",
    updatedAt: "2026-10-04T00:00:00Z",
    notifications: ids.map((id) => ({ id, title: `PR ${id}` })),
  });
}

describe("resolveInbox", () => {
  test("returns no sources when the directory is missing", async () => {
    expect(await resolveInbox({}, join(dir, "missing"))).toEqual({ total: 0, sources: [] });
  });

  test("totals valid files and skips invalid, empty, and non-JSON files", async () => {
    await writeFile(join(dir, "pr-radar-private.json"), inboxFile("pr-radar-private", ["1", "2"]));
    await writeFile(join(dir, "empty.json"), inboxFile("empty", []));
    await writeFile(join(dir, "broken.json"), "{not json");
    await writeFile(join(dir, "wrong.json"), JSON.stringify({ version: 2 }));
    await writeFile(join(dir, "notes.txt"), "ignored");

    const result = await resolveInbox({}, dir);
    expect(result.total).toBe(2);
    expect(result.sources.map((source) => source.pluginId)).toEqual(["pr-radar-private"]);
    expect(result.sources[0]?.notifications[0]).toMatchObject({ id: "1", detail: "", url: "" });
    expect(result.sources[0]?.shortLabel).toBe("PR");
  });

  test("uses a producer's short label and hides ids marked seen", async () => {
    await writeFile(
      join(dir, "plane-to-paseo.json"),
      JSON.stringify({ ...JSON.parse(inboxFile("plane-to-paseo", ["a", "b"])), shortLabel: "PL" }),
    );
    expect((await resolveInbox({}, dir)).sources[0]?.shortLabel).toBe("PL");

    expect(await markSeen({ pluginId: "plane-to-paseo" }, dir)).toEqual({ cleared: 2 });
    expect(await resolveInbox({}, dir)).toEqual({ total: 0, sources: [] });
    expect(await markSeen({ pluginId: "plane-to-paseo" }, dir)).toEqual({ cleared: 0 });

    // A new notification shows up again; the seen ones stay hidden.
    await writeFile(join(dir, "plane-to-paseo.json"), inboxFile("plane-to-paseo", ["a", "b", "c"]));
    const after = await resolveInbox({}, dir);
    expect(after.sources[0]?.notifications.map((n) => n.id)).toEqual(["c"]);
  });
});

function snapshot(ids: string[]): InboxSnapshot {
  return {
    total: ids.length,
    sources: ids.length
      ? [
          {
            pluginId: "p",
            itemId: "main",
            title: "P",
            shortLabel: "P",
            updatedAt: "",
            notifications: ids.map((id) => ({
              id,
              title: `n${id}`,
              detail: "",
              url: "",
              createdAt: "",
            })),
          },
        ]
      : [],
  };
}

describe("InboxStore", () => {
  test("the first snapshot seeds silently; later additions are arrivals taken once", () => {
    const store = createInboxStore(async () => snapshot([]));
    store.apply(snapshot(["1"]));
    expect(store.takeArrivals()).toEqual([]);

    store.apply(snapshot(["1", "2", "3"]));
    expect(store.takeArrivals()).toEqual([
      { label: "P", title: "n2" },
      { label: "P", title: "n3" },
    ]);
    expect(store.takeArrivals()).toEqual([]);
  });

  test("a notification that clears and returns announces again", () => {
    const store = createInboxStore(async () => snapshot([]));
    store.apply(snapshot(["1"]));
    store.apply(snapshot([]));
    store.apply(snapshot(["1"]));
    expect(store.takeArrivals()).toEqual([{ label: "P", title: "n1" }]);
  });

  test("notifies listeners only when the snapshot changes", () => {
    const store = createInboxStore(async () => snapshot([]));
    let calls = 0;
    store.subscribe(() => {
      calls += 1;
    });
    store.apply(snapshot(["1"]));
    store.apply(snapshot(["1"]));
    expect(calls).toBe(1);
    expect(store.getSnapshot().total).toBe(1);
  });

  test("refresh keeps the last snapshot when the fetch fails", async () => {
    const store = createInboxStore(async () => {
      throw new Error("offline");
    });
    store.apply(snapshot(["1"]));
    await store.refresh();
    expect(store.getSnapshot().total).toBe(1);
  });
});

describe("labels", () => {
  const source = (shortLabel: string, count: number) => ({
    shortLabel,
    notifications: Array.from({ length: count }, (_, i) => ({
      id: String(i),
      title: "",
      detail: "",
      url: "",
      createdAt: "",
    })),
  });

  test("sidebarTitle keeps one count per source and caps each", () => {
    expect(sidebarTitle([])).toBe("Plugins");
    expect(sidebarTitle([source("PR", 0)])).toBe("Plugins");
    expect(sidebarTitle([source("PR", 3), source("PL", 2)])).toBe("Plugins · PR 3 · PL 2");
    expect(countsLabel([source("PR", 250)])).toBe("PR 99+");
  });

  test("deriveShortLabel falls back to two letters of the title", () => {
    expect(deriveShortLabel("agent dash")).toBe("AG");
    expect(deriveShortLabel("!!")).toBe("?");
  });

  test("toastMessage names a single arrival and counts several per source", () => {
    expect(toastMessage([])).toBeNull();
    expect(toastMessage([{ label: "PR", title: "repo#1 Fix" }])).toBe("PR · repo#1 Fix");
    expect(
      toastMessage([
        { label: "PR", title: "a" },
        { label: "PL", title: "b" },
        { label: "PR", title: "c" },
      ]),
    ).toBe("New: PR 2 · PL 1");
  });
});

describe("formatTimestamp", () => {
  const now = Date.parse("2026-10-05T12:00:00Z");

  test("is empty for missing or unparseable times", () => {
    expect(formatTimestamp("", now)).toBe("");
    expect(formatTimestamp("not a date", now)).toBe("");
  });

  test("is relative within the last day", () => {
    expect(formatTimestamp("2026-10-05T11:59:30Z", now)).toBe("just now");
    expect(formatTimestamp("2026-10-05T11:55:00Z", now)).toBe("5m ago");
    expect(formatTimestamp("2026-10-05T09:00:00Z", now)).toBe("3h ago");
  });

  test("counts days up to a week, then shows the date", () => {
    expect(formatTimestamp("2026-10-03T12:00:00Z", now)).toBe("2d ago");
    expect(formatTimestamp("2026-09-20T12:00:00Z", now)).toBe("Sep 20");
    expect(formatTimestamp("2025-09-20T12:00:00Z", now)).toBe("Sep 20, 2025");
  });

  test("treats slightly-future times as just now", () => {
    expect(formatTimestamp("2026-10-05T12:00:20Z", now)).toBe("just now");
  });
});
