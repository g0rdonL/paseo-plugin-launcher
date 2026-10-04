import type { PluginServerContext } from "@getpaseo/plugin/server";
import { resolveInbox } from "./server/inbox";
import { resolveLauncherList } from "./server/launcher";
import { launcherInbox } from "./shared/inbox";
import { launcherList, launcherSettings } from "./shared/launcher";

export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(launcherSettings);
  server.handle(launcherList, (input) => resolveLauncherList(input, settings));
  server.handle(launcherInbox, (input) => resolveInbox(input));
  return () => {};
}
