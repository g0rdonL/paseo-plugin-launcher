import type { PluginButtonRegistration, PluginClientContext } from "@getpaseo/plugin/client";
import { InboxStore, setActiveInboxStore } from "./client/inbox-store";
import { InboxBellIcon, InboxPopover } from "./client/inbox-ui";
import { LauncherScreen, LauncherSettingsScreen } from "./client/launcher-screen";
import { setPlacementApplier } from "./client/placement";
import { launcherInbox, sidebarTitle } from "./shared/inbox";
import {
  effectivePlacement,
  launcherPlacement,
  type Placement,
} from "./shared/launcher";

const WORKSPACE_SYNC_MS = 60_000;

export default function contribute(client: PluginClientContext) {
  client.addSurface("main", LauncherScreen);
  // Paseo 0.10 sidebar rows only show a title, so the unread count lives in the title.
  let currentTitle = sidebarTitle([]);
  let removeSidebar: (() => void) | null = null;
  const showSidebar = () => {
    removeSidebar?.();
    removeSidebar = client.addSidebarItem({
      id: "main",
      title: currentTitle,
      icon: "Blocks",
      surface: "main",
    });
  };

  // Centre tab and/or right Explorer panel, plus ⌘K items to open it there.
  let removePanel: (() => void)[] = [];
  let placementKey = "";
  const applyPlacement = (requested: Placement) => {
    const placement = effectivePlacement(requested);
    const key = JSON.stringify(placement);
    if (key === placementKey) return;
    placementKey = key;

    if (placement.sidebar) showSidebar();
    else {
      removeSidebar?.();
      removeSidebar = null;
    }

    for (const remove of removePanel) remove();
    removePanel = [];
    const locations = (["workspace", "explorer"] as const).filter((l) => placement[l]);
    if (locations.length === 0) return;
    removePanel.push(
      client.addWorkspacePanel({
        id: "launcher",
        title: "Plugins",
        icon: "Blocks",
        context: "workspace",
        locations,
        Component: LauncherScreen,
      }),
    );
    for (const location of locations) {
      removePanel.push(
        client.addCommandCenterItem({
          id: `open-${location}`,
          title: location === "explorer" ? "Plugins: open in right panel" : "Plugins: open as tab",
          icon: "Blocks",
          context: "workspace",
          onSelect({ openPanel }) {
            openPanel("launcher", { location });
          },
        }),
      );
    }
  };
  // Start with the default (sidebar) so the launcher is never missing while the RPC loads.
  applyPlacement({ sidebar: true, workspace: false, explorer: false });
  setPlacementApplier(applyPlacement);
  void client
    .rpc(launcherPlacement, {})
    .then(applyPlacement)
    .catch(() => {});
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
    const { total, sources } = store.getSnapshot();
    const title = sidebarTitle(sources);
    if (title !== currentTitle) {
      currentTitle = title;
      if (removeSidebar) showSidebar();
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
    setPlacementApplier(null);
    for (const remove of removePanel) remove();
    removeSidebar?.();
  };
}
