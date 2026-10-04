import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { z } from "zod";
import { InboxFileSchema, type InboxSource, type launcherInbox } from "../shared/inbox";

export const INBOX_DIR = join(homedir(), ".paseo", "plugin-inbox");

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
    if (file.notifications.length === 0) continue;
    sources.push({
      pluginId: file.pluginId,
      itemId: file.itemId,
      title: file.title || file.pluginId,
      updatedAt: file.updatedAt,
      notifications: file.notifications,
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
