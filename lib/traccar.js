/**
 * Traccar API Helper
 *
 * All calls to the Traccar server happen server-side only (API routes).
 * TRACCAR_INTERNAL_URL uses the Docker internal service name "traccar" —
 * never exposed to the browser or frontend.
 */

// Server-side only env var (no NEXT_PUBLIC_ prefix = never sent to browser)
const TRACCAR_URL = process.env.TRACCAR_INTERNAL_URL || 'http://traccar:8082';
const TRACCAR_USER = process.env.TRACCAR_USER;
const TRACCAR_PASS = process.env.TRACCAR_PASS;

// Base64 encode credentials for Basic Auth
function getAuthHeader() {
    const credentials = Buffer.from(`${TRACCAR_USER}:${TRACCAR_PASS}`).toString('base64');
    return `Basic ${credentials}`;
}

/**
 * Make an authenticated request to the Traccar API
 */
async function traccarFetch(endpoint, options = {}) {
    const url = `${TRACCAR_URL}/api${endpoint}`;

    const res = await fetch(url, {
        ...options,
        headers: {
            Authorization: getAuthHeader(),
            'Content-Type': 'application/json',
            ...(options.headers || {}),
        },
        // Don't cache these requests
        cache: 'no-store',
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Traccar API error ${res.status}: ${text}`);
    }

    return res.json();
}

/**
 * Get all devices from Traccar
 */
export async function getDevices() {
    return traccarFetch('/devices');
}

/**
 * Get all current positions from Traccar
 */
export async function getPositions() {
    return traccarFetch('/positions');
}

/**
 * Get a specific device by ID
 */
export async function getDevice(id) {
    return traccarFetch(`/devices?id=${id}`);
}

/**
 * Get positions for a specific device within a time range
 * Used for route history (Phase 2)
 */
export async function getDevicePositions(deviceId, from, to) {
    const params = new URLSearchParams({
        deviceId: String(deviceId),
        from: from.toISOString(),
        to: to.toISOString(),
    });
    return traccarFetch(`/positions?${params}`);
}

/**
 * Create a Traccar session (alternative auth method)
 */
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

    if (!res.ok) {
        throw new Error(`Traccar session error: ${res.status}`);
    }

    return res.json();
}
