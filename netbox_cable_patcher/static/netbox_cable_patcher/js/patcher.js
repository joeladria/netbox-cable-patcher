/**
 * Cable Patcher - Interactive SVG-based patch bay visualization
 * Left/Right device panel model: user independently adds devices to left or right.
 * Left devices render with ports on the right edge; right devices with ports on the left edge.
 */

class CablePatcher {
    constructor(options) {
        this.container = options.container;
        this.svg = options.svg;
        this.csrfToken = options.csrfToken;
        this.apiBase = 'api/';

        // Location data (sites → locations → racks)
        this.locations = [];

        // All devices available for the current site/location/rack filter
        this.availableDevices = [];

        // Left/right panel device ID lists (user-curated)
        this.leftDeviceIds = [];
        this.rightDeviceIds = [];

        // Cables for the currently visible devices
        this.cables = [];

        this.currentMode = 'network';
        this.zoom = 1;
        this.selectedCable = null;
        this.selectedCables = [];
        this.pendingConnection = null;

        // Drag state for device reordering within a column
        this.draggingDevice = null;

        // Track device positions for drag-reorder
        this._leftDevicePositions = [];
        this._rightDevicePositions = [];

        // SVG layers
        this.cablesLayer = document.getElementById('cables-layer');
        this.devicesLayer = document.getElementById('devices-layer');
        this.tempCableLayer = document.getElementById('temp-cable-layer');

        // Layout constants
        this.DEVICE_WIDTH = 220;
        this.DEVICE_HEADER_HEIGHT = 40;
        this.PORT_HEIGHT = 28;
        this.PORT_RADIUS = 10;
        this.DEVICE_PADDING = 12;
        this.DEVICE_GAP = 30;
        this.LEFT_X = 20;
        this.CENTER_GAP = 160; // horizontal space between left column's right edge and right column's left edge

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

        // MDI icon paths (24x24 viewBox) for each port type
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

        // Cable colors by type
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

    readUrlState() {
        const params = new URLSearchParams(window.location.search);
        return {
            site: params.get('site') || '',
            location: params.get('location') || '',
            rack: params.get('rack') || '',
            mode: params.get('mode') || '',
            left: params.get('left') || '',
            right: params.get('right') || ''
        };
    }

    pushUrlState() {
        const params = new URLSearchParams();
        const site = document.getElementById('site-select').value;
        const location = document.getElementById('location-select').value;
        const rack = document.getElementById('rack-select').value;
        const mode = this.currentMode;

        if (site) params.set('site', site);
        if (location) params.set('location', location);
        if (rack) params.set('rack', rack);
        if (mode && mode !== 'network') params.set('mode', mode);
        if (this.leftDeviceIds.length > 0) params.set('left', this.leftDeviceIds.join(','));
        if (this.rightDeviceIds.length > 0) params.set('right', this.rightDeviceIds.join(','));

        const qs = params.toString();
        const newUrl = window.location.pathname + (qs ? '?' + qs : '');
        window.history.replaceState(null, '', newUrl);
    }

    async restoreFromUrl() {
        const state = this.readUrlState();
        if (!state.site) return;

        // Restore mode
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

        // Set location and populate its racks
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

        // Load available devices pool
        const loadParams = {};
        if (state.rack) loadParams.rack = state.rack;
        else if (state.location) loadParams.location = state.location;
        else loadParams.site = state.site;

        await this.loadAvailableDevices(loadParams);

        // Restore left/right device selections
        if (state.left) {
            const leftIds = state.left.split(',').map(Number).filter(Boolean);
            for (const id of leftIds) {
                if (this.availableDevices.some(d => d.id === id) && !this.leftDeviceIds.includes(id)) {
                    this.leftDeviceIds.push(id);
                }
            }
        }
        if (state.right) {
            const rightIds = state.right.split(',').map(Number).filter(Boolean);
            for (const id of rightIds) {
                if (this.availableDevices.some(d => d.id === id) && !this.rightDeviceIds.includes(id)) {
                    this.rightDeviceIds.push(id);
                }
            }
        }

        this.renderChips();
        await this.loadCablesAndRender();
    }

    setSelectValue(selectId, value) {
        const el = document.getElementById(selectId);
        if (!el) return;
        if (el.tomselect) {
            el.tomselect.setValue(value, true);
        } else {
            el.value = value;
        }
    }

    // ========== Event Listeners ==========

    setupEventListeners() {
        const addListener = (id, event, handler) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener(event, handler);
        };

        // Location cascade
        addListener('site-select', 'change', (e) => this.onSiteChange(e));
        addListener('location-select', 'change', (e) => this.onLocationChange(e));
        addListener('rack-select', 'change', (e) => this.onRackChange(e));

        // Left/right device selects — auto-add on selection change
        addListener('left-device-select', 'change', () => this.onAddDevice('left'));
        addListener('right-device-select', 'change', () => this.onAddDevice('right'));

        // Add-all buttons
        addListener('add-all-left-btn', 'click', () => this.onAddAllDevices('left'));
        addListener('add-all-right-btn', 'click', () => this.onAddAllDevices('right'));

        // Clear all devices
        addListener('clear-all-btn', 'click', () => this.clearAllDevices());

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
        addListener('create-cable-btn', 'click', () => this.createCable());

        // Modal dismiss
        document.querySelectorAll('[data-bs-dismiss="modal"]').forEach(btn => {
            btn.addEventListener('click', () => {
                const modal = btn.closest('.modal');
                if (modal) this.hideModal(modal.id);
            });
        });

        // SVG events
        if (this.svg) {
            this.svg.addEventListener('mousemove', (e) => {
                this.onSvgMouseMove(e);
                this.onDeviceDrag(e);
            });
            this.svg.addEventListener('click', (e) => this.onSvgClick(e));
            this.svg.addEventListener('mouseup', (e) => this.onDeviceDragEnd(e));
            this.svg.addEventListener('mouseleave', (e) => this.onDeviceDragEnd(e));
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.cancelPendingConnection();
                this.closeCablePanel();
            }
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
                if (this.selectedCables && this.selectedCables.length > 0) {
                    e.preventDefault();
                    this.deleteSelectedCables();
                } else if (this.selectedCable) {
                    e.preventDefault();
                    this.deleteSelectedCable();
                }
            }
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
            headers: { 'Accept': 'application/json' }
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
            headers: { 'X-CSRFToken': this.csrfToken }
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
            this.locations = Array.isArray(resp) ? resp : (resp?.results || []);
            this.populateSiteSelect();
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

    populateSelect(selectId, options, placeholder = 'Select...', disabled = false) {
        const select = document.getElementById(selectId);
        if (!select) return;
        const ts = select.tomselect;
        if (ts) {
            ts.clear();
            ts.clearOptions();
            ts.addOption({ value: '', text: placeholder });
            options.forEach(opt => ts.addOption({ value: opt.value, text: opt.text }));
            ts.refreshOptions(false);
            disabled ? ts.disable() : ts.enable();
        } else {
            select.innerHTML = '';
            select.add(new Option(placeholder, ''));
            options.forEach(opt => select.add(new Option(opt.text, opt.value)));
            select.disabled = disabled;
        }
    }

    /**
     * Load the pool of devices available for the current site/location/rack filter.
     * Populates both left/right device dropdowns but does NOT change left/right selections.
     */
    async loadAvailableDevices(params) {
        this.showLoading(true);
        try {
            const qp = new URLSearchParams();
            if (params.rack) qp.set('rack', params.rack);
            else if (params.location) qp.set('location', params.location);
            else if (params.site) qp.set('site', params.site);

            const devicesResponse = await this.apiGet('devices/?' + qp.toString());
            this.availableDevices = devicesResponse || [];

            // Populate both device dropdowns
            const options = this.availableDevices.map(d => ({ value: d.id, text: d.name }));
            this.populateSelect('left-device-select', options, 'Select device to add...', options.length === 0);
            this.populateSelect('right-device-select', options, 'Select device to add...', options.length === 0);

            // Enable/disable add-all buttons
            const hasDevices = options.length > 0;
            const addAllLeftBtn = document.getElementById('add-all-left-btn');
            const addAllRightBtn = document.getElementById('add-all-right-btn');
            if (addAllLeftBtn) addAllLeftBtn.disabled = !hasDevices;
            if (addAllRightBtn) addAllRightBtn.disabled = !hasDevices;

        } catch (error) {
            console.error('Failed to load devices:', error);
            this.showError('Failed to load devices');
        } finally {
            this.showLoading(false);
        }
    }

    /**
     * Fetch cables for all currently visible (left + right) devices and re-render.
     */
    async loadCablesAndRender() {
        const allIds = [...new Set([...this.leftDeviceIds, ...this.rightDeviceIds])];
        if (allIds.length === 0) {
            this.cables = [];
            this.render();
            return;
        }

        try {
            const parts = allIds.map(id => 'device_ids[]=' + id).join('&');
            const cablesResponse = await this.apiGet('cables/?' + parts);
            this.cables = cablesResponse || [];
        } catch (error) {
            console.error('Failed to load cables:', error);
            this.cables = [];
        }

        this.render();
    }

    // ========== Event Handlers ==========

    onSiteChange(e) {
        const siteId = e.target.value;

        // Reset dependent dropdowns
        this.populateSelect('location-select', [], 'Select Location...', true);
        this.populateSelect('rack-select', [], 'Select Rack...', true);

        // Clear device panels
        this.availableDevices = [];
        this.leftDeviceIds = [];
        this.rightDeviceIds = [];
        this.renderChips();
        this.cables = [];
        this.render();

        if (!siteId) {
            this.populateSelect('left-device-select', [], 'Select device to add...', true);
            this.populateSelect('right-device-select', [], 'Select device to add...', true);
            const addAllLeftBtn = document.getElementById('add-all-left-btn');
            const addAllRightBtn = document.getElementById('add-all-right-btn');
            if (addAllLeftBtn) addAllLeftBtn.disabled = true;
            if (addAllRightBtn) addAllRightBtn.disabled = true;
            this.pushUrlState();
            return;
        }

        const site = this.locations.find(s => s.id == siteId);
        if (!site) return;

        if (site.locations.length > 0) {
            const locOptions = site.locations.map(l => ({ value: l.id, text: l.name }));
            this.populateSelect('location-select', locOptions, 'Select Location...', false);
        }

        if (site.racks.length > 0 || site.locations.length === 0) {
            const rackOptions = site.racks.map(r => ({ value: r.id, text: r.name }));
            this.populateSelect('rack-select', rackOptions, 'Select Rack...', false);
        }

        this.loadAvailableDevices({ site: siteId });
        this.pushUrlState();
    }

    onLocationChange(e) {
        const locationId = e.target.value;
        const siteId = document.getElementById('site-select').value;

        this.populateSelect('rack-select', [], 'Select Rack...', true);

        if (!locationId) {
            if (siteId) this.loadAvailableDevices({ site: siteId });
            this.pushUrlState();
            return;
        }

        const site = this.locations.find(s => s.id == siteId);
        const location = site?.locations.find(l => l.id == locationId);

        if (location && location.racks.length > 0) {
            const rackOptions = location.racks.map(r => ({ value: r.id, text: r.name }));
            this.populateSelect('rack-select', rackOptions, 'Select Rack...', false);
        }

        this.loadAvailableDevices({ location: locationId });
        this.pushUrlState();
    }

    onRackChange(e) {
        const rackId = e.target.value;

        if (!rackId) {
            const locationId = document.getElementById('location-select').value;
            const siteId = document.getElementById('site-select').value;
            if (locationId) this.loadAvailableDevices({ location: locationId });
            else if (siteId) this.loadAvailableDevices({ site: siteId });
            this.pushUrlState();
            return;
        }

        this.loadAvailableDevices({ rack: rackId });
        this.pushUrlState();
    }

    async onAddDevice(side) {
        const selectId = side === 'left' ? 'left-device-select' : 'right-device-select';
        const select = document.getElementById(selectId);
        if (!select || !select.value) return;

        const deviceId = parseInt(select.value);
        if (!deviceId) return;

        const idList = side === 'left' ? this.leftDeviceIds : this.rightDeviceIds;
        const otherList = side === 'left' ? this.rightDeviceIds : this.leftDeviceIds;

        // Don't add duplicates (device can't be on both sides)
        if (idList.includes(deviceId)) return;
        if (otherList.includes(deviceId)) {
            this.showError('This device is already on the other side. Remove it first.');
            return;
        }

        idList.push(deviceId);

        this.renderChips();
        await this.loadCablesAndRender();
        this.pushUrlState();

        // Keep the dropdown open so the user can keep adding devices without re-clicking
        const ts = select.tomselect;
        if (ts) {
            ts.clear(true); // silent clear — does not fire the change event
            ts.open();
        }
    }

    async onAddAllDevices(side) {
        const usedIds = new Set([...this.leftDeviceIds, ...this.rightDeviceIds]);
        const idList = side === 'left' ? this.leftDeviceIds : this.rightDeviceIds;

        const toAdd = this.availableDevices.filter(d => !usedIds.has(d.id));
        if (toAdd.length === 0) return;

        toAdd.forEach(d => idList.push(d.id));

        this.renderChips();
        await this.loadCablesAndRender();
        this.pushUrlState();
    }

    clearAllDevices() {
        if (this.leftDeviceIds.length === 0 && this.rightDeviceIds.length === 0) return;
        this.leftDeviceIds = [];
        this.rightDeviceIds = [];
        this.cables = [];
        this.renderChips();
        this.render();
        this.pushUrlState();
    }

    onRemoveDevice(side, deviceId) {
        if (side === 'left') {
            this.leftDeviceIds = this.leftDeviceIds.filter(id => id !== deviceId);
        } else {
            this.rightDeviceIds = this.rightDeviceIds.filter(id => id !== deviceId);
        }

        this.renderChips();
        this.loadCablesAndRender();
        this.pushUrlState();
    }

    onModeChange(e) {
        this.currentMode = e.target.value;
        this.render();
        this.pushUrlState();
    }

    // ========== Device Chips UI ==========

    renderChips() {
        this._renderChipList('left', this.leftDeviceIds, document.getElementById('left-device-chips'));
        this._renderChipList('right', this.rightDeviceIds, document.getElementById('right-device-chips'));
        this._refreshDeviceDropdowns();
    }

    /**
     * Surgically remove/restore options in both device dropdowns based on which
     * devices are already placed on either side — without closing TomSelect.
     */
    _refreshDeviceDropdowns() {
        const usedIds = new Set([...this.leftDeviceIds, ...this.rightDeviceIds]);

        ['left-device-select', 'right-device-select'].forEach(selectId => {
            const select = document.getElementById(selectId);
            if (!select) return;

            const ts = select.tomselect;
            if (ts) {
                // TomSelect: add back any devices that are no longer used,
                // remove any devices that are now used — without clearing all options.
                this.availableDevices.forEach(d => {
                    if (usedIds.has(d.id)) {
                        ts.removeOption(String(d.id));
                    } else {
                        // addOption is a no-op if the option already exists
                        ts.addOption({ value: d.id, text: d.name });
                    }
                });
                ts.refreshOptions(false);
            } else {
                // Native <select>: update disabled attribute per option
                Array.from(select.options).forEach(opt => {
                    if (!opt.value) return; // skip placeholder
                    const id = parseInt(opt.value);
                    opt.disabled = usedIds.has(id);
                    opt.hidden = usedIds.has(id);
                });
                // Disable the whole select if nothing is available
                const anyAvailable = this.availableDevices.some(d => !usedIds.has(d.id));
                select.disabled = !anyAvailable;
            }
        });
    }

    _renderChipList(side, deviceIds, container) {
        if (!container) return;
        container.innerHTML = '';
        deviceIds.forEach(id => {
            const device = this.availableDevices.find(d => d.id === id);
            if (!device) return;

            const chip = document.createElement('span');
            chip.className = 'device-chip device-chip--' + side;
            chip.title = device.name;

            const nameSpan = document.createElement('span');
            nameSpan.className = 'device-chip__name';
            nameSpan.textContent = device.name;

            const removeBtn = document.createElement('button');
            removeBtn.className = 'device-chip__remove';
            removeBtn.type = 'button';
            removeBtn.setAttribute('aria-label', 'Remove ' + device.name);
            removeBtn.innerHTML = '&times;';
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.onRemoveDevice(side, id);
            });

            chip.appendChild(nameSpan);
            chip.appendChild(removeBtn);
            container.appendChild(chip);
        });
    }

    // ========== Rendering ==========

    render() {
        const totalVisible = this.leftDeviceIds.length + this.rightDeviceIds.length;

        if (totalVisible === 0) {
            this.showEmpty();
            return;
        }

        this.showEmpty(false);

        // Clear layers
        this.cablesLayer.innerHTML = '';
        this.devicesLayer.innerHTML = '';
        this.tempCableLayer.innerHTML = '';

        const portTypes = this.getPortTypesForMode();
        this.portPositions = {};

        // Right column X = left column's right edge + CENTER_GAP
        const RIGHT_X = this.LEFT_X + this.DEVICE_WIDTH + this.CENTER_GAP;

        let maxHeight = 0;

        // Render left devices (ports on right edge)
        this._leftDevicePositions = [];
        let leftY = 20;
        this.leftDeviceIds.forEach(id => {
            const device = this.availableDevices.find(d => d.id === id);
            if (!device) return;
            const height = this.renderDevice(device, this.LEFT_X, leftY, 'left', portTypes);
            this._leftDevicePositions.push({ device, y: leftY, height });
            leftY += height + this.DEVICE_GAP;
            maxHeight = Math.max(maxHeight, leftY);
        });

        // Render right devices (ports on left edge)
        this._rightDevicePositions = [];
        let rightY = 20;
        this.rightDeviceIds.forEach(id => {
            const device = this.availableDevices.find(d => d.id === id);
            if (!device) return;
            const height = this.renderDevice(device, RIGHT_X, rightY, 'right', portTypes);
            this._rightDevicePositions.push({ device, y: rightY, height });
            rightY += height + this.DEVICE_GAP;
            maxHeight = Math.max(maxHeight, rightY);
        });

        // Update SVG size
        const totalWidth = RIGHT_X + this.DEVICE_WIDTH + 40;
        this.svg.setAttribute('width', totalWidth);
        this.svg.setAttribute('height', maxHeight + 50);

        // Render cables
        this.renderCables();

        // Apply zoom
        this.applyZoom();
    }

    getPortTypesForMode() {
        switch (this.currentMode) {
            case 'network': return ['interfaces'];
            case 'power': return ['power_ports', 'power_outlets'];
            case 'console': return ['console_ports', 'console_server_ports'];
            default: return ['interfaces'];
        }
    }

    /**
     * Render a device card at position (x, y).
     * side: 'left' → port connector dot on right edge of card
     *       'right' → port connector dot on left edge of card
     */
    renderDevice(device, x, y, side, portTypes) {
        const isLeft = side === 'left';

        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('class', 'device device--' + side);
        g.setAttribute('data-device-id', device.id);

        // Collect ports — exclude virtual interfaces (no physical connector)
        let ports = [];
        portTypes.forEach(type => {
            (device[type] || []).forEach(p => {
                if (type === 'interfaces') {
                    const typeVal = (typeof p.type === 'object' ? p.type?.value : p.type || '').toLowerCase();
                    if (typeVal === 'virtual' || typeVal === 'lag' || typeVal === 'bridge') return;
                }
                ports.push({ ...p, _portType: type });
            });
        });

        const rowCount = ports.length;
        const deviceHeight = this.DEVICE_HEADER_HEIGHT + (rowCount * this.PORT_HEIGHT) + this.DEVICE_PADDING;

        // Device background
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', x);
        rect.setAttribute('y', y);
        rect.setAttribute('width', this.DEVICE_WIDTH);
        rect.setAttribute('height', deviceHeight);
        rect.setAttribute('rx', 8);
        rect.setAttribute('class', 'device-box device-box--' + side);
        g.appendChild(rect);

        // Device header background
        const headerBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        headerBg.setAttribute('x', x);
        headerBg.setAttribute('y', y);
        headerBg.setAttribute('width', this.DEVICE_WIDTH);
        headerBg.setAttribute('height', this.DEVICE_HEADER_HEIGHT);
        headerBg.setAttribute('rx', 8);
        headerBg.setAttribute('class', 'device-header device-header--' + side);
        g.appendChild(headerBg);

        // Cover bottom corners of header
        const headerCover = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        headerCover.setAttribute('x', x);
        headerCover.setAttribute('y', y + this.DEVICE_HEADER_HEIGHT - 8);
        headerCover.setAttribute('width', this.DEVICE_WIDTH);
        headerCover.setAttribute('height', 8);
        headerCover.setAttribute('class', 'device-header device-header--' + side);
        g.appendChild(headerCover);

        // Device name
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', x + this.DEVICE_WIDTH / 2);
        text.setAttribute('y', y + 25);
        text.setAttribute('class', 'device-name');
        text.textContent = device.name;
        g.appendChild(text);

        // Double-click header to open device in NetBox
        const onDblClick = (e) => {
            e.stopPropagation();
            window.open('/dcim/devices/' + device.id + '/', '_blank');
        };
        headerBg.addEventListener('dblclick', onDblClick);
        headerCover.addEventListener('dblclick', onDblClick);

        // Drag handle on header for reordering within column
        headerBg.style.cursor = 'grab';
        headerCover.style.cursor = 'grab';

        const onDragStart = (e) => {
            const svgPt = this.svgPoint(e);
            if (!svgPt) return;
            this.draggingDevice = {
                deviceId: device.id,
                side: side,
                group: g,
                startY: svgPt.y,
                moved: false
            };
            this.container.classList.add('dragging-device');
            headerBg.style.cursor = 'grabbing';
            headerCover.style.cursor = 'grabbing';
            e.preventDefault();
        };
        headerBg.addEventListener('mousedown', onDragStart);
        headerCover.addEventListener('mousedown', onDragStart);

        // Port connector dot X position: right edge for left devices, left edge for right devices
        const portX = isLeft
            ? x + this.DEVICE_WIDTH - this.DEVICE_PADDING
            : x + this.DEVICE_PADDING;

        ports.forEach((port, index) => {
            const portY = y + this.DEVICE_HEADER_HEIGHT + (index * this.PORT_HEIGHT) + this.PORT_HEIGHT / 2;

            // Store port position for cable routing
            const portKey = `${port.port_type}-${port.id}`;
            this.portPositions[portKey] = { x: portX, y: portY, device, port, side };

            // Port circle
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', portX);
            circle.setAttribute('cy', portY);
            circle.setAttribute('r', this.PORT_RADIUS);
            circle.setAttribute('class', 'port' + (port.cable_id ? ' connected' : ''));
            circle.setAttribute('data-port-type', port.port_type);
            circle.setAttribute('data-port-id', port.id);
            circle.setAttribute('data-device-id', device.id);

            const color = this.PORT_COLORS[port.port_type] || this.PORT_COLORS.default;
            circle.style.fill = port.cable_id ? color : '#fff';
            circle.style.stroke = color;

            circle.addEventListener('mouseenter', (e) => this.onPortHover(e, port, device));
            circle.addEventListener('mouseleave', () => this.hideTooltip());
            circle.addEventListener('click', (e) => this.onPortClick(e, port, device));
            circle.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                if (this.pendingConnection) {
                    this.cancelPendingConnection();
                }
                const url = this.getPortUrl(port);
                if (url) window.open(url, '_blank');
            });

            g.appendChild(circle);

            // Port type icon inside the circle
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
                if (port.cable_id) icon.style.opacity = '0.6';
                g.appendChild(icon);
            }

            // Port label — on the inner side of the port dot
            const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            // Left device: label to the left of the dot; Right device: label to the right
            const labelX = isLeft
                ? portX - this.PORT_RADIUS - 5
                : portX + this.PORT_RADIUS + 5;
            label.setAttribute('x', labelX);
            label.setAttribute('y', portY + 4);
            label.setAttribute('class', 'port-label' + (port.cable_id ? ' port-label--connected' : ''));
            label.setAttribute('text-anchor', isLeft ? 'end' : 'start');
            label.textContent = port.untagged_vlan_vid
                ? `${port.name} (V${port.untagged_vlan_vid})`
                : port.name;
            g.appendChild(label);
        });

        this.devicesLayer.appendChild(g);
        return deviceHeight;
    }

    renderCables() {
        this.cables.forEach(cable => this.renderCable(cable));
    }

    renderCable(cable) {
        const aTerms = cable.a_terminations || [];
        const bTerms = cable.b_terminations || [];
        if (aTerms.length === 0 || bTerms.length === 0) return;

        const aTerm = aTerms[0];
        const bTerm = bTerms[0];
        const aKey = `${aTerm.type}-${aTerm.id}`;
        const bKey = `${bTerm.type}-${bTerm.id}`;
        const aPos = this.portPositions[aKey];
        const bPos = this.portPositions[bKey];

        let color = cable.color || this.CABLE_COLORS[cable.type] || this.CABLE_COLORS.default;
        if (color && !color.startsWith('#')) color = '#' + color;

        // Neither endpoint is on the canvas — nothing to show
        if (!aPos && !bPos) return;

        // Both endpoints on canvas but same side → draw stubs from each
        if (aPos && bPos && aPos.side === bPos.side) {
            this.renderStub(aPos, color, cable);
            this.renderStub(bPos, color, cable);
            return;
        }

        // Only one endpoint on canvas → draw a stub from the visible one
        if (!aPos || !bPos) {
            const visiblePos = aPos || bPos;
            this.renderStub(visiblePos, color, cable);
            return;
        }

        // Normal case: both endpoints on opposite sides → draw bezier cable
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const d = this.calculateCablePath(aPos.x, aPos.y, bPos.x, bPos.y);
        path.setAttribute('d', d);
        path.setAttribute('class', 'cable');
        path.setAttribute('data-cable-id', cable.id);

        path.style.stroke = color;

        if (cable.status === 'planned') path.classList.add('planned');
        else if (cable.status === 'decommissioning') path.classList.add('decommissioning');

        path.addEventListener('click', (e) => {
            e.stopPropagation();
            this.selectCable(cable, e);
        });

        this.cablesLayer.appendChild(path);
    }

    /**
     * Render a short dotted stub arrow extending outward from a port,
     * used when a cable's other endpoint is off-screen or on the same side.
     * Left-side ports stub extends rightward; right-side ports stub extends leftward.
     */
    renderStub(pos, color, cable) {
        const STUB_LENGTH = 38;
        const ARROW_SIZE = 6;

        // Direction: left-side ports point right (+1), right-side ports point left (-1)
        const dir = pos.side === 'left' ? 1 : -1;

        const x1 = pos.x;
        const y1 = pos.y;
        const x2 = pos.x + dir * STUB_LENGTH;
        const y2 = pos.y;

        // Dotted line
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', x1);
        line.setAttribute('y1', y1);
        line.setAttribute('x2', x2);
        line.setAttribute('y2', y2);
        line.setAttribute('class', 'cable-stub');
        line.style.stroke = color;

        // Arrowhead pointing in stub direction
        // Triangle tip at x2, base at x2 - dir*ARROW_SIZE
        const ax = x2;
        const ay = y2;
        const points = [
            `${ax},${ay}`,
            `${ax - dir * ARROW_SIZE},${ay - ARROW_SIZE / 2}`,
            `${ax - dir * ARROW_SIZE},${ay + ARROW_SIZE / 2}`
        ].join(' ');

        const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        arrow.setAttribute('points', points);
        arrow.setAttribute('class', 'cable-stub-arrow');
        arrow.style.fill = color;

        this.cablesLayer.appendChild(line);
        this.cablesLayer.appendChild(arrow);
    }

    calculateCablePath(x1, y1, x2, y2) {
        const dx = Math.abs(x2 - x1);
        const controlOffset = Math.min(dx * 0.5, 150);
        const cp1x = x1 + (x1 < x2 ? controlOffset : -controlOffset);
        const cp2x = x2 + (x2 < x1 ? controlOffset : -controlOffset);
        return `M ${x1} ${y1} C ${cp1x} ${y1}, ${cp2x} ${y2}, ${x2} ${y2}`;
    }

    getPortUrl(port) {
        const map = {
            Interface: 'interfaces',
            ConsolePort: 'console-ports',
            ConsoleServerPort: 'console-server-ports',
            PowerPort: 'power-ports',
            PowerOutlet: 'power-outlets',
            FrontPort: 'front-ports',
            RearPort: 'rear-ports',
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
        connection.innerHTML = '';

        if (port.connected_endpoint) {
            const ep = port.connected_endpoint;
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

        if (port.cable_id) {
            const cable = this.cables.find(c => c.id === port.cable_id);
            if (cable) this.selectCable(cable, e);
            return;
        }

        if (!this.pendingConnection) {
            this.startConnection(port, device);
            return;
        }

        this.completeConnection(port, device);
    }

    startConnection(port, device) {
        this.pendingConnection = { port, device, type: port.port_type };

        const portElement = document.querySelector(
            `circle[data-port-type="${port.port_type}"][data-port-id="${port.id}"]`
        );
        if (portElement) portElement.classList.add('connecting');
        this.container.classList.add('connecting-mode');
    }

    completeConnection(port, device) {
        if (port.id === this.pendingConnection.port.id &&
            port.port_type === this.pendingConnection.type) {
            this.cancelPendingConnection();
            return;
        }

        const from = this.pendingConnection;
        const to = { port, device };

        document.getElementById('cable-from-input').value =
            `${from.device.name} - ${from.port.name}`;
        document.getElementById('cable-to-input').value =
            `${to.device.name} - ${to.port.name}`;

        this._pendingCableData = {
            a_termination_type: from.type,
            a_termination_id: from.port.id,
            b_termination_type: to.port.port_type,
            b_termination_id: to.port.id
        };

        const defaultTypes = { network: 'cat6', power: 'power', console: 'cat5e' };
        const typeSelect = document.getElementById('cable-type-select');
        if (typeSelect && defaultTypes[this.currentMode]) {
            typeSelect.value = defaultTypes[this.currentMode];
        }

        this.showModal('create-cable-modal');
        this.cancelPendingConnection();
    }

    showModal(modalId) {
        const modalEl = document.getElementById(modalId);
        if (!modalEl) return;
        const Modal = window.bootstrap?.Modal || globalThis.bootstrap?.Modal;
        if (Modal) {
            Modal.getOrCreateInstance(modalEl).show();
            return;
        }
        modalEl.style.display = 'block';
        modalEl.classList.add('show');
        modalEl.setAttribute('aria-modal', 'true');
        modalEl.removeAttribute('aria-hidden');
        let backdrop = document.querySelector('.modal-backdrop');
        if (!backdrop) {
            backdrop = document.createElement('div');
            backdrop.className = 'modal-backdrop fade show';
            document.body.appendChild(backdrop);
        }
        document.body.classList.add('modal-open');
    }

    hideModal(modalId) {
        const modalEl = document.getElementById(modalId);
        if (!modalEl) return;
        const Modal = window.bootstrap?.Modal || globalThis.bootstrap?.Modal;
        if (Modal) {
            Modal.getInstance(modalEl)?.hide();
            return;
        }
        modalEl.style.display = 'none';
        modalEl.classList.remove('show');
        modalEl.setAttribute('aria-hidden', 'true');
        modalEl.removeAttribute('aria-modal');
        const backdrop = document.querySelector('.modal-backdrop');
        if (backdrop) backdrop.remove();
        document.body.classList.remove('modal-open');
    }

    cancelPendingConnection() {
        if (!this.pendingConnection) return;
        const portElement = document.querySelector(
            `circle[data-port-type="${this.pendingConnection.type}"][data-port-id="${this.pendingConnection.port.id}"]`
        );
        if (portElement) portElement.classList.remove('connecting');
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
        const startKey = `${this.pendingConnection.type}-${this.pendingConnection.port.id}`;
        const startPos = this.portPositions[startKey];
        if (!startPos) return;
        this.tempCableLayer.innerHTML = '';
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const d = this.calculateCablePath(startPos.x, startPos.y, svgPoint.x, svgPoint.y);
        path.setAttribute('d', d);
        path.setAttribute('class', 'cable temp-cable');
        this.tempCableLayer.appendChild(path);
    }

    onSvgClick(e) {
        if (this.pendingConnection && e.target === this.svg) {
            this.cancelPendingConnection();
        }
    }

    // ========== Device Drag-to-Reorder ==========

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
        if (Math.abs(dy) < 5 && !this.draggingDevice.moved) return;
        this.draggingDevice.moved = true;
        const g = this.draggingDevice.group;
        g.setAttribute('transform', `translate(0, ${dy})`);
        g.style.opacity = '0.7';
    }

    onDeviceDragEnd(e) {
        if (!this.draggingDevice) return;
        const drag = this.draggingDevice;
        this.draggingDevice = null;
        this.container.classList.remove('dragging-device');
        drag.group.removeAttribute('transform');
        drag.group.style.opacity = '';
        if (!drag.moved) return;

        const svgPt = this.svgPoint(e);
        if (!svgPt) { this.render(); return; }

        const positions = drag.side === 'left' ? this._leftDevicePositions : this._rightDevicePositions;
        const idList = drag.side === 'left' ? this.leftDeviceIds : this.rightDeviceIds;
        if (positions.length === 0) return;

        const draggedIdx = positions.findIndex(p => p.device.id === drag.deviceId);
        if (draggedIdx === -1) return;

        const draggedPos = positions[draggedIdx];
        const draggedCenter = draggedPos.y + draggedPos.height / 2 + (svgPt.y - drag.startY);

        let targetIdx = positions.length;
        for (let i = 0; i < positions.length; i++) {
            const mid = positions[i].y + positions[i].height / 2;
            if (draggedCenter < mid) { targetIdx = i; break; }
        }

        const orderedIds = [...idList];
        const [removed] = orderedIds.splice(draggedIdx, 1);
        if (targetIdx > draggedIdx) targetIdx--;
        orderedIds.splice(targetIdx, 0, removed);

        if (drag.side === 'left') this.leftDeviceIds = orderedIds;
        else this.rightDeviceIds = orderedIds;

        this.renderChips();
        this.render();
        this.pushUrlState();
    }

    // ========== Cable Management ==========

    selectCable(cable, event) {
        const isMulti = event && (event.ctrlKey || event.metaKey);

        if (isMulti) {
            const idx = this.selectedCables.findIndex(c => c.id === cable.id);
            if (idx !== -1) {
                this.selectedCables.splice(idx, 1);
                const p = document.querySelector(`path[data-cable-id="${cable.id}"]`);
                if (p) p.classList.remove('selected');
            } else {
                this.selectedCables.push(cable);
                const p = document.querySelector(`path[data-cable-id="${cable.id}"]`);
                if (p) p.classList.add('selected');
            }
            if (this.selectedCable && !this.selectedCables.find(c => c.id === this.selectedCable.id)) {
                this.selectedCables.push(this.selectedCable);
            }
            this.selectedCable = null;
        } else {
            this.clearCableSelection();
            this.selectedCable = cable;
            this.selectedCables = [];
            const path = document.querySelector(`path[data-cable-id="${cable.id}"]`);
            if (path) path.classList.add('selected');
        }

        this.updateCableInfoPanel();
    }

    updateCableInfoPanel() {
        const panel = document.getElementById('cable-info-panel');
        const multiInfo = document.getElementById('cable-multi-info');
        const multiCount = document.getElementById('cable-multi-count');

        if (this.selectedCables.length > 1) {
            document.getElementById('cable-from').textContent = '-';
            document.getElementById('cable-to').textContent = '-';
            document.getElementById('cable-type').textContent = '-';
            document.getElementById('cable-status').textContent = '-';
            document.getElementById('cable-netbox-link').style.display = 'none';
            multiInfo.style.display = 'block';
            multiCount.textContent = `${this.selectedCables.length} cables selected`;
            panel.style.display = 'block';
        } else {
            const cable = this.selectedCable || (this.selectedCables.length === 1 ? this.selectedCables[0] : null);
            if (!cable) { panel.style.display = 'none'; return; }

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
        if (!this._pendingCableData) return;

        const cableType = document.getElementById('cable-type-select').value;
        const color = document.getElementById('cable-color-input').value.replace('#', '');
        const label = document.getElementById('cable-label-input').value;

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

        try {
            await this.apiPost('cables/', cableData);
            this.hideModal('create-cable-modal');
            document.getElementById('cable-type-select').value = '';
            document.getElementById('cable-color-input').value = '#000000';
            document.getElementById('cable-label-input').value = '';
            this._pendingCableData = null;
            await this.loadCablesAndRender();
        } catch (error) {
            alert('Failed to create cable: ' + error.message);
        }
    }

    async deleteSelectedCable() {
        if (this.selectedCables.length > 0) return this.deleteSelectedCables();
        if (!this.selectedCable) return;
        if (!confirm('Are you sure you want to delete this cable?')) return;
        try {
            await this.apiDelete(`cables/${this.selectedCable.id}/`);
            this.cables = this.cables.filter(c => c.id !== this.selectedCable.id);
            this.closeCablePanel();
            await this.loadCablesAndRender();
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
            await this.loadCablesAndRender();
        } catch (error) {
            alert('Failed to delete cables: ' + error.message);
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
        const Toast = window.bootstrap?.Toast || globalThis.bootstrap?.Toast;
        const toastContainer = document.querySelector('.toast-container') || this.createToastContainer();
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
