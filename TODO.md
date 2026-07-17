# Cable Patcher – TODO / Roadmap

## MVP (v0.1)
- [x] Plugin skeleton (PluginConfig, navigation, base URL)
- [x] SVG canvas view with left/right device panel model
- [x] Fetch interfaces from NetBox REST API
- [x] Render left devices (ports on right edge) and right devices (ports on left edge)
- [x] Drag-to-reorder devices within each column
- [x] Site / Location / Rack cascading filter (AJAX, no page reload)
- [x] Left/right device selectors with chip/badge list and × remove button
- [x] URL state persistence (site, location, rack, mode, left device IDs, right device IDs)
- [x] Draw SVG cables between connected ports (bezier curves — code present, needs end-to-end test)
- [x] Click port → highlight connected port on another device
- [x] Create/delete cables from the UI (POST/DELETE to NetBox API — wired up, needs test)

## v0.2
- [x] Save/load canvas layout (URL state persistence)
- [x] Color-code cables by type or status
- [x] Cable defaults bar with type, color, label, and quick-patch toggle

## v0.3
- [ ] Rear port / front port support (patch panel visualization) -- not sure if it's done?
- [ ] Module Bays visualization: show  modules as an outline to help highlight what portions of the device are modular
- [ ] Module Bays population -- ability to fill module bays easily by typing in a search box.allow module installation from the patcher UI


## Future Ideas

- [ ] Bulk cable operations 
- [ ] Export diagram (PNG/SVG)