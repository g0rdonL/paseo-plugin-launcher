import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type InboxSnapshot, InboxStore, toastMessage } from "../client/inbox-store";
import { resolveInbox } from "../server/inbox";
import { sidebarTitle } from "../shared/inbox";

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
    const store = new InboxStore(async () => snapshot([]));
    store.apply(snapshot(["1"]));
    expect(store.takeArrivals()).toEqual([]);

    store.apply(snapshot(["1", "2", "3"]));
    expect(store.takeArrivals()).toEqual(["n2", "n3"]);
    expect(store.takeArrivals()).toEqual([]);
  });

  test("a notification that clears and returns announces again", () => {
    const store = new InboxStore(async () => snapshot([]));
    store.apply(snapshot(["1"]));
    store.apply(snapshot([]));
    store.apply(snapshot(["1"]));
    expect(store.takeArrivals()).toEqual(["n1"]);
  });

  test("notifies listeners only when the snapshot changes", () => {
    const store = new InboxStore(async () => snapshot([]));
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
    const store = new InboxStore(async () => {
      throw new Error("offline");
    });
    store.apply(snapshot(["1"]));
    await store.refresh();
    expect(store.getSnapshot().total).toBe(1);
  });
});

describe("labels", () => {
  test("sidebarTitle shows the count and caps it", () => {
    expect(sidebarTitle(0)).toBe("Plugins");
    expect(sidebarTitle(3)).toBe("Plugins · 3");
    expect(sidebarTitle(250)).toBe("Plugins · 99+");
  });

  test("toastMessage names a single arrival and counts several", () => {
    expect(toastMessage([])).toBeNull();
    expect(toastMessage(["PR ready"])).toBe("PR ready");
    expect(toastMessage(["a", "b"])).toBe("2 new notifications");
  });
});
