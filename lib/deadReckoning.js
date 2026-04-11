/**
 * DeadReckoningEngine
 *
 * Pure JavaScript class — no React or browser dependencies.
 * Stores the last known GPS position for each tracked device and uses
 * speed + course + elapsed time to predict the current position.
 *
 * The Haversine forward formula (vincenty-style) is used to project
 * a new lat/lng from a known position along a bearing.
 *
 * Usage:
 *   const dr = new DeadReckoningEngine();
 *   dr.updatePosition(deviceId, { lat, lng, speed, course, timestamp });
 *   const pos = dr.getPredictedPosition(deviceId);
 *   // → { lat, lng, course, isPredicted, confidence }
 */

const EARTH_RADIUS_M = 6_371_000; // metres
const MAX_PREDICT_SECONDS = 30;   // stop predicting after 30s of no update
const KNOTS_TO_MS = 0.514444;     // 1 knot = 0.514444 m/s

export class DeadReckoningEngine {
    constructor() {
        /** @type {Map<number|string, { lat: number, lng: number, speed: number, course: number, timestamp: number }>} */
        this._positions = new Map();
    }

    /**
     * Feed a new confirmed GPS position into the engine.
     *
     * @param {number|string} deviceId
     * @param {{ lat: number, lng: number, speed: number, course: number, timestamp: number }} pos
     *   speed  — in knots (as returned by Traccar)
     *   course — in degrees 0–360, where 0/360 = North, 90 = East
     *   timestamp — Unix epoch milliseconds (Date.now())
     */
    updatePosition(deviceId, { lat, lng, speed, course, timestamp }) {
        this._positions.set(deviceId, {
            lat,
            lng,
            speed: speed ?? 0,
            course: course ?? 0,
            timestamp: timestamp ?? Date.now(),
        });
    }

    /**
     * Compute the predicted current position for a device.
     *
     * If no position has been fed for this device, returns null.
     * If the last update was more than MAX_PREDICT_SECONDS ago, returns
     * the last known position unchanged (vehicle assumed stopped).
     *
     * @param {number|string} deviceId
     * @returns {{ lat: number, lng: number, course: number, isPredicted: boolean, confidence: number } | null}
     */
    getPredictedPosition(deviceId) {
        const last = this._positions.get(deviceId);
        if (!last) return null;

        const elapsedMs = Date.now() - last.timestamp;
        const elapsedSeconds = elapsedMs / 1000;

        // Beyond the cap — no prediction, return last known position
        if (elapsedSeconds >= MAX_PREDICT_SECONDS || last.speed <= 0) {
            return {
                lat: last.lat,
                lng: last.lng,
                course: last.course,
                isPredicted: false,
                confidence: 0,
            };
        }

        const confidence = Math.max(0, 1 - elapsedSeconds / MAX_PREDICT_SECONDS);
        const speedMs = last.speed * KNOTS_TO_MS;
        const distanceM = speedMs * elapsedSeconds;

        if (distanceM < 0.01) {
            // Not worth projecting — sub-centimetre movement
            return {
                lat: last.lat,
                lng: last.lng,
                course: last.course,
                isPredicted: false,
                confidence,
            };
        }

        const { lat: lat2, lng: lng2 } = _projectPosition(
            last.lat,
            last.lng,
            last.course,
            distanceM
        );

        return {
            lat: lat2,
            lng: lng2,
            course: last.course,
            isPredicted: true,
            confidence,
        };
    }

    /**
     * Get predicted positions for ALL tracked devices.
     *
     * @returns {Map<number|string, { lat: number, lng: number, course: number, isPredicted: boolean, confidence: number }>}
     */
    getAllPredictions() {
        const result = new Map();
        for (const deviceId of this._positions.keys()) {
            const pred = this.getPredictedPosition(deviceId);
            if (pred) result.set(deviceId, pred);
        }
        return result;
    }

    /**
     * Remove a device from the engine (e.g. on unmount or logout).
     * @param {number|string} deviceId
     */
    removeDevice(deviceId) {
        this._positions.delete(deviceId);
    }

    /** Clear all tracked devices. */
    clear() {
        this._positions.clear();
    }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Haversine forward projection.
 * Given a start lat/lng, bearing (degrees), and distance (metres),
 * returns the destination lat/lng.
 *
 * Formula:
 *   lat2 = asin(sin(lat1) * cos(d/R) + cos(lat1) * sin(d/R) * cos(bearing))
 *   lng2 = lng1 + atan2(sin(bearing)*sin(d/R)*cos(lat1), cos(d/R) - sin(lat1)*sin(lat2))
 */
function _projectPosition(latDeg, lngDeg, bearingDeg, distanceM) {
    const lat1 = _toRad(latDeg);
    const lng1 = _toRad(lngDeg);
    const bearing = _toRad(bearingDeg);
    const d = distanceM / EARTH_RADIUS_M; // angular distance

    const lat2 = Math.asin(
        Math.sin(lat1) * Math.cos(d) +
        Math.cos(lat1) * Math.sin(d) * Math.cos(bearing)
    );

    const lng2 =
        lng1 +
        Math.atan2(
            Math.sin(bearing) * Math.sin(d) * Math.cos(lat1),
            Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
        );

    return {
        lat: _toDeg(lat2),
        lng: _toDeg(lng2),
    };
}

function _toRad(deg) { return (deg * Math.PI) / 180; }
function _toDeg(rad) { return (rad * 180) / Math.PI; }
