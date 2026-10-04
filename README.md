# Plugin Launcher

One **Plugins** row in the Paseo sidebar that opens every other plugin.

Paseo 0.10 adds one sidebar button per installed plugin, and the only control is to hide them. With
several plugins installed the sidebar fills up. Plugin Launcher replaces those buttons with a single
row: hide the individual plugin buttons in **Settings → Sidebar**, keep **Plugins**, and open any
plugin from its list.

The list is built automatically. The daemon runs `paseo plugin ls --json`, then scans each running
plugin's source for its `addSidebarItem` registrations. Plugins without a sidebar screen (themes,
providers) are left out.

## Install

```bash
paseo plugin install npm:paseo-plugin-launcher
```

Then:

1. Click **Plugins** in the sidebar and check your plugins are listed.
2. In **Settings → Sidebar**, hide the individual plugin buttons.

If a plugin is missing from the list, add it by hand under **Settings → Plugins → Plugin Launcher**
with its plugin ID, sidebar item ID, title, and optional Lucide icon name.

## Notifications

Any plugin can surface notifications in the launcher by writing
`~/.paseo/plugin-inbox/<pluginId>.json` on the daemon host:

```json
{
  "version": 1,
  "pluginId": "pr-radar-private",
  "itemId": "radar",
  "title": "PR Radar",
  "updatedAt": "2026-10-04T10:06:39Z",
  "notifications": [
    { "id": "PR_123:New PR", "title": "owner/repo#12 Fix login", "detail": "New PR", "url": "https://github.com/owner/repo/pull/12" }
  ]
}
```

The file holds the plugin's current unread notifications; the producer owns read state and rewrites
the file (write a temp file, then rename) when it changes. `itemId` is the sidebar item the "Open"
action navigates to. The launcher polls every 30 s and shows the unread total in the sidebar title
("Plugins · 3"), a bell in workspace headers with the list, a toast for notifications with new ids,
and a count next to each plugin in its list. Delete the file when the plugin stops.

## Limitations

- Opening a plugin navigates to that plugin's route. On desktop this reloads the window for a
  moment; on mobile it opens the route through the `paseo://` deep link.
- Targets Paseo 0.10.x (`>=0.10.3 <0.11.0`). Paseo 0.11 changes the sidebar API.
- Discovery is a source scan, not a Paseo API. It finds `addSidebarItem({ id, title, icon })` calls
  with string literals or `const` string values; anything computed at runtime needs a manual entry.
- The daemon host needs the `paseo` CLI on `PATH` or at `~/.local/bin/paseo`.

## Development

```bash
npm install
npm run typecheck
npm test
```

## License

MIT
