/**
 * VehicleAnimator
 *
 * Browser-only class that drives smooth 60fps marker movement for the
 * live dashboard. Works identically for both polling and WebSocket data.
 *
 * Lifecycle per device when a new real position arrives:
 *   1. TRANSITION (800ms)  — lerps displayed position from current → new real
 *   2. DEAD RECKONING      — predicts position each frame using DeadReckoningEngine
 *   3. STOPPED (speed=0 for 3+ updates) — holds position, still lerps bearing
 *
 * The updateCallback is called every animation frame with:
 *   (deviceId, { lat, lng, bearing, isPredicted, confidence })
 *
 * Usage:
 *   const animator = new VehicleAnimator((deviceId, pos) => setVehicles(...));
 *   animator.start();
 *   animator.onNewPosition(id, { lat, lng, speed, course, timestamp });
 *   // ← called whenever polling or WebSocket delivers a new fix
 *   animator.stop(); // cleanup on unmount
 */

import { DeadReckoningEngine } from '@/lib/deadReckoning';

const TRANSITION_DURATION_MS = 800;  // lerp duration for new real position
const STOP_THRESHOLD_UPDATES = 3;    // how many speed=0 updates before declaring stopped
const BEARING_LERP_FACTOR = 0.10;    // heading smoothness per frame (0 = never turns, 1 = instant)

/**
 * Shortest-path angular lerp (identical to JourneyMap.js).
 * Always rotates the short way around the 360° circle.
 */
function lerpAngle(a, b, t) {
    const diff = ((b - a) % 360 + 540) % 360 - 180; // range [-180, 180]
    return a + diff * t;
}

/** Linear interpolation between two numbers. */
function lerp(a, b, t) { return a + (b - a) * t; }

/** Clamp a value between min and max. */
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

export class VehicleAnimator {
    /**
     * @param {(deviceId: string|number, pos: { lat: number, lng: number, bearing: number, isPredicted: boolean, confidence: number }) => void} updateCallback
     */
    constructor(updateCallback) {
        this._callback = updateCallback;
        this._dr = new DeadReckoningEngine();

        /**
         * Per-device animation state.
         * @type {Map<string|number, {
         *   // Displayed position (updated every frame)
         *   dispLat: number, dispLng: number, dispBearing: number,
         *   // Transition state
         *   inTransition: boolean,
         *   transStartLat: number, transStartLng: number,
         *   transTargetLat: number, transTargetLng: number,
         *   transStartMs: number,
         *   // Dead reckoning
         *   inDeadReckoning: boolean,
         *   // Stopped detection
         *   zeroSpeedCount: number,
         *   isStopped: boolean,
         *   // Last known heading target
         *   targetBearing: number,
         * }>}
         */
        this._states = new Map();

        this._rafId = null;
        this._running = false;
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Feed a new confirmed GPS position.
     * Called whenever polling or WebSocket delivers a fix.
     *
     * @param {string|number} deviceId
     * @param {{ lat: number, lng: number, speed: number, course: number, timestamp: number }} position
     *   speed in knots, course in degrees 0–360, timestamp in ms
     */
    onNewPosition(deviceId, position) {
        const { lat, lng, speed = 0, course = 0, timestamp = Date.now() } = position;

        // Feed into dead reckoning engine
        this._dr.updatePosition(deviceId, { lat, lng, speed, course, timestamp });

        const existing = this._states.get(deviceId);

        if (!existing) {
            // First time we've seen this device — snap immediately, no lerp
            this._states.set(deviceId, {
                dispLat: lat,
                dispLng: lng,
                dispBearing: course,
                inTransition: false,
                transStartLat: lat,
                transStartLng: lng,
                transTargetLat: lat,
                transTargetLng: lng,
                transStartMs: 0,
                inDeadReckoning: false,
                zeroSpeedCount: speed <= 0 ? 1 : 0,
                isStopped: false,
                targetBearing: course,
            });
        } else {
            // Track zero-speed run for stopped detection
            if (speed <= 0) {
                existing.zeroSpeedCount = (existing.zeroSpeedCount || 0) + 1;
            } else {
                existing.zeroSpeedCount = 0;
                existing.isStopped = false;
            }

            if (existing.zeroSpeedCount >= STOP_THRESHOLD_UPDATES) {
                existing.isStopped = true;
            }

            const distMoved = Math.abs(lat - existing.dispLat) + Math.abs(lng - existing.dispLng);

            if (distMoved < 1e-9) {
                // Position hasn't changed at all — no transition needed, just update bearing
                existing.targetBearing = course;
                existing.inTransition = false;
                existing.inDeadReckoning = false;
            } else {
                // Start a new transition from current displayed position to new real position
                existing.inTransition = true;
                existing.inDeadReckoning = false;
                existing.transStartLat = existing.dispLat;
                existing.transStartLng = existing.dispLng;
                existing.transTargetLat = lat;
                existing.transTargetLng = lng;
                existing.transStartMs = performance.now();
                existing.targetBearing = course;
            }
        }
    }

    /**
     * Start the 60fps animation loop.
     * Call once after creating the animator.
     */
    start() {
        if (this._running) return;
        this._running = true;
        this._rafId = requestAnimationFrame(this._tick.bind(this));
    }

    /**
     * Stop the animation loop.
     * Call on component unmount.
     */
    stop() {
        this._running = false;
        if (this._rafId !== null) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
        this._dr.clear();
        this._states.clear();
    }

    /**
     * Remove a single device (e.g. it disappeared from the fleet).
     * @param {string|number} deviceId
     */
    removeDevice(deviceId) {
        this._states.delete(deviceId);
        this._dr.removeDevice(deviceId);
    }

    // ── Internal animation loop ───────────────────────────────────────────────

    _tick(now) {
        if (!this._running) return;

        for (const [deviceId, state] of this._states) {
            this._updateDevice(deviceId, state, now);
        }

        this._rafId = requestAnimationFrame(this._tick.bind(this));
    }

    _updateDevice(deviceId, state, now) {
        let lat = state.dispLat;
        let lng = state.dispLng;
        let isPredicted = false;
        let confidence = 1;

        if (state.isStopped) {
            // Stopped — hold position, still smooth bearing
            lat = state.transTargetLat;
            lng = state.transTargetLng;
        } else if (state.inTransition) {
            // Phase 1: lerp toward new real position
            const elapsed = now - state.transStartMs;
            const t = clamp(elapsed / TRANSITION_DURATION_MS, 0, 1);

            lat = lerp(state.transStartLat, state.transTargetLat, t);
            lng = lerp(state.transStartLng, state.transTargetLng, t);

            if (t >= 1) {
                // Transition complete — switch to dead reckoning
                state.inTransition = false;
                state.inDeadReckoning = true;
                state.dispLat = state.transTargetLat;
                state.dispLng = state.transTargetLng;
            }
        } else if (state.inDeadReckoning) {
            // Phase 2: use dead reckoning engine for position
            const predicted = this._dr.getPredictedPosition(deviceId);
            if (predicted) {
                lat = predicted.lat;
                lng = predicted.lng;
                isPredicted = predicted.isPredicted;
                confidence = predicted.confidence;
            }
        }

        // Smooth bearing toward target using shortest-path lerp
        state.dispBearing = lerpAngle(state.dispBearing, state.targetBearing, BEARING_LERP_FACTOR);

        // Update stored displayed position
        state.dispLat = lat;
        state.dispLng = lng;

        // Fire callback so the UI can update
        this._callback(deviceId, {
            lat,
            lng,
            bearing: state.dispBearing,
            isPredicted,
            confidence,
        });
    }
}
