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
        this.pendingConnection = null;

        // SVG layers
        this.cablesLayer = document.getElementById('cables-layer');
        this.devicesLayer = document.getElementById('devices-layer');
        this.tempCableLayer = document.getElementById('temp-cable-layer');

        // Layout constants
        this.DEVICE_WIDTH = 200;
        this.DEVICE_HEADER_HEIGHT = 40;
        this.PORT_HEIGHT = 28;
        this.PORT_RADIUS = 8;
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
        addListener('create-cable-btn', 'click', () => this.createCable());

        // SVG events for cable drawing
        if (this.svg) {
            this.svg.addEventListener('mousemove', (e) => this.onSvgMouseMove(e));
            this.svg.addEventListener('click', (e) => this.onSvgClick(e));
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.cancelPendingConnection();
                this.closeCablePanel();
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

            this.populatePrimaryDeviceSelect();
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
            return;
        }

        const site = this.locations.find(s => s.id == siteId);
        const location = site?.locations.find(l => l.id == locationId);

        if (location && location.racks.length > 0) {
            const rackOptions = location.racks.map(r => ({ value: r.id, text: r.name }));
            this.populateSelect('rack-select', rackOptions, 'Select Rack...', false);
        }

        this.loadDevices({ location: locationId });
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
            return;
        }

        this.loadDevices({ rack: rackId });
    }

    onPrimaryDeviceChange(e) {
        this.primaryDeviceId = e.target.value ? parseInt(e.target.value) : null;
        this.render();
    }

    onModeChange(e) {
        this.currentMode = e.target.value;
        this.render();
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

        const otherDevices = this.devices.filter(d => d.id !== primaryDevice?.id);

        // Track port positions for cable routing
        this.portPositions = {};

        let maxHeight = 0;

        // Render primary device on left
        if (primaryDevice) {
            const height = this.renderDevice(primaryDevice, this.PRIMARY_X, 20, true, portTypes);
            maxHeight = Math.max(maxHeight, height);
        }

        // Render other devices on right
        let yOffset = 20;
        otherDevices.forEach(device => {
            const height = this.renderDevice(device, this.SECONDARY_X, yOffset, false, portTypes);
            yOffset += height + this.DEVICE_GAP;
            maxHeight = Math.max(maxHeight, yOffset);
        });

        // Update SVG size
        const totalWidth = this.SECONDARY_X + this.DEVICE_WIDTH + 100;
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
            case 'patch':
                return ['front_ports', 'rear_ports'];
            default:
                return ['interfaces'];
        }
    }

    renderDevice(device, x, y, isPrimary, portTypes) {
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

        // Render ports
        const portX = isPrimary ? x + this.DEVICE_WIDTH - this.DEVICE_PADDING : x + this.DEVICE_PADDING;

        ports.forEach((port, index) => {
            const portY = y + this.DEVICE_HEADER_HEIGHT + (index * this.PORT_HEIGHT) + this.PORT_HEIGHT / 2;

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

            g.appendChild(circle);

            // Port label
            const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            const labelX = isPrimary ? portX - this.PORT_RADIUS - 5 : portX + this.PORT_RADIUS + 5;
            label.setAttribute('x', labelX);
            label.setAttribute('y', portY + 4);
            label.setAttribute('class', 'port-label');
            label.setAttribute('text-anchor', isPrimary ? 'end' : 'start');
            label.textContent = port.name;
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

        // Click handler
        path.addEventListener('click', (e) => {
            e.stopPropagation();
            this.selectCable(cable);
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

    // ========== Port Interaction ==========

    onPortHover(e, port, device) {
        const tooltip = document.getElementById('port-tooltip');
        const portName = document.getElementById('tooltip-port-name');
        const portType = document.getElementById('tooltip-port-type');
        const connection = document.getElementById('tooltip-connection');

        portName.textContent = port.name;
        portType.textContent = port.type || port.port_type;

        if (port.connected_endpoint) {
            const ep = port.connected_endpoint;
            connection.innerHTML = `<span class="badge bg-success">Connected</span> to ${ep.device_name} - ${ep.name}`;
        } else {
            connection.innerHTML = '<span class="badge bg-secondary">Available</span>';
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

        // If port is already connected, select the cable
        if (port.cable_id) {
            const cable = this.cables.find(c => c.id === port.cable_id);
            if (cable) {
                this.selectCable(cable);
            }
            return;
        }

        // If no pending connection, start one
        if (!this.pendingConnection) {
            this.startConnection(port, device);
            return;
        }

        // If we have a pending connection, complete it
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

        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('create-cable-modal'));
        modal.show();

        this.cancelPendingConnection();
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

    // ========== Cable Management ==========

    selectCable(cable) {
        // Deselect previous
        if (this.selectedCable) {
            const prevPath = document.querySelector(`path[data-cable-id="${this.selectedCable.id}"]`);
            if (prevPath) prevPath.classList.remove('selected');
        }

        this.selectedCable = cable;

        // Highlight selected cable
        const path = document.querySelector(`path[data-cable-id="${cable.id}"]`);
        if (path) path.classList.add('selected');

        // Show cable info panel
        const panel = document.getElementById('cable-info-panel');
        const aTerms = cable.a_terminations || [];
        const bTerms = cable.b_terminations || [];

        document.getElementById('cable-from').textContent =
            aTerms.length > 0 ? `${aTerms[0].device_name} - ${aTerms[0].name}` : 'Unknown';
        document.getElementById('cable-to').textContent =
            bTerms.length > 0 ? `${bTerms[0].device_name} - ${bTerms[0].name}` : 'Unknown';
        document.getElementById('cable-type').textContent = cable.type_display || cable.type || '-';
        document.getElementById('cable-status').textContent = cable.status_display || cable.status;
        document.getElementById('cable-netbox-link').href = `/dcim/cables/${cable.id}/`;

        panel.style.display = 'block';
    }

    closeCablePanel() {
        if (this.selectedCable) {
            const path = document.querySelector(`path[data-cable-id="${this.selectedCable.id}"]`);
            if (path) path.classList.remove('selected');
        }
        this.selectedCable = null;
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

        try {
            const cable = await this.apiPost('cables/', cableData);

            // Close modal
            bootstrap.Modal.getInstance(document.getElementById('create-cable-modal')).hide();

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

    reloadCurrentView() {
        const rackId = document.getElementById('rack-select').value;
        const locationId = document.getElementById('location-select').value;
        const siteId = document.getElementById('site-select').value;

        if (rackId) {
            this.loadDevices({ rack: rackId });
        } else if (locationId) {
            this.loadDevices({ location: locationId });
        } else if (siteId) {
            this.loadDevices({ site: siteId });
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
        // Could implement toast/alert system
        console.error(message);
    }

    setZoom(level) {
        this.zoom = Math.max(0.5, Math.min(2, level));
        document.getElementById('zoom-reset').innerHTML =
            `<i class="mdi mdi-magnify"></i> ${Math.round(this.zoom * 100)}%`;
        this.applyZoom();
    }

    applyZoom() {
        const scroll = document.getElementById('patcher-scroll');
        scroll.style.transform = `scale(${this.zoom})`;
        scroll.style.transformOrigin = 'top left';
    }
}

// Export for use
window.CablePatcher = CablePatcher;
