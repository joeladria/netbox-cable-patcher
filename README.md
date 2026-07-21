# NetBox Cable Patcher

A visual patch bay interface for NetBox. Drag devices onto a canvas, see their
ports laid out side-by-side, and create or remove cables by clicking between
ports — no more hunting through forms to figure out what's plugged into what.

* Free software: Apache-2.0
* Documentation: https://joeladria.github.io/netbox-cable-patcher/
* Source: https://github.com/joeladria/netbox-cable-patcher

## Features

* Visual patch bay canvas: devices are shown as cards with ports along the
  facing edges, and cables are drawn as SVG bezier curves between connected
  ports.
* Three dedicated modes — **Network** (interfaces, front/rear ports),
  **Power** (power ports/outlets), and **Console** (console ports/console
  server ports) — each with their own compatibility rules for what can be
  cabled together.
* Click-to-patch: click an available port, then click a compatible port on
  another device to create a cable; click an existing cable to select it,
  inspect its details, and delete it (single or multi-select).
* Create and delete cables directly from the canvas — changes are reflected
  instantly in the UI without a full page or data refresh.
* Front port and rear port support, including patch-through connections.
* Module bay visualization: device cards show module bays as outlined
  sections with the installed module type, and modules can be installed or
  uninstalled directly from the UI via a searchable module type picker.
* Site / Location / Rack cascading filters (AJAX, no page reload); Location
  and Rack support selecting multiple values at once.
* Cable defaults bar for setting type, color, and label before patching, plus
  a quick-patch toggle to skip the create-cable dialog.
* Color-coded cables by type and status (e.g. planned, decommissioning).
* Device drag-to-reorder within each column.
* URL state persistence for site, location, rack, mode, and device
  selections, so a patch bay layout can be bookmarked or shared.
* Keyboard shortcuts (Escape, Delete, Enter) and hover tooltips showing port
  type and connection status.
* Dark mode support.
* Permission-based access control for cable and module operations, backed by
  NetBox's own object permissions.
* Cables created or deleted through the patcher record a distinct changelog
  message ("Modified by Cable Patcher Plugin") so they're easy to tell apart
  from changes made elsewhere in NetBox.

## Compatibility

| NetBox Version | Plugin Version |
|----------------|----------------|
|     4.5         |      0.4.2     |
|     4.0        |      0.1.0     |

## Installing

For adding to a NetBox Docker setup see
[the general instructions for using netbox-docker with plugins](https://github.com/netbox-community/netbox-docker/wiki/Using-Netbox-Plugins).

Install from PyPI:

```bash
pip install netbox-cable-patcher
```

or install the latest development version directly from GitHub:

```bash
pip install git+https://github.com/joeladria/netbox-cable-patcher
```

or by adding to your `local_requirements.txt` or `plugin_requirements.txt` (netbox-docker):

```bash
netbox-cable-patcher
```

Enable the plugin in `/opt/netbox/netbox/netbox/configuration.py`,
 or if you use netbox-docker, your `/configuration/plugins.py` file :

```python
PLUGINS = [
    'netbox_cable_patcher'
]

PLUGINS_CONFIG = {
    "netbox_cable_patcher": {},
}
```

## Credits

Created and maintained by [Joel Adria](https://github.com/joeladria) and
[Moment Factory](https://momentfactory.com).

Based on the NetBox plugin tutorial:

- [demo repository](https://github.com/netbox-community/netbox-plugin-demo)
- [tutorial](https://github.com/netbox-community/netbox-plugin-tutorial)

This package was created with [Cookiecutter](https://github.com/audreyr/cookiecutter) and the [`netbox-community/cookiecutter-netbox-plugin`](https://github.com/netbox-community/cookiecutter-netbox-plugin) project template.
