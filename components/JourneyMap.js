'use client';

import { useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from 'react';
import { GoogleMap, useJsApiLoader } from '@react-google-maps/api';

const GOOGLE_MAPS_LIBRARIES = ['geometry', 'marker'];
const mapContainerStyle = { height: '100%', width: '100%' };
const MAP_OPTIONS = {
    mapId: process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID',
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true,
    zoomControl: true,
    gestureHandling: 'greedy',
    styles: [
        { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
        { featureType: 'transit', elementType: 'labels', stylers: [{ visibility: 'off' }] },
    ],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function bearingBetween(p1, p2) {
    const dLon = ((p2.lng - p1.lng) * Math.PI) / 180;
    const lat1 = (p1.lat * Math.PI) / 180;
    const lat2 = (p2.lat * Math.PI) / 180;
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/**
 * Shortest-path angular lerp — always rotates the short way around the 360° circle.
 */
function lerpAngle(a, b, t) {
    const diff = ((b - a) % 360 + 540) % 360 - 180; // range [-180, 180]
    return a + diff * t;
}

function arrowSVG(rotation) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
        <g transform="rotate(${rotation} 16 16)">
            <circle cx="16" cy="16" r="14" fill="#1a73e8" stroke="white" stroke-width="2.5"/>
            <path d="M16 6 L22 22 L16 18 L10 22 Z" fill="white"/>
        </g>
    </svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function stopMarkerSVG() {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
        <circle cx="14" cy="14" r="12" fill="#ea4335" stroke="white" stroke-width="2.5" opacity="0.9"/>
        <rect x="10" y="10" width="8" height="8" rx="1" fill="white"/>
    </svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function pinSVG(color) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
        <path d="M14 0C6.268 0 0 6.268 0 14c0 9.333 14 22 14 22S28 23.333 28 14C28 6.268 21.732 0 14 0z"
            fill="${color}" stroke="white" stroke-width="2.5"/>
        <circle cx="14" cy="14" r="6.5" fill="white" opacity="0.95"/>
        <circle cx="14" cy="14" r="3.5" fill="${color}"/>
    </svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function formatDuration(seconds) {
    if (!seconds || seconds < 60) return '< 1 min';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m} min`;
}

function formatTime(isoStr) {
    if (!isoStr) return '—';
    return new Date(isoStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ── Component ─────────────────────────────────────────────────────────────────

const JourneyMap = forwardRef(function JourneyMap(
    { segments, stops, playbackState, onPlaybackTick, autoFollow },
    ref
) {
    const { isLoaded } = useJsApiLoader({
        id: 'google-map-script',
        googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
        libraries: GOOGLE_MAPS_LIBRARIES,
    });

    const mapRef            = useRef(null);
    const overlaysRef       = useRef([]);     // static route polylines
    const markersRef        = useRef([]);     // stop markers, start/end pins
    const arrowRef          = useRef(null);   // animated AdvancedMarkerElement
    const infoRef           = useRef(null);
    const rafRef            = useRef(null);
    const lastFrameRef      = useRef(0);
    const hasDrawnRef       = useRef(false);
    const prevSegmentsKey   = useRef('');

    // Stable center/zoom so @react-google-maps/api never calls setCenter() again.
    const initialCenter = useRef({ lat: 22.9734, lng: 78.6569 });
    const initialZoom   = useRef(5);

    // ── Data refs (populated when segments change) ────────────────────────
    const allPoints   = useRef([]);   // flat array of all GPS points
    const cumDistKm   = useRef([]);   // cumulative km at each point index
    const speedKmh    = useRef([]);   // smoothed km/h per point
    const segDurMs    = useRef([]);   // real elapsed ms between point[i-1] and point[i]

    // ── Lerp / animation state refs ───────────────────────────────────────
    const lerpFromRef    = useRef(0);  // integer index of "from" point
    const lerpTRef       = useRef(0);  // 0..1 progress between lerpFrom and lerpFrom+1
    const lerpAngleRef   = useRef(0);  // current displayed arrow heading (degrees)
    const currentIdxRef  = useRef(0);  // last integer point reported to parent

    // ── Trail polylines (two-polyline strategy) ───────────────────────────
    // completedTrailRef: all points from 0 → lerpFrom (grows on index crossing)
    // activeSegTrailRef: exactly 2 points [point[lerpFrom] → interp pos] (per-frame)
    const completedTrailRef = useRef(null);
    const activeSegTrailRef = useRef(null);

    // ── Misc refs ─────────────────────────────────────────────────────────
    const autoFollowRef      = useRef(autoFollow);
    const playbackStateRef   = useRef(playbackState);
    useEffect(() => { autoFollowRef.current = autoFollow; }, [autoFollow]);
    useEffect(() => { playbackStateRef.current = playbackState; });

    // ── Build flat point array + derived data from segments ───────────────
    useEffect(() => {
        const pts = [];
        for (const seg of segments) {
            for (const p of seg.points) {
                pts.push({ ...p, segmentId: seg.id });
            }
        }
        allPoints.current = pts;

        // Cumulative Haversine distance (km)
        const cum = [0];
        for (let i = 1; i < pts.length; i++) {
            const R    = 6371;
            const dLat = (pts[i].lat - pts[i - 1].lat) * Math.PI / 180;
            const dLon = (pts[i].lng - pts[i - 1].lng) * Math.PI / 180;
            const a    = Math.sin(dLat / 2) ** 2 +
                Math.cos(pts[i - 1].lat * Math.PI / 180) * Math.cos(pts[i].lat * Math.PI / 180) *
                Math.sin(dLon / 2) ** 2;
            const d    = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            cum.push(cum[i - 1] + d);
        }
        cumDistKm.current = cum;

        // Smoothed instantaneous speed (km/h)
        const raw = new Array(pts.length).fill(0);
        for (let i = 1; i < pts.length; i++) {
            const dtMs = new Date(pts[i].timestamp).getTime() - new Date(pts[i - 1].timestamp).getTime();
            const dKm  = cum[i] - cum[i - 1];
            if (dtMs > 0) raw[i] = dKm / (dtMs / 3_600_000);
        }
        const smoothed = raw.map((v, i) => {
            if (i === 0) return raw[0];
            if (i === raw.length - 1) return (raw[i - 1] + raw[i]) / 2;
            return (raw[i - 1] + raw[i] + raw[i + 1]) / 3;
        });
        speedKmh.current = smoothed.map(v => Math.round(Math.max(0, v)));

        // Animation duration per segment — derived from real Traccar speed.
        // Formula: duration_ms = (distanceKm / speedKmh) × 3_600_000
        // This is the time it physically takes to drive that gap at the reported speed.
        // Falls back to 50 ms/point when speed is null (historic data) or 0 (stopped).
        const dur = new Array(pts.length).fill(50);
        for (let i = 1; i < pts.length; i++) {
            const ptSpeedKmh = pts[i].speed;   // already in km/h from API, may be null
            if (ptSpeedKmh != null && ptSpeedKmh > 1) {
                const distKm = cum[i] - cum[i - 1];
                const realMs = (distKm / ptSpeedKmh) * 3_600_000;
                // Clamp: 15ms min (very fast road), 4000ms max (prevents stall on GPS outliers)
                dur[i] = Math.min(Math.max(realMs, 15), 4000);
            }
            // else: dur[i] stays at 50 ms fallback
        }
        segDurMs.current = dur;
    }, [segments]);

    // ── Arrow helper: position + heading from exact lat/lng ───────────────
    const updateArrowAt = useCallback((map, lat, lng, bearing) => {
        const { AdvancedMarkerElement } = window.google.maps.marker;
        if (!arrowRef.current) {
            const el = document.createElement('img');
            el.src  = arrowSVG(bearing);
            el.width = 32; el.height = 32;
            el.style.cssText = 'display:block;transform-origin:50% 50%';
            arrowRef.current = new AdvancedMarkerElement({
                position: { lat, lng }, map, zIndex: 20, content: el,
            });
        } else {
            arrowRef.current.position   = { lat, lng };
            arrowRef.current.content.src = arrowSVG(bearing);
        }
    }, []);

    // ── Trail helper: two-polyline update ─────────────────────────────────
    // fromIdx  — integer "from" point index
    // interpLat/Lng — exact current interpolated position
    const updateTrailAt = useCallback((fromIdx, interpLat, interpLng) => {
        // Completed trail: everything up to and including fromIdx
        if (completedTrailRef.current) {
            const path = allPoints.current
                .slice(0, fromIdx + 1)
                .map(p => ({ lat: p.lat, lng: p.lng }));
            completedTrailRef.current.setPath(path);
        }
        // Active segment: always exactly 2 points
        if (activeSegTrailRef.current) {
            const from = allPoints.current[fromIdx];
            if (from) {
                activeSegTrailRef.current.setPath([
                    { lat: from.lat, lng: from.lng },
                    { lat: interpLat, lng: interpLng },
                ]);
            }
        }
    }, []);

    const onLoad    = useCallback((map) => {
        mapRef.current  = map;
        infoRef.current = new window.google.maps.InfoWindow();
    }, []);

    const onUnmount = useCallback(() => { mapRef.current = null; }, []);

    // ── Draw static route + markers when segments change ─────────────────
    useEffect(() => {
        if (!isLoaded || !mapRef.current) return;

        const key = segments.map(s => s.id).join('|') + '_' + stops.length;
        if (hasDrawnRef.current && prevSegmentsKey.current === key) return;
        prevSegmentsKey.current = key;
        hasDrawnRef.current = false;

        const map = mapRef.current;

        // Clear old overlays & markers
        overlaysRef.current.forEach(o => o?.setMap?.(null));
        overlaysRef.current = [];
        markersRef.current.forEach(m => { if (m) m.map = null; });
        markersRef.current = [];
        if (arrowRef.current)          { arrowRef.current.map = null;          arrowRef.current = null; }
        if (completedTrailRef.current) { completedTrailRef.current.setMap(null); completedTrailRef.current = null; }
        if (activeSegTrailRef.current) { activeSegTrailRef.current.setMap(null); activeSegTrailRef.current = null; }
        infoRef.current?.close();

        // Reset lerp state
        lerpFromRef.current  = 0;
        lerpTRef.current     = 0;
        lerpAngleRef.current = 0;

        if (segments.length === 0) return;

        const bounds = new window.google.maps.LatLngBounds();
        const { AdvancedMarkerElement } = window.google.maps.marker;

        // ── Route polylines per segment ──────────────────────────────────
        for (const seg of segments) {
            if (seg.points.length < 2) continue;
            const path = seg.points.map(p => ({ lat: p.lat, lng: p.lng }));
            path.forEach(p => bounds.extend(p));

            // Glow halo
            overlaysRef.current.push(new window.google.maps.Polyline({
                path, strokeColor: '#1a73e8', strokeOpacity: 0.06, strokeWeight: 18,
                geodesic: true, map, zIndex: 1,
            }));
            // White casing
            overlaysRef.current.push(new window.google.maps.Polyline({
                path, strokeColor: '#fff', strokeOpacity: 1, strokeWeight: 7,
                geodesic: true, map, zIndex: 2,
            }));
            // Faded blue fill (route underlay)
            overlaysRef.current.push(new window.google.maps.Polyline({
                path, strokeColor: '#a8c7fa', strokeOpacity: 1, strokeWeight: 5,
                geodesic: true, map, zIndex: 3,
            }));
            // Direction arrows
            overlaysRef.current.push(new window.google.maps.Polyline({
                path, strokeOpacity: 0,
                icons: [{
                    icon: {
                        path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                        scale: 2.5, strokeColor: '#fff', strokeWeight: 1,
                        fillColor: '#7baaf7', fillOpacity: 0.8,
                    },
                    offset: '20%', repeat: '120px',
                }],
                map, zIndex: 4,
            }));
        }

        // ── Start / End pins ──────────────────────────────────────────────
        const firstPt = allPoints.current[0];
        const lastPt  = allPoints.current[allPoints.current.length - 1];

        if (firstPt) {
            const el = document.createElement('img');
            el.src = pinSVG('#1e8e3e'); el.width = 28; el.height = 36;
            el.style.cssText = 'display:block;transform-origin:50% 100%';
            markersRef.current.push(new AdvancedMarkerElement({
                position: { lat: firstPt.lat, lng: firstPt.lng }, map, zIndex: 10, content: el,
            }));
        }
        if (lastPt && lastPt !== firstPt) {
            const el = document.createElement('img');
            el.src = pinSVG('#d93025'); el.width = 28; el.height = 36;
            el.style.cssText = 'display:block;transform-origin:50% 100%';
            markersRef.current.push(new AdvancedMarkerElement({
                position: { lat: lastPt.lat, lng: lastPt.lng }, map, zIndex: 10, content: el,
            }));
        }

        // ── Stop markers ──────────────────────────────────────────────────
        for (const st of stops) {
            const pos = { lat: st.lat, lng: st.lng };
            bounds.extend(pos);
            const el = document.createElement('img');
            el.src = stopMarkerSVG(); el.width = 28; el.height = 28;
            el.style.cssText = 'display:block;transform-origin:50% 50%;cursor:pointer';
            const marker = new AdvancedMarkerElement({ position: pos, map, zIndex: 11, content: el });
            markersRef.current.push(marker);

            marker.addListener('click', () => {
                infoRef.current?.setContent(`
                    <div style="font-family:system-ui,sans-serif;padding:4px 0;min-width:140px">
                        <b style="font-size:13px;color:#d93025">⏸ Stop</b>
                        <div style="font-size:12px;color:#5f6368;margin-top:5px;line-height:1.8">
                            🕐 ${formatTime(st.arrivedAt)} → ${formatTime(st.departedAt)}<br>
                            ⏱ ${formatDuration(st.durationSeconds)}
                        </div>
                    </div>
                `);
                infoRef.current?.open(map, marker);
            });
        }

        // ── Two-polyline trail (initially empty, grows during animation) ──
        // Completed trail (all passed points) — blue, sits below arrow
        completedTrailRef.current = new window.google.maps.Polyline({
            path: [],
            strokeColor: '#1a73e8', strokeOpacity: 0.95, strokeWeight: 6,
            geodesic: true, map, zIndex: 8,
        });
        // White casing under completed trail
        overlaysRef.current.push(new window.google.maps.Polyline({
            path: [], strokeColor: '#fff', strokeOpacity: 1, strokeWeight: 9,
            geodesic: true, map, zIndex: 7,
        }));

        // Active segment (from last GPS point → current interp pos) — brighter, thin
        activeSegTrailRef.current = new window.google.maps.Polyline({
            path: [],
            strokeColor: '#4285f4', strokeOpacity: 1, strokeWeight: 6,
            geodesic: true, map, zIndex: 9,
        });

        hasDrawnRef.current = true;

        // Fit bounds
        setTimeout(() => {
            if (mapRef.current && !bounds.isEmpty()) {
                mapRef.current.fitBounds(bounds, { top: 80, bottom: 40, left: 40, right: 40 });
            }
        }, 200);
    }, [segments, stops, isLoaded]);

    // ── Animation loop ────────────────────────────────────────────────────
    // Drives the lerp between GPS points using real timestamps.
    // NOTE: pointIndex is intentionally excluded from deps — the RAF loop
    // owns its own position via lerpFromRef / lerpTRef.
    useEffect(() => {
        if (!isLoaded || !mapRef.current) return;
        const map = mapRef.current;

        if (!playbackState.isPlaying) {
            if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }

            // Snap arrow to current pointIndex when paused / seeking
            const idx    = playbackStateRef.current?.pointIndex ?? 0;
            const safeIdx = Math.min(Math.max(idx, 0), allPoints.current.length - 1);
            if (allPoints.current.length > 0) {
                const pt  = allPoints.current[safeIdx];
                const nxt = allPoints.current[Math.min(safeIdx + 1, allPoints.current.length - 1)];
                const bearing = nxt ? bearingBetween(pt, nxt) : lerpAngleRef.current;
                lerpAngleRef.current = bearing;
                updateArrowAt(map, pt.lat, pt.lng, Math.round(bearing));
                updateTrailAt(safeIdx, pt.lat, pt.lng);
            }
            return;
        }

        // ── Start playing — pick up at lerpFromRef position ──────────────
        // Sync lerpFrom to the pointIndex chosen by the parent (e.g. after seek)
        lerpFromRef.current = Math.min(
            playbackStateRef.current?.pointIndex ?? 0,
            allPoints.current.length - 1
        );

        const frame = (timestamp) => {
            if (!lastFrameRef.current) lastFrameRef.current = timestamp;
            const rawDelta = timestamp - lastFrameRef.current;
            lastFrameRef.current = timestamp;

            const speedMult = playbackStateRef.current?.speed ?? 1;
            let toConsume   = rawDelta * speedMult; // virtual milliseconds to advance through

            // Advance through as many segments as rawDelta covers
            while (toConsume > 0) {
                const fromIdx = lerpFromRef.current;
                const toIdx   = fromIdx + 1;

                if (toIdx >= allPoints.current.length) {
                    // Reached the end of all points
                    const lastPt = allPoints.current[allPoints.current.length - 1];
                    if (lastPt) {
                        updateArrowAt(map, lastPt.lat, lastPt.lng, Math.round(lerpAngleRef.current));
                        updateTrailAt(allPoints.current.length - 1, lastPt.lat, lastPt.lng);
                    }
                    onPlaybackTick?.(-1);
                    return;
                }

                const segDur    = segDurMs.current[toIdx] || 50; // ms this GPS segment spans
                const remaining = (1 - lerpTRef.current) * segDur; // ms left in current seg

                if (toConsume >= remaining) {
                    // Crossed into the next point
                    toConsume -= remaining;
                    lerpTRef.current  = 0;
                    lerpFromRef.current = toIdx;
                    currentIdxRef.current = toIdx;
                    onPlaybackTick?.(toIdx); // report integer crossing to parent
                } else {
                    lerpTRef.current += toConsume / segDur;
                    toConsume = 0;
                }
            }

            // ── Compute interpolated position ─────────────────────────────
            const from  = lerpFromRef.current;
            const to    = Math.min(from + 1, allPoints.current.length - 1);
            const pA    = allPoints.current[from];
            const pB    = allPoints.current[to];
            const t     = lerpTRef.current;

            const lat   = pA.lat + (pB.lat - pA.lat) * t;
            const lng   = pA.lng + (pB.lng - pA.lng) * t;

            // Smooth heading: lerp current angle toward target with speed proportional to t
            const targetBearing  = pA === pB ? lerpAngleRef.current : bearingBetween(pA, pB);
            // Use a turn-speed factor — higher = snappier. 0.12 per frame feels natural.
            const turnSpeed      = 0.12;
            lerpAngleRef.current = lerpAngle(lerpAngleRef.current, targetBearing, turnSpeed);

            updateArrowAt(map, lat, lng, Math.round(lerpAngleRef.current));
            updateTrailAt(from, lat, lng);

            // ── Soft-follow camera ────────────────────────────────────────────
            // Only pan when the arrow drifts into the outer 20% band of the viewport.
            // This means the user can zoom freely — we never touch the camera unless
            // the arrow is near/at the edge. When we do pan, Google Maps' built-in
            // animation makes it slide smoothly rather than teleport.
            if (autoFollowRef.current) {
                const bounds = map.getBounds();
                if (bounds) {
                    const ne     = bounds.getNorthEast();
                    const sw     = bounds.getSouthWest();
                    const spanLat = ne.lat() - sw.lat();
                    const spanLng = ne.lng() - sw.lng();

                    // Inner keep-zone = centre 60%. Outer 20% band on each side = trigger.
                    const PAD    = 0.20;
                    const minLat = sw.lat() + spanLat * PAD;
                    const maxLat = ne.lat() - spanLat * PAD;
                    const minLng = sw.lng() + spanLng * PAD;
                    const maxLng = ne.lng() - spanLng * PAD;

                    if (lat < minLat || lat > maxLat || lng < minLng || lng > maxLng) {
                        map.panTo({ lat, lng });
                    }
                }
            }

            rafRef.current = requestAnimationFrame(frame);
        };

        lastFrameRef.current = 0;
        rafRef.current = requestAnimationFrame(frame);

        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [playbackState.isPlaying, playbackState.speed, isLoaded]);

    // ── Expose imperative API to parent ───────────────────────────────────
    useImperativeHandle(ref, () => ({
        seekTo(idx) {
            if (!mapRef.current || allPoints.current.length === 0) return;
            const safeIdx = Math.max(0, Math.min(idx, allPoints.current.length - 1));

            // Snap lerp state to this index
            lerpFromRef.current = safeIdx;
            lerpTRef.current    = 0;
            currentIdxRef.current = safeIdx;

            const pt  = allPoints.current[safeIdx];
            const nxt = allPoints.current[Math.min(safeIdx + 1, allPoints.current.length - 1)];
            const bearing = nxt && nxt !== pt ? bearingBetween(pt, nxt) : lerpAngleRef.current;
            lerpAngleRef.current = bearing;

            updateArrowAt(mapRef.current, pt.lat, pt.lng, Math.round(bearing));
            updateTrailAt(safeIdx, pt.lat, pt.lng);
            mapRef.current.panTo({ lat: pt.lat, lng: pt.lng });
        },

        getPointCount()      { return allPoints.current.length; },

        getPointTimestamp(idx) {
            return allPoints.current[idx]?.timestamp;
        },

        getPointSpeed(idx) {
            const pt = allPoints.current[idx];
            if (!pt) return null;

            // Prefer the real Traccar speed stored in the DB (integer km/h).
            // This is null for historic points recorded before the speed_kmh
            // column was added — fall back to the timestamp-derived estimate.
            if (pt.speed != null) return pt.speed;

            // Fallback: smoothed speed derived from GPS Δtime (noisier, but
            // better than nothing for pre-migration data).
            const computed = speedKmh.current[idx];
            return computed != null ? Math.round(computed) : null;
        },

        getDistanceAtPoint(idx) {
            return cumDistKm.current[idx] ?? null;
        },

        getTotalDistance() {
            const len = cumDistKm.current.length;
            return len > 0 ? cumDistKm.current[len - 1] : 0;
        },

        findPointByTime(timestamp) {
            const t = new Date(timestamp).getTime();
            let best = 0, bestDiff = Infinity;
            for (let i = 0; i < allPoints.current.length; i++) {
                const diff = Math.abs(new Date(allPoints.current[i].timestamp).getTime() - t);
                if (diff < bestDiff) { bestDiff = diff; best = i; }
            }
            return best;
        },
    }));

    // ── Render ─────────────────────────────────────────────────────────────
    if (!isLoaded) {
        return (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8f9fa', color: '#9aa0a6' }}>
                Loading Maps…
            </div>
        );
    }

    return (
        <GoogleMap
            mapContainerStyle={mapContainerStyle}
            center={initialCenter.current}
            zoom={initialZoom.current}
            onLoad={onLoad}
            onUnmount={onUnmount}
            options={MAP_OPTIONS}
        />
    );
});

export default JourneyMap;
