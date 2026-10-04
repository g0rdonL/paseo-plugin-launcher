import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

/**
 * Plugin inbox: any plugin can surface notifications in the launcher by writing
 * `~/.paseo/plugin-inbox/<pluginId>.json`. The file holds the plugin's *current* unread
 * notifications; the producer owns read state and rewrites the file when it changes.
 */
export const INBOX_VERSION = 1;

export const InboxNotificationSchema = z.object({
  /** Stable per notification; a new id is what triggers a toast. */
  id: z.string().min(1).max(200),
  title: z.string().min(1).max(300),
  detail: z.string().max(500).default(""),
  url: z.string().default(""),
  createdAt: z.string().default(""),
});
export type InboxNotification = z.infer<typeof InboxNotificationSchema>;

export const InboxFileSchema = z.object({
  version: z.literal(INBOX_VERSION),
  pluginId: z.string().min(1),
  /** Sidebar item to open when the user taps the notification. */
  itemId: z.string().default(""),
  title: z.string().default(""),
  /** Two or three letters shown in the sidebar title, e.g. "PR 3 · PL 2". */
  shortLabel: z.string().max(4).default(""),
  updatedAt: z.string().default(""),
  notifications: z.array(InboxNotificationSchema).max(500),
});
export type InboxFile = z.infer<typeof InboxFileSchema>;

export const InboxSourceSchema = z.object({
  pluginId: z.string(),
  itemId: z.string(),
  title: z.string(),
  shortLabel: z.string(),
  updatedAt: z.string(),
  notifications: z.array(InboxNotificationSchema),
});
export type InboxSource = z.infer<typeof InboxSourceSchema>;

export const launcherInbox = defineRpc({
  name: "plugin-launcher.inbox",
  input: z.object({}),
  output: z.object({
    total: z.number().int().nonnegative(),
    sources: z.array(InboxSourceSchema),
  }),
});

export const launcherMarkSeen = defineRpc({
  name: "plugin-launcher.mark-seen",
  input: z.object({ pluginId: z.string().min(1) }),
  output: z.object({ cleared: z.number().int().nonnegative() }),
});

export function formatCount(count: number): string {
  return count > 99 ? "99+" : String(count);
}

/** Fallback when a producer sets no short label: the first two letters of its title. */
export function deriveShortLabel(title: string): string {
  const letters = title.replace(/[^A-Za-z0-9]/g, "");
  return (letters.slice(0, 2) || "?").toUpperCase();
}

/** Per-source counts, never summed: "PR 3 · PL 2". */
export function countsLabel(sources: Pick<InboxSource, "shortLabel" | "notifications">[]): string {
  return sources
    .filter((source) => source.notifications.length > 0)
    .map((source) => `${source.shortLabel} ${formatCount(source.notifications.length)}`)
    .join(" · ");
}

/** Sidebar label; the 0.10 sidebar row can only show a title. */
export function sidebarTitle(sources: Pick<InboxSource, "shortLabel" | "notifications">[]): string {
  const counts = countsLabel(sources);
  return counts ? `Plugins · ${counts}` : "Plugins";
}
