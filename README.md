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

## Limitations

- Desktop only. Opening a plugin navigates the desktop app to that plugin's route, which reloads the
  window for a moment. The mobile app shows a "Desktop only" notice.
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
