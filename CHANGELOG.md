# Changelog

## Unreleased

* Updated project metadata: authors are now Joel Adria and Moment Factory; minimum supported Python is now 3.13 (was 3.10); minimum supported NetBox version is now 4.5.0 (was 4.0.0) as of plugin v0.4.1.
* Fixed placeholder/broken GitHub URLs (repo, issues, discussions, documentation) across `README.md`, `CONTRIBUTING.md`, `pyproject.toml`, `mkdocs.yml`, and `.github/ISSUE_TEMPLATE/config.yml` to point to `https://github.com/joeladria/netbox-cable-patcher`.
* Rewrote the README feature list and compatibility table to reflect the actual functionality shipped through v0.4.1, and updated the credits section.

## 0.4.1 (2026-07-21)

* Port connect/disconnect state (cable line, port color/icon, connected badge in hover tooltip) now updates instantly after creating or deleting a cable by patching the affected ports' `cable_id`/`connected_endpoint` directly in local state, instead of refetching all devices and cables from the server.

## 0.4.0 (2026-07-21)

* Fixed cable creation not generating a cable trace (`CablePath`). Cable creation now assigns terminations via NetBox's `Cable.a_terminations`/`b_terminations` model API and calls `full_clean()` before `save()`, instead of creating `CableTermination` rows directly — matching NetBox's own object-creation pattern and ensuring NetBox's internal `trace_paths` signal fires so cable paths are built correctly.
* Cables created or deleted through the patcher now record "Modified by Cable Patcher Plugin" as the changelog message, so these changes are clearly distinguishable from changes made elsewhere in NetBox.
* Location and Rack filters now support selecting multiple values at once; Site remains single-select. Selecting racks takes precedence over locations, which takes precedence over site.
* Fixed low-contrast "Connected"/"Available" badge text in the port hover tooltip by using Bootstrap's `text-bg-*` helper classes instead of `bg-*`
* `api/devices/` and `api/cables/` now accept repeated `rack` and `location` query params (e.g. `?rack=1&rack=2`) for multi-value filtering

## 0.3.0 (2026-07-17)

* Front port and rear port rendering in network mode (ports now visible alongside interfaces)
* Module bay visualization: device cards show module bays as outlined sections with bay name and installed module type
* Module bay population: install modules from the patcher UI with a searchable module type picker
* Module uninstall: remove modules from bays directly in the patcher UI
* Ports are grouped by module bay in the device card — base device ports appear first, then each module bay section
* Empty module bays show a clickable placeholder to install a module
* New API endpoints: `api/module-types/` (search), `api/module-bays/{id}/install/`, `api/module-bays/{id}/uninstall/`
* Port serializer now includes `module_bay_id` for module bay grouping

## 0.2.0 (2026-07-17)

* Color-coded cables by type and status (planned, decommissioning)
* Cable defaults bar with type, color, label, and quick-patch toggle
* URL state persistence for site, location, rack, mode, and device selections
* Front port and rear port backend support (serialization, compatibility rules, cable CRUD)
* Console port and console server port support
* Power port and power outlet support with dedicated mode
* Network / Power / Console mode switching
* Device drag-to-reorder within columns
* Keyboard shortcuts (Escape, Delete, Enter)
* Multi-select cables with Ctrl/Cmd+click
* Floating cable info panel with cable details and delete action
* Cable stub arrows for off-canvas or same-side connections
* Dark mode support
* Permission-based access control for cable operations

## 0.1.0 (2026-01-30)

* First release on PyPI.
