import { defineRpc, defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const SidebarItemSchema = z.object({
  pluginId: z.string(),
  itemId: z.string(),
  title: z.string(),
  icon: z.string().default(""),
});
export type SidebarItem = z.infer<typeof SidebarItemSchema>;

export const launcherList = defineRpc({
  name: "plugin-launcher.list",
  input: z.object({}),
  output: z.object({ items: z.array(SidebarItemSchema) }),
});

// Where the launcher appears: left sidebar row, centre workspace tab, right Explorer panel.
// Any combination; the client falls back to the sidebar if all are off.
export const PlacementSchema = z.object({
  sidebar: z.boolean().default(true),
  workspace: z.boolean().default(false),
  explorer: z.boolean().default(false),
});
export type Placement = z.infer<typeof PlacementSchema>;

export const launcherSettings = defineSettings({
  id: "launcher",
  scope: "host",
  version: 1,
  schema: z.object({
    overrides: z.array(SidebarItemSchema).default([]),
    placement: PlacementSchema.default({ sidebar: true, workspace: false, explorer: false }),
  }),
});

export const launcherPlacement = defineRpc({
  name: "plugin-launcher.placement",
  input: z.object({}),
  output: PlacementSchema,
});

/** Never leave the launcher unreachable: with every placement off, keep the sidebar row. */
export function effectivePlacement(placement: Placement): Placement {
  return placement.sidebar || placement.workspace || placement.explorer
    ? placement
    : { ...placement, sidebar: true };
}
