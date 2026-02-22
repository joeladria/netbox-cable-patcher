/**
 * Cable Patcher - Interactive SVG-based patch bay visualization
 */

class CablePatcher {
    constructor(options) {
        this.container = options.container;
        this.svg = options.svg;
        this.csrfToken = options.csrfToken;
        // Use a relative plugin API path so requests are made to the plugin's
        // endpoints (e.g. '<plugin-url>/api/locations'). A leading slash would
        // target the global NetBox API instead.
        this.apiBase = 'api/';

        // State
        this.locations = [];
        this.devices = [];
        this.cables = [];
        this.primaryDeviceId = null;
        this.currentMode = 'network';
        this.zoom = 1;
        this.selectedCable = null;
        this.selectedCables = [];
        this.pendingConnection = null;

        // Drag state for device reordering
        this.draggingDevice = null;
        this.dragStartY = 0;
        this.dragOffsetY = 0;
        this.deviceOrder = []; // stores ordered secondary device IDs

        // SVG layers
        this.cablesLayer = document.getElementById('cables-layer');
        this.devicesLayer = document.getElementById('devices-layer');
        this.tempCableLayer = document.getElementById('temp-cable-layer');

        // Layout constants
        this.DEVICE_WIDTH = 200;
        this.DEVICE_HEADER_HEIGHT = 40;
        this.PORT_HEIGHT = 28;
        this.PORT_RADIUS = 10;
        this.DEVICE_PADDING = 10;
        this.DEVICE_GAP = 50;
        this.PRIMARY_X = 50;
        this.SECONDARY_X = 400;

        // Port colors by type
        this.PORT_COLORS = {
            Interface: '#3498db',
            PowerPort: '#e74c3c',
            PowerOutlet: '#c0392b',
            FrontPort: '#9b59b6',
            RearPort: '#8e44ad',
            ConsolePort: '#2ecc71',
            ConsoleServerPort: '#27ae60',
            default: '#7f8c8d'
        };

        // MDI icon paths (24×24 viewBox) for each port type
        this.PORT_ICONS = {
            Interface:          'M7,15H9V18H11V15H13V18H15V15H17V18H19V9H15V6H9V9H5V18H7V15M4.38,3H19.63C20.94,3 22,4.06 22,5.38V19.63A2.37,2.37 0 0,1 19.63,22H4.38C3.06,22 2,20.94 2,19.63V5.38C2,4.06 3.06,3 4.38,3Z',
            ConsolePort:        'M20,19V7H4V19H20M20,3A2,2 0 0,1 22,5V19A2,2 0 0,1 20,21H4A2,2 0 0,1 2,19V5C2,3.89 2.9,3 4,3H20M13,17V15H18V17H13M9.58,13L5.57,9H8.4L11.7,12.3C12.09,12.69 12.09,13.33 11.7,13.72L8.42,17H5.59L9.58,13Z',
            ConsoleServerPort:  'M15,20A1,1 0 0,0 14,19H13V17H17A2,2 0 0,0 19,15V5A2,2 0 0,0 17,3H7A2,2 0 0,0 5,5V15A2,2 0 0,0 7,17H11V19H10A1,1 0 0,0 9,20H2V22H9A1,1 0 0,0 10,23H14A1,1 0 0,0 15,22H22V20H15M7,15V5H17V15H7M8,6.89L11.56,10.45L8,14H10.53L13.45,11.08C13.78,10.74 13.78,10.18 13.45,9.82L10.5,6.89H8M16,12.22H13.33V14H16V12.22Z',
            PowerPort:          'M16 7V3H14V7H10V3H8V7C7 7 6 8 6 9V14.5L9.5 18V21H14.5V18L18 14.5V9C18 8 17 7 16 7M16 13.67L13.09 16.59L12.67 17H11.33L10.92 16.59L8 13.67V9.09C8 9.06 8.06 9 8.09 9H15.92C15.95 9 16 9.06 16 9.09V13.67Z',
            PowerOutlet:        'M15,15H17V11H15M7,15H9V11H7M11,13H13V9H11M8.83,7H15.2L19,10.8V17H5V10.8M8,5L3,10V19H21V10L16,5H8Z',
            FrontPort:          'M8 3H16C18.76 3 21 5.24 21 8V16C21 18.76 18.76 21 16 21H8C5.24 21 3 18.76 3 16V8C3 5.24 5.24 3 8 3Z',
            FrontPort_uncabled: 'M8 3H16C18.76 3 21 5.24 21 8V16C21 18.76 18.76 21 16 21H8C5.24 21 3 18.76 3 16V8C3 5.24 5.24 3 8 3M8 5C6.34 5 5 6.34 5 8V16C5 17.66 6.34 19 8 19H16C17.66 19 19 17.66 19 16V8C19 6.34 17.66 5 16 5H8Z',
            RearPort:           'M8 3H16C18.76 3 21 5.24 21 8V16C21 18.76 18.76 21 16 21H8C5.24 21 3 18.76 3 16V8C3 5.24 5.24 3 8 3Z',
            RearPort_uncabled:  'M8 3H16C18.76 3 21 5.24 21 8V16C21 18.76 18.76 21 16 21H8C5.24 21 3 18.76 3 16V8C3 5.24 5.24 3 8 3M8 5C6.34 5 5 6.34 5 8V16C5 17.66 6.34 19 8 19H16C17.66 19 19 17.66 19 16V8C19 6.34 17.66 5 16 5H8Z',
        };

        // Cable colors
        this.CABLE_COLORS = {
            'cat6': '#3498db',
            'cat6a': '#2980b9',
            'mmf': '#e67e22',
            'smf': '#f1c40f',
            'power': '#e74c3c',
            'coaxial': '#9b59b6',
            default: '#7f8c8d'
        };

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadLocations();
    }

    // ========== URL State Management ==========

    /**
     * Read current selections from URL query parameters.
     * Returns an object with site, location, rack, device, mode keys.
     */
    readUrlState() {
        const params = new URLSearchParams(window.location.search);
        return {
            site: params.get('site') || '',
            location: params.get('location') || '',
            rack: params.get('rack') || '',
            device: params.get('device') || '',
            mode: params.get('mode') || ''
        };
    }

    /**
     * Push current dropdown selections into the URL without reloading.
     */
    pushUrlState() {
        const params = new URLSearchParams();
        const site = document.getElementById('site-select').value;
        const location = document.getElementById('location-select').value;
        const rack = document.getElementById('rack-select').value;
        const device = document.getElementById('primary-device-select').value;
        const mode = this.currentMode;

        if (site) params.set('site', site);
        if (location) params.set('location', location);
        if (rack) params.set('rack', rack);
        if (device) params.set('device', device);
        if (mode && mode !== 'network') params.set('mode', mode);

        const qs = params.toString();
        const newUrl = window.location.pathname + (qs ? '?' + qs : '');
        window.history.replaceState(null, '', newUrl);
    }

    /**
     * After locations have loaded, restore the full view from URL params.
     * Walks the cascade: site → location → rack → loadDevices → device.
     */
    async restoreFromUrl() {
        const state = this.readUrlState();
        if (!state.site) return;

        // Restore mode first
        if (state.mode) {
            const modeRadio = document.querySelector(`input[name="mode"][value="${state.mode}"]`);
            if (modeRadio) {
                modeRadio.checked = true;
                this.currentMode = state.mode;
            }
        }

        // Set site
        this.setSelectValue('site-select', state.site);
        const site = this.locations.find(s => s.id == state.site);
        if (!site) return;

        // Populate location dropdown
        if (site.locations.length > 0) {
            const locOptions = site.locations.map(l => ({ value: l.id, text: l.name }));
            this.populateSelect('location-select', locOptions, 'Select Location...', false);
        }

        // Populate site-level racks
        if (site.racks.length > 0 || site.locations.length === 0) {
            const rackOptions = site.racks.map(r => ({ value: r.id, text: r.name }));
            this.populateSelect('rack-select', rackOptions, 'Select Rack...', false);
        }

        // Set location (if any) and populate its racks
        if (state.location) {
            this.setSelectValue('location-select', state.location);
            const loc = site.locations.find(l => l.id == state.location);
            if (loc && loc.racks.length > 0) {
                const rackOptions = loc.racks.map(r => ({ value: r.id, text: r.name }));
                this.populateSelect('rack-select', rackOptions, 'Select Rack...', false);
            }
        }

        // Set rack
        if (state.rack) {
            this.setSelectValue('rack-select', state.rack);
        }

        // Load devices with the most specific filter
        const loadParams = {};
        if (state.rack) loadParams.rack = state.rack;
        else if (state.location) loadParams.location = state.location;
        else loadParams.site = state.site;

        await this.loadDevices(loadParams);

        // Restore device selection after devices have loaded
        if (state.device) {
            this.setSelectValue('primary-device-select', state.device);
            this.primaryDeviceId = parseInt(state.device) || null;
            this.render();
        }
    }

    /**
     * Set a <select> value, handling TomSelect if present.
     */
    setSelectValue(selectId, value) {
        const el = document.getElementById(selectId);
        if (!el) return;
        if (el.tomselect) {
            el.tomselect.setValue(value, true);  // silent=true to avoid triggering change
        } else {
            el.value = value;
        }
    }

    setupEventListeners() {
        // Helper to safely add event listeners
        const addListener = (id, event, handler) => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener(event, handler);
            }
        };

        // Location selectors
        addListener('site-select', 'change', (e) => this.onSiteChange(e));
        addListener('location-select', 'change', (e) => this.onLocationChange(e));
        addListener('rack-select', 'change', (e) => this.onRackChange(e));
        addListener('primary-device-select', 'change', (e) => this.onPrimaryDeviceChange(e));

        // Mode switches
        document.querySelectorAll('input[name="mode"]').forEach(radio => {
            radio.addEventListener('change', (e) => this.onModeChange(e));
        });

        // Zoom controls
        addListener('zoom-in', 'click', () => this.setZoom(this.zoom + 0.1));
        addListener('zoom-out', 'click', () => this.setZoom(this.zoom - 0.1));
        addListener('zoom-reset', 'click', () => this.setZoom(1));

        // Cable panel
        addListener('close-cable-panel', 'click', () => this.closeCablePanel());
        addListener('delete-cable-btn', 'click', () => this.deleteSelectedCable());

        // Create cable modal
        addListener('create-cable-btn', 'click', () => {
            console.log('Create cable button clicked');
            this.createCable();
        });

        // Modal dismiss buttons (for when Bootstrap isn't available as global)
        document.querySelectorAll('[data-bs-dismiss="modal"]').forEach(btn => {
            btn.addEventListener('click', () => {
                const modal = btn.closest('.modal');
                if (modal) this.hideModal(modal.id);
            });
        });

        // SVG events for cable drawing and device dragging
        if (this.svg) {
            this.svg.addEventListener('mousemove', (e) => {
                this.onSvgMouseMove(e);
                this.onDeviceDrag(e);
            });
            this.svg.addEventListener('click', (e) => {
                console.log('SVG click target:', e.target.tagName, e.target.className?.baseVal || e.target.className);
                this.onSvgClick(e);
            });
            this.svg.addEventListener('mouseup', (e) => this.onDeviceDragEnd(e));
            this.svg.addEventListener('mouseleave', (e) => this.onDeviceDragEnd(e));
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.cancelPendingConnection();
                this.closeCablePanel();
            }

            // Delete/Backspace deletes selected cable(s)
            if (e.key === 'Delete' || e.key === 'Backspace') {
                // Don't trigger when typing in an input/select
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
                if (this.selectedCables && this.selectedCables.length > 0) {
                    e.preventDefault();
                    this.deleteSelectedCables();
                } else if (this.selectedCable) {
                    e.preventDefault();
                    this.deleteSelectedCable();
                }
            }

            // Enter submits the create-cable modal when visible
            if (e.key === 'Enter') {
                const modal = document.getElementById('create-cable-modal');
                if (modal && (modal.classList.contains('show') || modal.style.display === 'block')) {
                    e.preventDefault();
                    this.createCable();
                }
            }
        });
    }

    // ========== API Methods ==========

    async apiGet(endpoint) {
        const response = await fetch(this.apiBase + endpoint, {
            credentials: 'same-origin',
            headers: {
                'Accept': 'application/json',
            }
        });
        if (!response.ok) throw new Error(`API error: ${response.status}`);
        return response.json();
    }

    async apiPost(endpoint, data) {
        const response = await fetch(this.apiBase + endpoint, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': this.csrfToken,
            },
            body: JSON.stringify(data)
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || `API error: ${response.status}`);
        }
        return response.json();
    }

    async apiDelete(endpoint) {
        const response = await fetch(this.apiBase + endpoint, {
            method: 'DELETE',
            credentials: 'same-origin',
            headers: {
                'X-CSRFToken': this.csrfToken,
            }
        });
        if (!response.ok && response.status !== 204) {
            throw new Error(`API error: ${response.status}`);
        }
        return true;
    }

    // ========== Data Loading ==========

    async loadLocations() {
        try {
            const resp = await this.apiGet('locations/');

            if (Array.isArray(resp)) {
                this.locations = resp;
            } else if (resp && Array.isArray(resp.results)) {
                this.locations = resp.results;
            } else {
                this.locations = [];
            }

            this.populateSiteSelect();

            // Restore view from URL params (site/location/rack/device)
            await this.restoreFromUrl();
        } catch (error) {
            console.error('CablePatcher: Failed to load locations:', error);
            this.showError('Failed to load locations');
        }
    }

    populateSiteSelect() {
        const options = this.locations
            .filter(site => site.id)
            .map(site => ({ value: site.id, text: site.name }));
        this.populateSelect('site-select', options, 'Select Site...');
    }

    // Helper to populate select elements, handling TomSelect if present
    populateSelect(selectId, options, placeholder = 'Select...', disabled = false) {
        const select = document.getElementById(selectId);
        if (!select) return;

        const ts = select.tomselect;

        if (ts) {
            // TomSelect: use its API
            ts.clear();
            ts.clearOptions();
            ts.addOption({ value: '', text: placeholder });
            options.forEach(opt => {
                ts.addOption({ value: opt.value, text: opt.text });
            });
            ts.refreshOptions(false);
            if (disabled) {
                ts.disable();
            } else {
                ts.enable();
            }
        } else {
            // Native select
            select.innerHTML = '';
            select.add(new Option(placeholder, ''));
            options.forEach(opt => {
                select.add(new Option(opt.text, opt.value));
            });
            select.disabled = disabled;
        }
    }

    async loadDevices(params) {
        this.showLoading(true);

        try {
            // Query the plugin devices endpoint which returns devices with ports
            // already serialized by `DeviceWithPortsSerializer`.
            const qp = new URLSearchParams();
            if (params.rack) qp.set('rack', params.rack);
            else if (params.location) qp.set('location', params.location);
            else if (params.site) qp.set('site', params.site);

            const devicesResponse = await this.apiGet('devices/?' + qp.toString());
            // The plugin returns an array of device objects matching the serializer
            this.devices = devicesResponse || [];

            // Load cables from plugin endpoint. Prefer server-side filtering by
            // the same params to avoid fetching the entire NetBox cable list.
            let cablesQuery = '';
            if (params.rack) cablesQuery = 'cables/?rack=' + params.rack;
            else if (params.location) cablesQuery = 'cables/?location=' + params.location;
            else if (params.site) cablesQuery = 'cables/?site=' + params.site;
            else if (this.devices.length > 0) {
                // Request cables by device IDs
                const parts = this.devices.map(d => 'device_ids[]=' + d.id).join('&');
                cablesQuery = 'cables/?' + parts;
            }

            if (cablesQuery) {
                const cablesResponse = await this.apiGet(cablesQuery);
                this.cables = cablesResponse || [];
            } else {
                this.cables = [];
            }

            // Rebuild the device dropdown, then restore the previous selection
            // so that cable create/delete doesn't jump to a different device.
            const previousDeviceId = this.primaryDeviceId;
            this.populatePrimaryDeviceSelect();
            if (previousDeviceId && this.devices.some(d => d.id === previousDeviceId)) {
                this.setSelectValue('primary-device-select', previousDeviceId);
                this.primaryDeviceId = previousDeviceId;
            }
            this.render();
        } catch (error) {
            console.error('Failed to load devices:', error);
            this.showError('Failed to load devices');
        } finally {
            this.showLoading(false);
        }
    }

    populatePrimaryDeviceSelect() {
        const options = this.devices.map(d => ({ value: d.id, text: d.name }));
        this.populateSelect('primary-device-select', options, 'Select Device...', this.devices.length === 0);
    }

    // ========== Event Handlers ==========

    onSiteChange(e) {
        const siteId = e.target.value;

        // Reset dependent dropdowns
        this.populateSelect('location-select', [], 'Select Location...', true);
        this.populateSelect('rack-select', [], 'Select Rack...', true);

        if (!siteId) {
            this.pushUrlState();
            this.showEmpty();
            return;
        }

        const site = this.locations.find(s => s.id == siteId);
        if (!site) return;

        // Populate locations
        if (site.locations.length > 0) {
            const locOptions = site.locations.map(l => ({ value: l.id, text: l.name }));
            this.populateSelect('location-select', locOptions, 'Select Location...', false);
        }

        // Populate racks (site-level racks)
        if (site.racks.length > 0 || site.locations.length === 0) {
            const rackOptions = site.racks.map(r => ({ value: r.id, text: r.name }));
            this.populateSelect('rack-select', rackOptions, 'Select Rack...', false);
        }

        // Load devices for entire site if no more specific selection
        this.loadDevices({ site: siteId });
        this.pushUrlState();
    }

    onLocationChange(e) {
        const locationId = e.target.value;
        const siteId = document.getElementById('site-select').value;

        // Reset rack dropdown
        this.populateSelect('rack-select', [], 'Select Rack...', true);

        if (!locationId) {
            // Fall back to site-level
            if (siteId) {
                this.loadDevices({ site: siteId });
            }
            this.pushUrlState();
            return;
        }

        const site = this.locations.find(s => s.id == siteId);
        const location = site?.locations.find(l => l.id == locationId);

        if (location && location.racks.length > 0) {
            const rackOptions = location.racks.map(r => ({ value: r.id, text: r.name }));
            this.populateSelect('rack-select', rackOptions, 'Select Rack...', false);
        }

        this.loadDevices({ location: locationId });
        this.pushUrlState();
    }

    onRackChange(e) {
        const rackId = e.target.value;

        if (!rackId) {
            const locationId = document.getElementById('location-select').value;
            const siteId = document.getElementById('site-select').value;
            if (locationId) {
                this.loadDevices({ location: locationId });
            } else if (siteId) {
                this.loadDevices({ site: siteId });
            }
            this.pushUrlState();
            return;
        }

        this.loadDevices({ rack: rackId });
        this.pushUrlState();
    }

    onPrimaryDeviceChange(e) {
        this.primaryDeviceId = e.target.value ? parseInt(e.target.value) : null;
        this.render();
        this.pushUrlState();
    }

    onModeChange(e) {
        this.currentMode = e.target.value;
        this.render();
        this.pushUrlState();
    }

    // ========== Rendering ==========

    render() {
        if (this.devices.length === 0) {
            this.showEmpty();
            return;
        }

        this.showEmpty(false);

        // Clear layers
        this.cablesLayer.innerHTML = '';
        this.devicesLayer.innerHTML = '';
        this.tempCableLayer.innerHTML = '';

        // Get ports based on mode
        const portTypes = this.getPortTypesForMode();

        // Separate primary device and others
        const primaryDevice = this.primaryDeviceId
            ? this.devices.find(d => d.id === this.primaryDeviceId)
            : this.devices[0];

        // Patch panel devices: have front_ports or rear_ports (shown in middle column in all modes)
        const patchPanelDevices = this.devices
            .filter(d => d.id !== primaryDevice?.id)
            .filter(d => (d.front_ports || []).length > 0 || (d.rear_ports || []).length > 0)
            .sort((a, b) => a.name.localeCompare(b.name));

        // Secondary devices: exclude patch panels, filter to mode-specific ports
        const otherDevices = this.devices
            .filter(d => d.id !== primaryDevice?.id)
            .filter(d => !patchPanelDevices.some(pp => pp.id === d.id))
            .filter(d => portTypes.some(type => (d[type] || []).length > 0))
            .sort((a, b) => {
                if (!primaryDevice) return 0;
                const countCables = (device) => {
                    return this.cables.filter(cable => {
                        const aTerms = cable.a_terminations || [];
                        const bTerms = cable.b_terminations || [];
                        const deviceIds = [device.id];
                        const primaryIds = [primaryDevice.id];
                        const aDevices = aTerms.map(t => t.device_id);
                        const bDevices = bTerms.map(t => t.device_id);
                        return (aDevices.some(id => primaryIds.includes(id)) && bDevices.some(id => deviceIds.includes(id))) ||
                               (bDevices.some(id => primaryIds.includes(id)) && aDevices.some(id => deviceIds.includes(id)));
                    }).length;
                };
                return countCables(b) - countCables(a);
            });

        // Track port positions for cable routing
        this.portPositions = {};

        let maxHeight = 0;

        // Render primary device on left
        if (primaryDevice) {
            const height = this.renderDevice(primaryDevice, this.PRIMARY_X, 20, true, portTypes);
            maxHeight = Math.max(maxHeight, height);
        }

        // Compute X positions for middle (patch panels) and secondary columns
        const hasPatchPanels = patchPanelDevices.length > 0;
        const MIDDLE_X = this.PRIMARY_X + this.DEVICE_WIDTH + 80;
        const effectiveSecondaryX = hasPatchPanels ? MIDDLE_X + this.DEVICE_WIDTH + 80 : this.SECONDARY_X;

        // Render middle column (patch panels) — always use front_ports/rear_ports
        this._middleDevicePositions = [];
        let midYOffset = 20;
        patchPanelDevices.forEach(device => {
            const height = this.renderDevice(
                device, MIDDLE_X, midYOffset, false, ['front_ports', 'rear_ports'], true
            );
            this._middleDevicePositions.push({ device, y: midYOffset, height });
            midYOffset += height + this.DEVICE_GAP;
            maxHeight = Math.max(maxHeight, midYOffset);
        });

        // Apply user-defined device order if available
        if (this.deviceOrder.length > 0) {
            const orderMap = new Map(this.deviceOrder.map((id, i) => [id, i]));
            otherDevices.sort((a, b) => {
                const ai = orderMap.has(a.id) ? orderMap.get(a.id) : Infinity;
                const bi = orderMap.has(b.id) ? orderMap.get(b.id) : Infinity;
                return ai - bi;
            });
        }

        // Render other devices on right
        this._secondaryDevicePositions = [];
        let yOffset = 20;
        otherDevices.forEach(device => {
            const height = this.renderDevice(device, effectiveSecondaryX, yOffset, false, portTypes);
            this._secondaryDevicePositions.push({ device, y: yOffset, height });
            yOffset += height + this.DEVICE_GAP;
            maxHeight = Math.max(maxHeight, yOffset);
        });

        // Update SVG size
        const totalWidth = effectiveSecondaryX + this.DEVICE_WIDTH + 100;
        this.svg.setAttribute('width', totalWidth);
        this.svg.setAttribute('height', maxHeight + 50);

        // Render cables
        this.renderCables();

        // Apply zoom
        this.applyZoom();
    }

    getPortTypesForMode() {
        switch (this.currentMode) {
            case 'network':
                return ['interfaces'];
            case 'power':
                return ['power_ports', 'power_outlets'];
            case 'console':
                return ['console_ports', 'console_server_ports'];
            default:
                return ['interfaces'];
        }
    }

    renderDevice(device, x, y, isPrimary, portTypes, isMiddle = false) {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('class', 'device' + (isPrimary ? ' primary' : ''));
        g.setAttribute('data-device-id', device.id);

        // Collect all ports for this mode
        let ports = [];
        portTypes.forEach(type => {
            const devicePorts = device[type] || [];
            ports = ports.concat(devicePorts.map(p => ({
                ...p,
                _portType: type
            })));
        });

        const deviceHeight = this.DEVICE_HEADER_HEIGHT + (ports.length * this.PORT_HEIGHT) + this.DEVICE_PADDING;

        // Device background
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', x);
        rect.setAttribute('y', y);
        rect.setAttribute('width', this.DEVICE_WIDTH);
        rect.setAttribute('height', deviceHeight);
        rect.setAttribute('rx', 8);
        rect.setAttribute('class', 'device-box');
        g.appendChild(rect);

        // Device header
        const headerBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        headerBg.setAttribute('x', x);
        headerBg.setAttribute('y', y);
        headerBg.setAttribute('width', this.DEVICE_WIDTH);
        headerBg.setAttribute('height', this.DEVICE_HEADER_HEIGHT);
        headerBg.setAttribute('rx', 8);
        headerBg.setAttribute('class', 'device-header');
        g.appendChild(headerBg);

        // Cover bottom corners of header
        const headerCover = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        headerCover.setAttribute('x', x);
        headerCover.setAttribute('y', y + this.DEVICE_HEADER_HEIGHT - 8);
        headerCover.setAttribute('width', this.DEVICE_WIDTH);
        headerCover.setAttribute('height', 8);
        headerCover.setAttribute('class', 'device-header');
        g.appendChild(headerCover);

        // Device name
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', x + this.DEVICE_WIDTH / 2);
        text.setAttribute('y', y + 25);
        text.setAttribute('class', 'device-name');
        text.textContent = device.name;
        g.appendChild(text);

        // Double-click device header to open in NetBox
        const onDeviceDblClick = (e) => {
            e.stopPropagation();
            window.open('/dcim/devices/' + device.id + '/', '_blank');
        };
        headerBg.addEventListener('dblclick', onDeviceDblClick);
        headerCover.addEventListener('dblclick', onDeviceDblClick);

        // Drag handle for secondary (right-side) devices
        if (!isPrimary && !isMiddle) {
            headerBg.style.cursor = 'grab';
            headerCover.style.cursor = 'grab';

            const onDragStart = (e) => {
                // Use a threshold to distinguish clicks from drags
                const svgPt = this.svgPoint(e);
                if (!svgPt) return;
                this.draggingDevice = {
                    deviceId: device.id,
                    group: g,
                    startY: svgPt.y,
                    origTranslateY: 0,
                    moved: false
                };
                this.container.classList.add('dragging-device');
                headerBg.style.cursor = 'grabbing';
                headerCover.style.cursor = 'grabbing';
                e.preventDefault();
            };

            headerBg.addEventListener('mousedown', onDragStart);
            headerCover.addEventListener('mousedown', onDragStart);
        }

        // Render ports
        // Default: primary device ports on right edge, secondary on left edge
        // In power mode, reverse: outlets face right (toward cables), power ports face left
        const defaultPortX = isPrimary ? x + this.DEVICE_WIDTH - this.DEVICE_PADDING : x + this.DEVICE_PADDING;

        ports.forEach((port, index) => {
            const portY = y + this.DEVICE_HEADER_HEIGHT + (index * this.PORT_HEIGHT) + this.PORT_HEIGHT / 2;

            // In power mode, determine port edge by port type
            let portX = defaultPortX;
            if (this.currentMode === 'power') {
                if (port._portType === 'power_outlets') {
                    portX = x + this.DEVICE_WIDTH - this.DEVICE_PADDING; // right edge
                } else if (port._portType === 'power_ports') {
                    portX = x + this.DEVICE_PADDING; // left edge
                }
            } else if (this.currentMode === 'console') {
                if (port._portType === 'console_server_ports') {
                    portX = x + this.DEVICE_WIDTH - this.DEVICE_PADDING; // right edge
                } else if (port._portType === 'console_ports') {
                    portX = x + this.DEVICE_PADDING; // left edge
                }
            }
            if (isMiddle) {
                if (port._portType === 'front_ports') {
                    portX = x + this.DEVICE_PADDING; // left — faces primary
                } else if (port._portType === 'rear_ports') {
                    portX = x + this.DEVICE_WIDTH - this.DEVICE_PADDING; // right — faces secondary
                }
            }

            // Store port position
            const portKey = `${port.port_type}-${port.id}`;
            this.portPositions[portKey] = {
                x: portX,
                y: portY,
                device: device,
                port: port,
                isPrimary: isPrimary
            };

            // Port circle
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', portX);
            circle.setAttribute('cy', portY);
            circle.setAttribute('r', this.PORT_RADIUS);
            circle.setAttribute('class', 'port' + (port.cable_id ? ' connected' : ''));
            circle.setAttribute('data-port-type', port.port_type);
            circle.setAttribute('data-port-id', port.id);
            circle.setAttribute('data-device-id', device.id);

            // Color based on port type
            const color = this.PORT_COLORS[port.port_type] || this.PORT_COLORS.default;
            circle.style.fill = port.cable_id ? color : '#fff';
            circle.style.stroke = color;

            // Event handlers
            circle.addEventListener('mouseenter', (e) => this.onPortHover(e, port, device));
            circle.addEventListener('mouseleave', () => this.hideTooltip());
            circle.addEventListener('click', (e) => this.onPortClick(e, port, device));
            circle.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                if (this.pendingConnection) {
                    this.pendingConnection = null;
                    this.container.classList.remove('connecting-mode');
                    this.tempCableLayer.innerHTML = '';
                    document.querySelectorAll('.port.connecting').forEach(p => p.classList.remove('connecting'));
                }
                const url = this.getPortUrl(port);
                if (url) window.open(url, '_blank');
            });

            g.appendChild(circle);

            // Port type icon inside the port circle
            const iconKey = (port.port_type === 'FrontPort' || port.port_type === 'RearPort')
                ? (port.cable_id ? port.port_type : port.port_type + '_uncabled')
                : port.port_type;
            const iconPath = this.PORT_ICONS[iconKey];
            if (iconPath) {
                const iconSize = this.PORT_RADIUS * 1.5;
                const iconScale = iconSize / 24;
                const icon = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                icon.setAttribute('d', iconPath);
                icon.setAttribute('transform',
                    `translate(${portX - iconSize / 2}, ${portY - iconSize / 2}) scale(${iconScale})`);
                icon.setAttribute('class', 'port-icon');
                icon.style.fill = port.cable_id ? '#ffffff' : color;
                g.appendChild(icon);
            }

            // Port label — position based on which edge the port is on
            const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            const portOnRight = portX > x + this.DEVICE_WIDTH / 2;
            const labelX = portOnRight ? portX - this.PORT_RADIUS - 5 : portX + this.PORT_RADIUS + 5;
            label.setAttribute('x', labelX);
            label.setAttribute('y', portY + 4);
            label.setAttribute('class', 'port-label');
            label.setAttribute('text-anchor', portOnRight ? 'end' : 'start');
            label.textContent = port.untagged_vlan_vid
                ? `${port.name} (V${port.untagged_vlan_vid})`
                : port.name;
            g.appendChild(label);
        });

        this.devicesLayer.appendChild(g);
        return deviceHeight;
    }

    renderCables() {
        this.cables.forEach(cable => {
            this.renderCable(cable);
        });
    }

    renderCable(cable) {
        // Find port positions for both terminations
        const aTerms = cable.a_terminations || [];
        const bTerms = cable.b_terminations || [];

        if (aTerms.length === 0 || bTerms.length === 0) return;

        const aTerm = aTerms[0];
        const bTerm = bTerms[0];

        const aKey = `${aTerm.type}-${aTerm.id}`;
        const bKey = `${bTerm.type}-${bTerm.id}`;

        const aPos = this.portPositions[aKey];
        const bPos = this.portPositions[bKey];

        if (!aPos || !bPos) return;

        // Create cable path
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');

        // Calculate bezier curve
        const d = this.calculateCablePath(aPos.x, aPos.y, bPos.x, bPos.y);
        path.setAttribute('d', d);
        path.setAttribute('class', 'cable');
        path.setAttribute('data-cable-id', cable.id);

        // Color based on cable type or custom color
        let color = cable.color || this.CABLE_COLORS[cable.type] || this.CABLE_COLORS.default;
        if (color && !color.startsWith('#')) {
            color = '#' + color;
        }
        path.style.stroke = color;

        // Status styling
        if (cable.status === 'planned') {
            path.classList.add('planned');
        } else if (cable.status === 'decommissioning') {
            path.classList.add('decommissioning');
        }

        // Click handler — pass event for multi-select detection
        path.addEventListener('click', (e) => {
            e.stopPropagation();
            this.selectCable(cable, e);
        });

        this.cablesLayer.appendChild(path);
    }

    calculateCablePath(x1, y1, x2, y2) {
        // Calculate control points for smooth bezier curve
        const dx = Math.abs(x2 - x1);
        const controlOffset = Math.min(dx * 0.5, 150);

        // Determine curve direction based on position
        const cp1x = x1 + (x1 < x2 ? controlOffset : -controlOffset);
        const cp2x = x2 + (x2 < x1 ? controlOffset : -controlOffset);

        return `M ${x1} ${y1} C ${cp1x} ${y1}, ${cp2x} ${y2}, ${x2} ${y2}`;
    }

    getPortUrl(port) {
        const map = {
            Interface:         'interfaces',
            ConsolePort:       'console-ports',
            ConsoleServerPort: 'console-server-ports',
            PowerPort:         'power-ports',
            PowerOutlet:       'power-outlets',
            FrontPort:         'front-ports',
            RearPort:          'rear-ports',
        };
        const segment = map[port.port_type];
        return segment ? `/dcim/${segment}/${port.id}/` : null;
    }

    // ========== Port Interaction ==========

    onPortHover(e, port, device) {
        const tooltip = document.getElementById('port-tooltip');
        const portName = document.getElementById('tooltip-port-name');
        const portType = document.getElementById('tooltip-port-type');
        const connection = document.getElementById('tooltip-connection');

        portName.textContent = port.name;
        portType.textContent = port.type || port.port_type;

        // Clear any existing content
        connection.innerHTML = '';

        if (port.connected_endpoint) {
            const ep = port.connected_endpoint;
            // Use safe DOM construction to prevent XSS
            const badge = document.createElement('span');
            badge.className = 'badge bg-success';
            badge.textContent = 'Connected';
            connection.appendChild(badge);
            connection.appendChild(document.createTextNode(` to ${ep.device_name} - ${ep.name}`));
        } else {
            const badge = document.createElement('span');
            badge.className = 'badge bg-secondary';
            badge.textContent = 'Available';
            connection.appendChild(badge);
        }

        // Position tooltip
        const rect = e.target.getBoundingClientRect();
        tooltip.style.left = rect.right + 10 + 'px';
        tooltip.style.top = rect.top - 10 + 'px';
        tooltip.style.display = 'block';
    }

    hideTooltip() {
        document.getElementById('port-tooltip').style.display = 'none';
    }

    onPortClick(e, port, device) {
        e.stopPropagation();
        console.log('Port clicked:', port.name, 'cable_id:', port.cable_id, 'pending:', !!this.pendingConnection);

        // If port is already connected, select the cable
        if (port.cable_id) {
            console.log('Port already connected, selecting cable');
            const cable = this.cables.find(c => c.id === port.cable_id);
            if (cable) {
                this.selectCable(cable, e);
            }
            return;
        }

        // If no pending connection, start one
        if (!this.pendingConnection) {
            console.log('Starting new connection');
            this.startConnection(port, device);
            return;
        }

        // If we have a pending connection, complete it
        console.log('Completing connection');
        this.completeConnection(port, device);
    }

    startConnection(port, device) {
        this.pendingConnection = {
            port: port,
            device: device,
            type: port.port_type
        };

        // Highlight the starting port
        const portElement = document.querySelector(
            `circle[data-port-type="${port.port_type}"][data-port-id="${port.id}"]`
        );
        if (portElement) {
            portElement.classList.add('connecting');
        }

        // Show visual feedback
        this.container.classList.add('connecting-mode');
    }

    completeConnection(port, device) {
        // Validate connection
        if (port.id === this.pendingConnection.port.id &&
            port.port_type === this.pendingConnection.type) {
            // Can't connect to self
            this.cancelPendingConnection();
            return;
        }

        // Show create cable modal
        const from = this.pendingConnection;
        const to = { port, device };

        document.getElementById('cable-from-input').value =
            `${from.device.name} - ${from.port.name}`;
        document.getElementById('cable-to-input').value =
            `${to.device.name} - ${to.port.name}`;

        // Store connection data for creation
        this._pendingCableData = {
            a_termination_type: from.type,
            a_termination_id: from.port.id,
            b_termination_type: to.port.port_type,
            b_termination_id: to.port.id
        };

        // Pre-select cable type based on current mode
        const defaultTypes = { network: 'cat6', power: 'power', patch: 'mmf-om4' };
        const typeSelect = document.getElementById('cable-type-select');
        if (typeSelect && defaultTypes[this.currentMode]) {
            typeSelect.value = defaultTypes[this.currentMode];
        }

        // Show modal
        this.showModal('create-cable-modal');
        this.cancelPendingConnection();
    }

    showModal(modalId) {
        const modalEl = document.getElementById(modalId);
        if (!modalEl) return;

        // Try Bootstrap first
        const Modal = window.bootstrap?.Modal || globalThis.bootstrap?.Modal;
        if (Modal) {
            Modal.getOrCreateInstance(modalEl).show();
            return;
        }

        // Manual modal handling
        modalEl.style.display = 'block';
        modalEl.classList.add('show');
        modalEl.setAttribute('aria-modal', 'true');
        modalEl.removeAttribute('aria-hidden');

        // Add backdrop
        let backdrop = document.querySelector('.modal-backdrop');
        if (!backdrop) {
            backdrop = document.createElement('div');
            backdrop.className = 'modal-backdrop fade show';
            document.body.appendChild(backdrop);
        }
        document.body.classList.add('modal-open');
    }

    hideModal(modalId) {
        console.log('hideModal called for:', modalId);
        const modalEl = document.getElementById(modalId);
        if (!modalEl) {
            console.log('Modal element not found');
            return;
        }

        // Try Bootstrap first
        const Modal = window.bootstrap?.Modal || globalThis.bootstrap?.Modal;
        if (Modal) {
            console.log('Using Bootstrap Modal.hide()');
            Modal.getInstance(modalEl)?.hide();
            return;
        }

        // Manual modal handling
        console.log('Using manual modal hide');
        modalEl.style.display = 'none';
        modalEl.classList.remove('show');
        modalEl.setAttribute('aria-hidden', 'true');
        modalEl.removeAttribute('aria-modal');

        // Remove backdrop
        const backdrop = document.querySelector('.modal-backdrop');
        console.log('Backdrop element:', backdrop);
        if (backdrop) backdrop.remove();
        document.body.classList.remove('modal-open');
        console.log('Modal hide complete');
    }

    cancelPendingConnection() {
        if (!this.pendingConnection) return;

        // Remove highlighting
        const portElement = document.querySelector(
            `circle[data-port-type="${this.pendingConnection.type}"][data-port-id="${this.pendingConnection.port.id}"]`
        );
        if (portElement) {
            portElement.classList.remove('connecting');
        }

        this.pendingConnection = null;
        this.container.classList.remove('connecting-mode');
        this.tempCableLayer.innerHTML = '';
    }

    onSvgMouseMove(e) {
        if (!this.pendingConnection) return;

        const svg = this.svg;
        const pt = svg.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        const svgPoint = pt.matrixTransform(svg.getScreenCTM().inverse());

        // Get starting position
        const startKey = `${this.pendingConnection.type}-${this.pendingConnection.port.id}`;
        const startPos = this.portPositions[startKey];
        if (!startPos) return;

        // Draw temporary cable
        this.tempCableLayer.innerHTML = '';
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const d = this.calculateCablePath(startPos.x, startPos.y, svgPoint.x, svgPoint.y);
        path.setAttribute('d', d);
        path.setAttribute('class', 'cable temp-cable');
        this.tempCableLayer.appendChild(path);
    }

    onSvgClick(e) {
        // If clicking on empty space while connecting, cancel
        if (this.pendingConnection && e.target === this.svg) {
            this.cancelPendingConnection();
        }
    }

    // ========== Device Dragging ==========

    svgPoint(e) {
        const pt = this.svg.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        const ctm = this.svg.getScreenCTM();
        if (!ctm) return null;
        return pt.matrixTransform(ctm.inverse());
    }

    onDeviceDrag(e) {
        if (!this.draggingDevice) return;

        const svgPt = this.svgPoint(e);
        if (!svgPt) return;
        const dy = svgPt.y - this.draggingDevice.startY;

        // Movement threshold to distinguish from click
        if (Math.abs(dy) < 5 && !this.draggingDevice.moved) return;
        this.draggingDevice.moved = true;

        // Move the device group visually
        const g = this.draggingDevice.group;
        g.setAttribute('transform', `translate(0, ${dy})`);
        g.style.opacity = '0.7';
    }

    onDeviceDragEnd(e) {
        if (!this.draggingDevice) return;

        const drag = this.draggingDevice;
        this.draggingDevice = null;
        this.container.classList.remove('dragging-device');

        // Reset visual state
        drag.group.removeAttribute('transform');
        drag.group.style.opacity = '';

        if (!drag.moved) return;

        // Determine new order based on drop position
        const svgPt = this.svgPoint(e);
        if (!svgPt) { this.render(); return; }
        const positions = this._secondaryDevicePositions || [];
        if (positions.length === 0) return;

        // Find where the device was dropped (by Y center)
        const draggedIdx = positions.findIndex(p => p.device.id === drag.deviceId);
        if (draggedIdx === -1) return;

        const draggedPos = positions[draggedIdx];
        const draggedCenter = draggedPos.y + draggedPos.height / 2 + (svgPt.y - drag.startY);

        // Find target index (default to end so drop below all → last position)
        let targetIdx = positions.length;
        for (let i = 0; i < positions.length; i++) {
            const mid = positions[i].y + positions[i].height / 2;
            if (draggedCenter < mid) {
                targetIdx = i;
                break;
            }
        }

        // Reorder
        const orderedIds = positions.map(p => p.device.id);
        const [removed] = orderedIds.splice(draggedIdx, 1);
        if (targetIdx > draggedIdx) targetIdx--;
        orderedIds.splice(targetIdx, 0, removed);

        this.deviceOrder = orderedIds;
        this.render();
    }

    // ========== Cable Management ==========

    selectCable(cable, event) {
        const isMulti = event && (event.ctrlKey || event.metaKey);

        if (isMulti) {
            // Multi-select: toggle this cable in the selection
            const idx = this.selectedCables.findIndex(c => c.id === cable.id);
            if (idx !== -1) {
                // Deselect it
                this.selectedCables.splice(idx, 1);
                const p = document.querySelector(`path[data-cable-id="${cable.id}"]`);
                if (p) p.classList.remove('selected');
            } else {
                this.selectedCables.push(cable);
                const p = document.querySelector(`path[data-cable-id="${cable.id}"]`);
                if (p) p.classList.add('selected');
            }

            // Also add the previously single-selected cable to multi-select if needed
            if (this.selectedCable && !this.selectedCables.find(c => c.id === this.selectedCable.id)) {
                this.selectedCables.push(this.selectedCable);
            }
            this.selectedCable = null;
        } else {
            // Single select: clear multi-select and previous selection
            this.clearCableSelection();
            this.selectedCable = cable;
            this.selectedCables = [];

            const path = document.querySelector(`path[data-cable-id="${cable.id}"]`);
            if (path) path.classList.add('selected');
        }

        // Update the info panel
        this.updateCableInfoPanel();
    }

    updateCableInfoPanel() {
        const panel = document.getElementById('cable-info-panel');
        const multiInfo = document.getElementById('cable-multi-info');
        const multiCount = document.getElementById('cable-multi-count');

        if (this.selectedCables.length > 1) {
            // Multi-select view
            document.getElementById('cable-from').textContent = '-';
            document.getElementById('cable-to').textContent = '-';
            document.getElementById('cable-type').textContent = '-';
            document.getElementById('cable-status').textContent = '-';
            document.getElementById('cable-netbox-link').style.display = 'none';
            multiInfo.style.display = 'block';
            multiCount.textContent = `${this.selectedCables.length} cables selected`;
            panel.style.display = 'block';
        } else {
            // Single cable view
            const cable = this.selectedCable || (this.selectedCables.length === 1 ? this.selectedCables[0] : null);
            if (!cable) {
                panel.style.display = 'none';
                return;
            }

            const aTerms = cable.a_terminations || [];
            const bTerms = cable.b_terminations || [];

            document.getElementById('cable-from').textContent =
                aTerms.length > 0 ? `${aTerms[0].device_name} - ${aTerms[0].name}` : 'Unknown';
            document.getElementById('cable-to').textContent =
                bTerms.length > 0 ? `${bTerms[0].device_name} - ${bTerms[0].name}` : 'Unknown';
            document.getElementById('cable-type').textContent = cable.type_display || cable.type || '-';
            document.getElementById('cable-status').textContent = cable.status_display || cable.status;
            document.getElementById('cable-netbox-link').href = `/dcim/cables/${cable.id}/`;
            document.getElementById('cable-netbox-link').style.display = '';
            multiInfo.style.display = 'none';
            panel.style.display = 'block';
        }
    }

    clearCableSelection() {
        if (this.selectedCable) {
            const p = document.querySelector(`path[data-cable-id="${this.selectedCable.id}"]`);
            if (p) p.classList.remove('selected');
        }
        this.selectedCables.forEach(cable => {
            const p = document.querySelector(`path[data-cable-id="${cable.id}"]`);
            if (p) p.classList.remove('selected');
        });
    }

    closeCablePanel() {
        this.clearCableSelection();
        this.selectedCable = null;
        this.selectedCables = [];
        document.getElementById('cable-info-panel').style.display = 'none';
    }

    getContentType(portType) {
        const typeMap = {
            'Interface': 'dcim.interface',
            'PowerPort': 'dcim.powerport',
            'PowerOutlet': 'dcim.poweroutlet',
            'FrontPort': 'dcim.frontport',
            'RearPort': 'dcim.rearport',
            'ConsolePort': 'dcim.consoleport',
            'ConsoleServerPort': 'dcim.consoleserverport'
        };
        return typeMap[portType] || 'dcim.interface';
    }

    async createCable() {
        console.log('createCable called, pendingData:', this._pendingCableData);
        if (!this._pendingCableData) {
            console.log('No pending cable data, returning');
            return;
        }

        const cableType = document.getElementById('cable-type-select').value;
        const color = document.getElementById('cable-color-input').value.replace('#', '');
        const label = document.getElementById('cable-label-input').value;

        // Build plugin cable API payload (server will map to NetBox models)
        const cableData = {
            a_termination_type: this._pendingCableData.a_termination_type,
            a_termination_id: this._pendingCableData.a_termination_id,
            b_termination_type: this._pendingCableData.b_termination_type,
            b_termination_id: this._pendingCableData.b_termination_id,
            status: 'connected'
        };

        if (cableType) cableData.type = cableType;
        if (color) cableData.color = color;
        if (label) cableData.label = label;

        console.log('Posting cable data:', cableData);

        try {
            const cable = await this.apiPost('cables/', cableData);
            console.log('Cable created:', cable);

            // Close modal
            console.log('Hiding modal...');
            this.hideModal('create-cable-modal');
            console.log('Modal hidden');

            // Clear form
            document.getElementById('cable-type-select').value = '';
            document.getElementById('cable-color-input').value = '#000000';
            document.getElementById('cable-label-input').value = '';
            this._pendingCableData = null;

            // Reload to get updated port statuses
            this.reloadCurrentView();

        } catch (error) {
            alert('Failed to create cable: ' + error.message);
        }
    }

    async deleteSelectedCable() {
        // If multi-select is active, delegate to bulk delete
        if (this.selectedCables.length > 0) {
            return this.deleteSelectedCables();
        }

        if (!this.selectedCable) return;

        if (!confirm('Are you sure you want to delete this cable?')) return;

        try {
            await this.apiDelete(`cables/${this.selectedCable.id}/`);

            // Remove from local state
            this.cables = this.cables.filter(c => c.id !== this.selectedCable.id);

            this.closeCablePanel();

            // Reload to get updated port statuses
            this.reloadCurrentView();

        } catch (error) {
            alert('Failed to delete cable: ' + error.message);
        }
    }

    async deleteSelectedCables() {
        if (this.selectedCables.length === 0) return;

        const count = this.selectedCables.length;
        if (!confirm(`Are you sure you want to delete ${count} cable(s)?`)) return;

        try {
            const ids = this.selectedCables.map(c => c.id);
            for (const id of ids) {
                await this.apiDelete(`cables/${id}/`);
                this.cables = this.cables.filter(c => c.id !== id);
            }

            this.closeCablePanel();
            this.reloadCurrentView();

        } catch (error) {
            alert('Failed to delete cables: ' + error.message);
        }
    }

    async reloadCurrentView() {
        const rackId = document.getElementById('rack-select').value;
        const locationId = document.getElementById('location-select').value;
        const siteId = document.getElementById('site-select').value;

        if (rackId) {
            await this.loadDevices({ rack: rackId });
        } else if (locationId) {
            await this.loadDevices({ location: locationId });
        } else if (siteId) {
            await this.loadDevices({ site: siteId });
        }
    }

    // ========== UI Helpers ==========

    showEmpty(show = true) {
        document.getElementById('empty-state').style.display = show ? 'block' : 'none';
        this.svg.style.display = show ? 'none' : 'block';
    }

    showLoading(show) {
        document.getElementById('loading-state').style.display = show ? 'block' : 'none';
        document.getElementById('empty-state').style.display = 'none';
        this.svg.style.display = show ? 'none' : 'block';
    }

    showError(message) {
        console.error(message);

        // Try to use NetBox's toast notification system if available
        if (typeof htmx !== 'undefined' && htmx.trigger) {
            // NetBox uses htmx for toast notifications
            htmx.trigger(document.body, 'htmx:showToast', {
                message: message,
                level: 'danger'
            });
            return;
        }

        // Fallback: Create a Bootstrap toast if available
        const toastContainer = document.querySelector('.toast-container') ||
            this.createToastContainer();

        const toastEl = document.createElement('div');
        toastEl.className = 'toast align-items-center text-bg-danger border-0';
        toastEl.setAttribute('role', 'alert');
        toastEl.setAttribute('aria-live', 'assertive');
        toastEl.setAttribute('aria-atomic', 'true');
        toastEl.innerHTML = `
            <div class="d-flex">
                <div class="toast-body">${this.escapeHtml(message)}</div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto"
                        data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
        `;

        toastContainer.appendChild(toastEl);

        // Try Bootstrap Toast API, fallback to manual show/hide
        const Toast = window.bootstrap?.Toast || globalThis.bootstrap?.Toast;
        if (Toast) {
            new Toast(toastEl, { autohide: true, delay: 5000 }).show();
        } else {
            toastEl.classList.add('show');
            setTimeout(() => toastEl.remove(), 5000);
        }
    }

    createToastContainer() {
        const container = document.createElement('div');
        container.className = 'toast-container position-fixed top-0 end-0 p-3';
        container.style.zIndex = '1100';
        document.body.appendChild(container);
        return container;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    setZoom(level) {
        this.zoom = Math.max(0.5, Math.min(2, level));
        document.getElementById('zoom-reset').innerHTML =
            `<i class="mdi mdi-magnify"></i> ${Math.round(this.zoom * 100)}%`;
        this.applyZoom();
    }

    applyZoom() {
        const scroll = document.getElementById('patcher-scroll');
        scroll.style.transform = '';
        scroll.style.transformOrigin = '';
        const w = parseFloat(this.svg.getAttribute('width')) || 800;
        const h = parseFloat(this.svg.getAttribute('height')) || 600;
        this.svg.setAttribute('viewBox', `0 0 ${w / this.zoom} ${h / this.zoom}`);
        this.svg.style.width = w + 'px';
        this.svg.style.height = h + 'px';
    }
}

// Export for use
window.CablePatcher = CablePatcher;
