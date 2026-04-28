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
- [ ] Draw SVG cables between connected ports (bezier curves — code present, needs end-to-end test)
- [ ] Click port → highlight connected port on another device
- [ ] Create/delete cables from the UI (POST/DELETE to NetBox API — wired up, needs test)

## v0.2
- [ ] Save/load canvas layout (localStorage or plugin model)
- [ ] Color-code cables by type or status
- [ ] Search/filter ports within a device card
- [ ] Allow a device to appear on both left and right sides (useful for patch panels)

## v0.3
- [ ] Rear port / front port support (patch panel visualization)
- [ ] Bulk cable operations
- [ ] Export diagram (PNG/SVG)

## Future Ideas
- [ ] WebSocket live-update when cables change
- [ ] Role-based permissions for cable changes
- [ ] Integration with NetBox rack elevation view