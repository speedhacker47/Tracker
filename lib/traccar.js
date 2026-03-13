/**
 * Traccar API Helper
 *
 * All calls to the Traccar server happen server-side only (API routes).
 * TRACCAR_INTERNAL_URL uses the Docker internal service name "traccar" —
 * never exposed to the browser or frontend.
 */

const TRACCAR_URL = process.env.TRACCAR_INTERNAL_URL || 'http://traccar:8082';
const TRACCAR_USER = process.env.TRACCAR_USER;
const TRACCAR_PASS = process.env.TRACCAR_PASS;

function getAuthHeader() {
    const credentials = Buffer.from(`${TRACCAR_USER}:${TRACCAR_PASS}`).toString('base64');
    return `Basic ${credentials}`;
}

async function traccarFetch(endpoint, options = {}) {
    const url = `${TRACCAR_URL}/api${endpoint}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            Authorization: getAuthHeader(),
            'Content-Type': 'application/json',
            ...(options.headers || {}),
        },
        cache: 'no-store',
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Traccar API error ${res.status}: ${text}`);
    }

    return res.json();
}

// ── Existing helpers ──────────────────────────────────────────────────────────

export async function getDevices() {
    return traccarFetch('/devices');
}

export async function getPositions() {
    return traccarFetch('/positions');
}

export async function getDevice(id) {
    return traccarFetch(`/devices?id=${id}`);
}

export async function getDevicePositions(deviceId, from, to) {
    const params = new URLSearchParams({
        deviceId: String(deviceId),
        from: from.toISOString(),
        to: to.toISOString(),
    });
    return traccarFetch(`/positions?${params}`);
}

export async function createSession() {
    const url = `${TRACCAR_URL}/api/session`;
    const params = new URLSearchParams({
        email: TRACCAR_USER,
        password: TRACCAR_PASS,
    });
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
        cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Traccar session error: ${res.status}`);
    return res.json();
}

// ── Reports helpers ───────────────────────────────────────────────────────────

/**
 * Get auto-detected trips for a device in a time range.
 * Traccar detects trips from movement patterns automatically.
 * Returns: [{ deviceId, startTime, endTime, startAddress, endAddress,
 *             distance (meters), duration (ms), maxSpeed (knots),
 *             averageSpeed (knots), driverUniqueId }]
 */
export async function getTrips(deviceId, from, to) {
    const params = new URLSearchParams({
        deviceId: String(deviceId),
        from: from instanceof Date ? from.toISOString() : from,
        to: to instanceof Date ? to.toISOString() : to,
    });
    return traccarFetch(`/reports/trips?${params}`);
}

/**
 * Get stop events for a device in a time range.
 * Returns: [{ deviceId, startTime, endTime, address,
 *             latitude, longitude, duration (ms) }]
 */
export async function getStops(deviceId, from, to) {
    const params = new URLSearchParams({
        deviceId: String(deviceId),
        from: from instanceof Date ? from.toISOString() : from,
        to: to instanceof Date ? to.toISOString() : to,
    });
    return traccarFetch(`/reports/stops?${params}`);
}

/**
 * Get aggregated summary stats for a device in a time range.
 * Returns array (one entry per device): [{ deviceId, distance,
 *   maxSpeed, averageSpeed, engineHours, fuelConsumed }]
 */
export async function getSummary(deviceId, from, to) {
    const params = new URLSearchParams({
        deviceId: String(deviceId),
        from: from instanceof Date ? from.toISOString() : from,
        to: to instanceof Date ? to.toISOString() : to,
    });
    return traccarFetch(`/reports/summary?${params}`);
}

/**
 * Get event log for a device in a time range.
 * Optional type filter: 'alarm', 'ignitionOn', 'ignitionOff', 'deviceOnline',
 *   'deviceOffline', 'geofenceEnter', 'geofenceExit', 'overspeed', etc.
 * Returns: [{ id, deviceId, type, eventTime, positionId,
 *             geofenceId, maintenanceId, attributes }]
 */
export async function getEvents(deviceId, from, to, type = null) {
    const params = new URLSearchParams({
        deviceId: String(deviceId),
        from: from instanceof Date ? from.toISOString() : from,
        to: to instanceof Date ? to.toISOString() : to,
    });
    if (type) params.set('type', type);
    return traccarFetch(`/reports/events?${params}`);
}

/**
 * Get all geofences defined in Traccar.
 * Returns: [{ id, name, description, area (WKT string), calendarId, attributes }]
 * area examples: "CIRCLE (lat lon, radius)" or "POLYGON ((lon lat, ...))"
 */
export async function getGeofences() {
    return traccarFetch('/geofences');
}

/**
 * Create a new geofence in Traccar.
 * area should be WKT: "CIRCLE (12.9716 77.5946, 500)" or
 *   "POLYGON ((lon lat, lon lat, ...))"
 */
export async function createGeofence({ name, description = '', area }) {
    return traccarFetch('/geofences', {
        method: 'POST',
        body: JSON.stringify({ name, description, area }),
    });
}

/**
 * Delete a geofence by ID.
 */
export async function deleteGeofence(id) {
    const url = `${TRACCAR_URL}/api/geofences/${id}`;
    const res = await fetch(url, {
        method: 'DELETE',
        headers: { Authorization: getAuthHeader() },
        cache: 'no-store',
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Traccar delete geofence error ${res.status}: ${text}`);
    }
    return true;
}