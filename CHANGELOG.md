# Changelog

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
