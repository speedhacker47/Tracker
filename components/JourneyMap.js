'use client';

import { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from 'react';
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
    { segments, stops, playbackState, onPlaybackTick },
    ref
) {
    const { isLoaded } = useJsApiLoader({
        id: 'google-map-script',
        googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
        libraries: GOOGLE_MAPS_LIBRARIES,
    });

    const mapRef = useRef(null);
    const overlaysRef = useRef([]);   // polylines
    const markersRef = useRef([]);    // stop markers, start/end pins
    const arrowRef = useRef(null);    // animated arrow
    const trailRef = useRef(null);    // growing trail polyline
    const infoRef = useRef(null);
    const rafRef = useRef(null);
    const lastFrameRef = useRef(0);
    const hasDrawnRef = useRef(false);
    const prevSegmentsKey = useRef('');
    const currentIdxRef = useRef(0);       // tracks animation position without causing re-renders
    const playbackStateRef = useRef(null); // mirror of playbackState for use inside RAF

    // Build flat point array from all segments (for animation)
    const allPoints = useRef([]);
    useEffect(() => {
        const pts = [];
        for (const seg of segments) {
            for (const p of seg.points) {
                pts.push({ ...p, segmentId: seg.id });
            }
        }
        allPoints.current = pts;
    }, [segments]);

    const updateArrow = useCallback((map, idx) => {
        const pt = allPoints.current[idx];
        if (!pt) return;

        const { AdvancedMarkerElement } = window.google.maps.marker;
        const nextPt = allPoints.current[Math.min(idx + 1, allPoints.current.length - 1)];
        const bearing = nextPt ? bearingBetween(pt, nextPt) : 0;

        if (!arrowRef.current) {
            const el = document.createElement('img');
            el.src = arrowSVG(bearing);
            el.width = 32; el.height = 32;
            el.style.cssText = 'display:block;transform-origin:50% 50%';
            arrowRef.current = new AdvancedMarkerElement({
                position: { lat: pt.lat, lng: pt.lng }, map, zIndex: 20, content: el,
            });
        } else {
            arrowRef.current.position = { lat: pt.lat, lng: pt.lng };
            arrowRef.current.content.src = arrowSVG(bearing);
        }
    }, []);

    const updateTrail = useCallback((idx) => {
        if (!trailRef.current) return;
        const pts = allPoints.current.slice(0, idx + 1);
        const path = pts.map(p => ({ lat: p.lat, lng: p.lng }));
        trailRef.current.setPath(path);
        // Also update the white casing trail (last overlay pushed)
        const casing = overlaysRef.current[overlaysRef.current.length - 1];
        if (casing?.setPath) casing.setPath(path);
    }, []);

    const onLoad = useCallback((map) => {
        mapRef.current = map;
        infoRef.current = new window.google.maps.InfoWindow();
    }, []);

    const onUnmount = useCallback(() => { mapRef.current = null; }, []);

    // ── Draw static route + markers ───────────────────────────────────────
    useEffect(() => {
        if (!isLoaded || !mapRef.current) return;

        const key = segments.map(s => s.id).join('|') + '_' + stops.length;
        if (hasDrawnRef.current && prevSegmentsKey.current === key) return;
        prevSegmentsKey.current = key;
        hasDrawnRef.current = false;

        const map = mapRef.current;

        // Clear old overlays
        overlaysRef.current.forEach(o => o?.setMap?.(null));
        overlaysRef.current = [];
        markersRef.current.forEach(m => { if (m) m.map = null; });
        markersRef.current = [];
        if (arrowRef.current) { arrowRef.current.map = null; arrowRef.current = null; }
        if (trailRef.current) { trailRef.current.setMap(null); trailRef.current = null; }
        infoRef.current?.close();

        if (segments.length === 0) return;

        const bounds = new window.google.maps.LatLngBounds();
        const { AdvancedMarkerElement } = window.google.maps.marker;

        // ── Route polylines per segment ───────────────────────────────────
        for (const seg of segments) {
            if (seg.points.length < 2) continue;
            const path = seg.points.map(p => ({ lat: p.lat, lng: p.lng }));
            path.forEach(p => bounds.extend(p));

            // Glow
            overlaysRef.current.push(new window.google.maps.Polyline({
                path, strokeColor: '#1a73e8', strokeOpacity: 0.06, strokeWeight: 18,
                geodesic: true, map, zIndex: 1,
            }));
            // White casing
            overlaysRef.current.push(new window.google.maps.Polyline({
                path, strokeColor: '#fff', strokeOpacity: 1, strokeWeight: 7,
                geodesic: true, map, zIndex: 2,
            }));
            // Blue fill
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
        const lastPt = allPoints.current[allPoints.current.length - 1];

        if (firstPt) {
            const el = document.createElement('img');
            el.src = pinSVG('#1e8e3e');
            el.width = 28; el.height = 36;
            el.style.cssText = 'display:block;transform-origin:50% 100%';
            const m = new AdvancedMarkerElement({ position: { lat: firstPt.lat, lng: firstPt.lng }, map, zIndex: 10, content: el });
            markersRef.current.push(m);
        }
        if (lastPt && (lastPt !== firstPt)) {
            const el = document.createElement('img');
            el.src = pinSVG('#d93025');
            el.width = 28; el.height = 36;
            el.style.cssText = 'display:block;transform-origin:50% 100%';
            const m = new AdvancedMarkerElement({ position: { lat: lastPt.lat, lng: lastPt.lng }, map, zIndex: 10, content: el });
            markersRef.current.push(m);
        }

        // ── Stop markers ──────────────────────────────────────────────────
        for (const st of stops) {
            const pos = { lat: st.lat, lng: st.lng };
            bounds.extend(pos);

            const el = document.createElement('img');
            el.src = stopMarkerSVG();
            el.width = 28; el.height = 28;
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

        // ── Trail polyline (initially empty, grows during animation) ──────
        trailRef.current = new window.google.maps.Polyline({
            path: [],
            strokeColor: '#1a73e8', strokeOpacity: 1, strokeWeight: 6,
            geodesic: true, map, zIndex: 8,
        });
        // White casing under trail
        overlaysRef.current.push(new window.google.maps.Polyline({
            path: [], strokeColor: '#fff', strokeOpacity: 1, strokeWeight: 8,
            geodesic: true, map, zIndex: 7,
        }));

        hasDrawnRef.current = true;

        // Fit bounds
        setTimeout(() => {
            if (mapRef.current && !bounds.isEmpty()) {
                mapRef.current.fitBounds(bounds, { top: 80, bottom: 40, left: 40, right: 40 });
            }
        }, 200);
    }, [segments, stops, isLoaded]);

    // ── Keep playbackStateRef in sync (so RAF closure always reads latest) ─
    useEffect(() => {
        playbackStateRef.current = playbackState;
    });

    // ── Animation loop using requestAnimationFrame ────────────────────────
    // NOTE: playbackState.pointIndex is intentionally NOT in deps here.
    // The index is tracked via currentIdxRef so the RAF loop is not restarted
    // on every tick (which was causing the map to snap back to India each frame).
    useEffect(() => {
        if (!isLoaded || !mapRef.current) return;
        const map = mapRef.current;

        if (!playbackState.isPlaying) {
            if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }

            // Still update arrow position when paused (e.g., user seeks via timeline)
            const idx = playbackStateRef.current?.pointIndex ?? 0;
            if (idx >= 0 && allPoints.current.length > 0) {
                const safeIdx = Math.min(idx, allPoints.current.length - 1);
                updateArrow(map, safeIdx);
                updateTrail(safeIdx);
            }
            return;
        }

        // Playing — pick up from wherever currentIdxRef is (set by seekTo / previous pause)
        currentIdxRef.current = playbackStateRef.current?.pointIndex || 0;
        const speedMultiplier = playbackState.speed || 1;
        const msPerPoint = 50 / speedMultiplier;
        let acc = 0;

        const frame = (timestamp) => {
            if (lastFrameRef.current === 0) lastFrameRef.current = timestamp;
            const delta = timestamp - lastFrameRef.current;
            lastFrameRef.current = timestamp;

            acc += delta;
            const steps = Math.floor(acc / msPerPoint);
            if (steps > 0) {
                acc -= steps * msPerPoint;
                currentIdxRef.current = Math.min(
                    currentIdxRef.current + steps,
                    allPoints.current.length - 1
                );

                updateArrow(map, currentIdxRef.current);
                updateTrail(currentIdxRef.current);

                // Report index back to parent
                if (onPlaybackTick) onPlaybackTick(currentIdxRef.current);

                // Reached end
                if (currentIdxRef.current >= allPoints.current.length - 1) {
                    if (onPlaybackTick) onPlaybackTick(-1); // signal completion
                    return;
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

    // ── Expose seekTo for parent to jump to a point index ─────────────────
    useImperativeHandle(ref, () => ({
        seekTo(idx) {
            if (!mapRef.current || allPoints.current.length === 0) return;
            const safeIdx = Math.max(0, Math.min(idx, allPoints.current.length - 1));
            currentIdxRef.current = safeIdx; // keep ref in sync
            updateArrow(mapRef.current, safeIdx);
            updateTrail(safeIdx);
            const pt = allPoints.current[safeIdx];
            if (pt) mapRef.current.panTo({ lat: pt.lat, lng: pt.lng });
        },
        getPointCount() { return allPoints.current.length; },
        getPointTimestamp(idx) {
            return allPoints.current[idx]?.timestamp;
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
            defaultCenter={{ lat: 22.9734, lng: 78.6569 }}
            defaultZoom={5}
            onLoad={onLoad}
            onUnmount={onUnmount}
            options={MAP_OPTIONS}
        />
    );
});

export default JourneyMap;
