import type { PluginButtonRegistration, PluginClientContext } from "@getpaseo/plugin/client";
import { InboxStore, setActiveInboxStore } from "./client/inbox-store";
import { InboxBellIcon, InboxPopover } from "./client/inbox-ui";
import { LauncherScreen, LauncherSettingsScreen } from "./client/launcher-screen";
import { launcherInbox, sidebarTitle } from "./shared/inbox";

const WORKSPACE_SYNC_MS = 60_000;

export default function contribute(client: PluginClientContext) {
  client.addSurface("main", LauncherScreen);
  // Paseo 0.10 sidebar rows only show a title, so the unread count lives in the title.
  let sidebarTotal = 0;
  let removeSidebar = client.addSidebarItem({
    id: "main",
    title: sidebarTitle(0),
    icon: "Blocks",
    surface: "main",
  });
  client.addSettingsScreen({
    id: "launcher",
    title: "Plugin Launcher",
    icon: "Blocks",
    Component: LauncherSettingsScreen,
  });

  const store = new InboxStore(() => client.rpc(launcherInbox, {}));
  setActiveInboxStore(store);

  // A bell in each workspace header, shown only while something is unread.
  const bells = new Map<string, PluginButtonRegistration>();
  const syncBells = async () => {
    let workspaceIds: string[];
    try {
      workspaceIds = (await client.paseo.workspaces.list()).entries.map((entry) => entry.id);
    } catch {
      return;
    }
    const visible = store.getSnapshot().total > 0;
    for (const workspaceId of workspaceIds) {
      if (bells.has(workspaceId)) continue;
      bells.set(
        workspaceId,
        client.addHeaderButton({
          id: "inbox",
          workspaceId,
          button: {
            title: "Plugin notifications",
            icon: InboxBellIcon,
            visible,
            behavior: { kind: "popover", Content: InboxPopover },
          },
        }),
      );
    }
  };

  const unsubscribe = store.subscribe(() => {
    const { total } = store.getSnapshot();
    if (sidebarTitle(total) !== sidebarTitle(sidebarTotal)) {
      sidebarTotal = total;
      removeSidebar();
      removeSidebar = client.addSidebarItem({
        id: "main",
        title: sidebarTitle(total),
        icon: "Blocks",
        surface: "main",
      });
    }
    for (const bell of bells.values()) bell.update({ visible: total > 0 });
  });
  const stopPolling = store.start();
  void syncBells();
  const workspaceTimer = setInterval(() => void syncBells(), WORKSPACE_SYNC_MS);

  return () => {
    clearInterval(workspaceTimer);
    unsubscribe();
    stopPolling();
    setActiveInboxStore(null);
    for (const bell of bells.values()) bell.remove();
    bells.clear();
    removeSidebar();
  };
}
