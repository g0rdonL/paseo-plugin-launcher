import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { z } from "zod";
import {
  deriveShortLabel,
  InboxFileSchema,
  type InboxSource,
  type launcherInbox,
  type launcherMarkSeen,
} from "../shared/inbox";

export const INBOX_DIR = join(homedir(), ".paseo", "plugin-inbox");
/** `seen/<pluginId>.json` holds ids the user marked seen in the launcher; producers may prune them. */
const SEEN_DIR = "seen";
const MAX_SEEN_IDS = 2_000;

function seenPath(dir: string, pluginId: string): string {
  return join(dir, SEEN_DIR, `${encodeURIComponent(pluginId)}.json`);
}

async function readSeen(dir: string, pluginId: string): Promise<string[]> {
  try {
    const parsed = JSON.parse(await readFile(seenPath(dir, pluginId), "utf8")) as { ids?: unknown };
    return Array.isArray(parsed.ids) ? parsed.ids.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

/** Reads every `<pluginId>.json` in the inbox directory; unreadable or invalid files are skipped. */
export async function readInbox(dir = INBOX_DIR): Promise<InboxSource[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const sources: InboxSource[] = [];
  for (const name of names.sort()) {
    if (!name.endsWith(".json")) continue;
    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(join(dir, name), "utf8"));
    } catch {
      continue;
    }
    const parsed = InboxFileSchema.safeParse(raw);
    if (!parsed.success) {
      console.error(`plugin-launcher: ignoring invalid inbox file ${name}`);
      continue;
    }
    const file = parsed.data;
    const seen = new Set(await readSeen(dir, file.pluginId));
    const notifications = file.notifications.filter((notification) => !seen.has(notification.id));
    if (notifications.length === 0) continue;
    const title = file.title || file.pluginId;
    sources.push({
      pluginId: file.pluginId,
      itemId: file.itemId,
      title,
      shortLabel: file.shortLabel || deriveShortLabel(title),
      updatedAt: file.updatedAt,
      notifications,
    });
  }
  return sources;
}

export async function resolveInbox(
  _input: z.output<typeof launcherInbox.input>,
  dir = INBOX_DIR,
): Promise<z.input<typeof launcherInbox.output>> {
  const sources = await readInbox(dir);
  const total = sources.reduce((sum, source) => sum + source.notifications.length, 0);
  return { total, sources };
}

let writeSequence = 0;

/** Records every notification the plugin currently shows as seen. */
export async function markSeen(
  { pluginId }: z.output<typeof launcherMarkSeen.input>,
  dir = INBOX_DIR,
): Promise<z.input<typeof launcherMarkSeen.output>> {
  const source = (await readInbox(dir)).find((candidate) => candidate.pluginId === pluginId);
  const ids = source?.notifications.map((notification) => notification.id) ?? [];
  if (ids.length === 0) return { cleared: 0 };
  const merged = [...new Set([...(await readSeen(dir, pluginId)), ...ids])].slice(-MAX_SEEN_IDS);
  const target = seenPath(dir, pluginId);
  await mkdir(join(dir, SEEN_DIR), { recursive: true });
  const temporary = `${target}.${process.pid}.${++writeSequence}.tmp`;
  await writeFile(temporary, `${JSON.stringify({ ids: merged })}\n`, { mode: 0o600 });
  await rename(temporary, target);
  return { cleared: ids.length };
}
