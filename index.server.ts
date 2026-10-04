import type { PluginServerContext } from "@getpaseo/plugin/server";
import { markSeen, resolveInbox } from "./server/inbox";
import { resolveLauncherList } from "./server/launcher";
import { launcherInbox, launcherMarkSeen } from "./shared/inbox";
import { launcherList, launcherPlacement, launcherSettings, PlacementSchema } from "./shared/launcher";

export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(launcherSettings);
  server.handle(launcherList, (input) => resolveLauncherList(input, settings));
  server.handle(launcherPlacement, async () => {
    const current = await settings.read();
    return current.status === "ready" ? current.values.placement : PlacementSchema.parse({});
  });
  server.handle(launcherInbox, (input) => resolveInbox(input));
  server.handle(launcherMarkSeen, (input) => markSeen(input));
  return () => {};
}
