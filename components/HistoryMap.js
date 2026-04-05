'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { GoogleMap, useJsApiLoader } from '@react-google-maps/api';

const GOOGLE_MAPS_LIBRARIES = ['geometry'];
const mapContainerStyle = { height: '100%', width: '100%' };
const MAP_OPTIONS = {
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(d) {
    if (!d) return '—';
    return new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/**
 * Catmull-Rom spline through LatLng points.
 * Produces smooth curves that approximate the original GPS path.
 */
function catmullRom(points, segs = 8) {
    if (points.length < 2) return points;
    const out = [];
    for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[Math.max(0, i - 1)];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[Math.min(points.length - 1, i + 2)];
        for (let t = 0; t < segs; t++) {
            const s = t / segs;
            const s2 = s * s, s3 = s2 * s;
            const lat = 0.5 * (
                2 * p1.lat() +
                (-p0.lat() + p2.lat()) * s +
                (2 * p0.lat() - 5 * p1.lat() + 4 * p2.lat() - p3.lat()) * s2 +
                (-p0.lat() + 3 * p1.lat() - 3 * p2.lat() + p3.lat()) * s3
            );
            const lng = 0.5 * (
                2 * p1.lng() +
                (-p0.lng() + p2.lng()) * s +
                (2 * p0.lng() - 5 * p1.lng() + 4 * p2.lng() - p3.lng()) * s2 +
                (-p0.lng() + 3 * p1.lng() - 3 * p2.lng() + p3.lng()) * s3
            );
            out.push(new window.google.maps.LatLng(lat, lng));
        }
    }
    out.push(points[points.length - 1]);
    return out;
}

/**
 * Snap one chunk (max 25 stops) to roads via Directions API.
 * Falls back to raw LatLngs if API fails (quota, etc).
 */
function snapChunk(svc, chunk) {
    return new Promise(resolve => {
        svc.route({
            origin: { lat: chunk[0].latitude, lng: chunk[0].longitude },
            destination: { lat: chunk[chunk.length - 1].latitude, lng: chunk[chunk.length - 1].longitude },
            waypoints: chunk.slice(1, -1).map(p => ({
                location: { lat: p.latitude, lng: p.longitude },
                stopover: false,
            })),
            travelMode: window.google.maps.TravelMode.DRIVING,
            optimizeWaypoints: false,
        }, (res, status) => {
            if (status === 'OK' && res?.routes?.[0]) {
                resolve({ ok: true, path: res.routes[0].overview_path });
            } else {
                resolve({
                    ok: false,
                    path: chunk.map(p => new window.google.maps.LatLng(p.latitude, p.longitude)),
                });
            }
        });
    });
}

/**
 * Build the full smoothed/snapped path from all GPS positions.
 */
async function buildPath(positions, onPct) {
    const CHUNK = 23; // max waypoints per Directions request
    const chunks = [];
    for (let i = 0; i < positions.length - 1; i += CHUNK + 1) {
        chunks.push(positions.slice(i, i + CHUNK + 2));
    }

    const svc = new window.google.maps.DirectionsService();
    let all = [];
    let anySnapped = false;

    for (let i = 0; i < chunks.length; i++) {
        const { ok, path } = await snapChunk(svc, chunks[i]);
        if (ok) anySnapped = true;
        all = i === 0 ? all.concat(path) : all.concat(path.slice(1));
        onPct(Math.round(((i + 1) / chunks.length) * 100));
    }

    // If Directions API failed for everything, apply Catmull-Rom smoothing
    if (!anySnapped && all.length >= 4) {
        all = catmullRom(all, 10);
    }

    return all;
}

// ─── Drawing ──────────────────────────────────────────────────────────────────

function drawRoute(map, path, fraction) {
    const overlays = [];
    if (path.length < 2) return overlays;

    const splitIdx = Math.max(2, Math.round(fraction * path.length));
    const traveled = path.slice(0, splitIdx);
    const remaining = path.slice(splitIdx - 1);

    // Glow halo behind entire route
    overlays.push(new window.google.maps.Polyline({
        path,
        strokeColor: '#1a73e8', strokeOpacity: 0.07, strokeWeight: 20,
        geodesic: true, map, zIndex: 1,
    }));

    // Remaining: white casing + gray fill
    overlays.push(new window.google.maps.Polyline({
        path: remaining, strokeColor: '#fff', strokeOpacity: 1, strokeWeight: 7,
        geodesic: true, map, zIndex: 2,
    }));
    overlays.push(new window.google.maps.Polyline({
        path: remaining, strokeColor: '#c8d6e5', strokeOpacity: 1, strokeWeight: 5,
        geodesic: true, map, zIndex: 3,
    }));

    // Traveled: white casing + blue fill
    overlays.push(new window.google.maps.Polyline({
        path: traveled, strokeColor: '#fff', strokeOpacity: 1, strokeWeight: 9,
        geodesic: true, map, zIndex: 4,
    }));
    overlays.push(new window.google.maps.Polyline({
        path: traveled, strokeColor: '#1a73e8', strokeOpacity: 1, strokeWeight: 6,
        geodesic: true, map, zIndex: 5,
    }));

    // Directional chevron arrows along traveled route
    overlays.push(new window.google.maps.Polyline({
        path: traveled,
        strokeOpacity: 0,
        icons: [{
            icon: {
                path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                scale: 3.5,
                strokeColor: '#fff',
                strokeWeight: 1.5,
                fillColor: '#1557b0',
                fillOpacity: 1,
            },
            offset: '25%',
            repeat: '100px',
        }],
        map, zIndex: 6,
    }));

    return overlays;
}

function pinSVG(color) {
    const s = encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
            <path d="M14 0C6.268 0 0 6.268 0 14c0 9.333 14 22 14 22S28 23.333 28 14C28 6.268 21.732 0 14 0z"
                fill="${color}" stroke="white" stroke-width="2.5"/>
            <circle cx="14" cy="14" r="6.5" fill="white" opacity="0.95"/>
            <circle cx="14" cy="14" r="3.5" fill="${color}"/>
        </svg>`
    );
    return `data:image/svg+xml;charset=UTF-8,${s}`;
}

function dotSVG() {
    const s = encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26">
            <circle cx="13" cy="13" r="12" fill="#1a73e8" opacity="0.18"/>
            <circle cx="13" cy="13" r="8" fill="#1a73e8" opacity="0.35"/>
            <circle cx="13" cy="13" r="5" fill="#1a73e8" stroke="white" stroke-width="2"/>
        </svg>`
    );
    return `data:image/svg+xml;charset=UTF-8,${s}`;
}

function makePin(map, pos, color) {
    return new window.google.maps.Marker({
        position: pos, map, zIndex: 12,
        icon: {
            url: pinSVG(color),
            scaledSize: new window.google.maps.Size(28, 36),
            anchor: new window.google.maps.Point(14, 36),
        },
    });
}

function makeDot(map, pos) {
    return new window.google.maps.Marker({
        position: pos, map, zIndex: 20,
        icon: {
            url: dotSVG(),
            scaledSize: new window.google.maps.Size(26, 26),
            anchor: new window.google.maps.Point(13, 13),
        },
    });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function HistoryMap({ positions, playbackIndex, isPlaying }) {
    const { isLoaded } = useJsApiLoader({
        id: 'google-map-script',
        googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
        libraries: GOOGLE_MAPS_LIBRARIES,
    });

    const mapRef = useRef(null);
    const overlaysRef = useRef([]);
    const markersRef = useRef({ start: null, end: null, current: null });
    const infoRef = useRef(null);
    const pathRef = useRef([]); // snapped LatLng[]
    const [snapping, setSnapping] = useState(false);
    const [snappingPct, setSnappingPct] = useState(0);
    const buildingRef = useRef(false);

    const onLoad = useCallback((map) => {
        mapRef.current = map;
        infoRef.current = new window.google.maps.InfoWindow();
    }, []);

    const onUnmount = useCallback(() => { mapRef.current = null; }, []);

    // ── Full rebuild when positions array changes ─────────────────────────────
    useEffect(() => {
        if (!isLoaded || !mapRef.current) return;
        const map = mapRef.current;

        // Clear everything
        overlaysRef.current.forEach(o => o?.setMap(null));
        overlaysRef.current = [];
        Object.values(markersRef.current).forEach(m => m?.setMap(null));
        markersRef.current = { start: null, end: null, current: null };
        pathRef.current = [];
        infoRef.current?.close();

        if (positions.length < 2) return;

        const run = async () => {
            // Prevent double-runs
            if (buildingRef.current) return;
            buildingRef.current = true;
            setSnapping(true);
            setSnappingPct(0);

            const path = await buildPath(positions, setSnappingPct);
            pathRef.current = path;

            const fraction = playbackIndex / Math.max(1, positions.length - 1);
            overlaysRef.current = drawRoute(map, path, fraction);

            // Start / end / current markers
            const startPos = { lat: positions[0].latitude, lng: positions[0].longitude };
            const endPos = { lat: positions[positions.length - 1].latitude, lng: positions[positions.length - 1].longitude };
            const curPos = { lat: positions[playbackIndex].latitude, lng: positions[playbackIndex].longitude };

            markersRef.current.start = makePin(map, startPos, '#1e8e3e');
            markersRef.current.end = makePin(map, endPos, '#d93025');
            markersRef.current.current = makeDot(map, curPos);

            const addInfo = (marker, title, p) => {
                marker.addListener('click', () => {
                    infoRef.current?.setContent(
                        `<div style="font-family:system-ui,sans-serif;padding:4px 0;min-width:150px">
                            <b style="font-size:13px;color:#202124">${title}</b>
                            <div style="font-size:12px;color:#5f6368;margin-top:5px;line-height:1.8">
                                🕐 ${fmt(p.fixTime)}<br>⚡ ${Math.round((p.speed || 0) * 1.852)} km/h
                            </div>
                        </div>`
                    );
                    infoRef.current?.open(map, marker);
                });
            };
            addInfo(markersRef.current.start, '▶ Start', positions[0]);
            addInfo(markersRef.current.end, '■ End', positions[positions.length - 1]);

            // Fit bounds — wait one frame so Google Maps has rendered
            const bounds = new window.google.maps.LatLngBounds();
            path.forEach(p => bounds.extend(p));
            setTimeout(() => {
                if (mapRef.current) {
                    mapRef.current.fitBounds(bounds, { top: 64, bottom: 96, left: 56, right: 56 });
                }
            }, 200);

            setSnapping(false);
            buildingRef.current = false;
        };

        run();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [positions, isLoaded]);

    // ── Redraw progress on playback tick ──────────────────────────────────────
    useEffect(() => {
        if (!isLoaded || !mapRef.current || pathRef.current.length < 2 || snapping) return;

        const map = mapRef.current;
        const fraction = playbackIndex / Math.max(1, positions.length - 1);

        overlaysRef.current.forEach(o => o?.setMap(null));
        overlaysRef.current = drawRoute(map, pathRef.current, fraction);

        if (positions[playbackIndex]) {
            const p = positions[playbackIndex];
            const ll = new window.google.maps.LatLng(p.latitude, p.longitude);
            markersRef.current.current?.setPosition(ll);
            if (isPlaying) map.panTo(ll);
        }
    }, [playbackIndex, isPlaying, positions, isLoaded, snapping]);

    // ─── Empty / loading states ───────────────────────────────────────────────
    if (positions.length === 0) {
        return (
            <div style={{
                height: '100%', display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                background: 'linear-gradient(135deg,#f8faff,#f0f4ff)', gap: '1rem',
            }}>
                <div style={{
                    width: 72, height: 72, borderRadius: '50%', background: 'white',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 4px 20px rgba(26,115,232,0.1)',
                    border: '1px solid rgba(26,115,232,0.08)',
                }}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
                        stroke="#aecbfa" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                    </svg>
                </div>
                <div style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#5f6368', marginBottom: '0.375rem' }}>
                        No Route Loaded
                    </p>
                    <p style={{ fontSize: '0.8125rem', color: '#9aa0a6' }}>
                        Select a vehicle &amp; date range,<br />then click <strong>Show Route</strong>
                    </p>
                </div>
            </div>
        );
    }

    if (!isLoaded) {
        return (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8f9fa', color: '#9aa0a6' }}>
                Loading Maps…
            </div>
        );
    }

    return (
        <div style={{ position: 'relative', height: '100%', width: '100%' }}>
            <GoogleMap
                mapContainerStyle={mapContainerStyle}
                center={{ lat: 22.9734, lng: 78.6569 }}
                zoom={5}
                onLoad={onLoad}
                onUnmount={onUnmount}
                options={MAP_OPTIONS}
            />

            {snapping && (
                <div style={{
                    position: 'absolute', top: '50%', left: '50%',
                    transform: 'translate(-50%,-50%)',
                    background: 'white', borderRadius: 14, zIndex: 1000,
                    padding: '1.375rem 2rem',
                    boxShadow: '0 8px 40px rgba(26,115,232,0.18)',
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', gap: '0.875rem', minWidth: 240,
                    pointerEvents: 'none',
                }}>
                    <div style={{
                        width: 40, height: 40, borderRadius: '50%', background: '#e8f0fe',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                            stroke="#1a73e8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                            style={{ animation: 'spin 1.2s linear infinite' }}>
                            <path d="M23 4v6h-6" /><path d="M1 20v-6h6" />
                            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                        </svg>
                    </div>
                    <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#202124', textAlign: 'center' }}>
                        Aligning route to roads…
                    </div>
                    <div style={{ width: '100%', height: 5, background: '#e8eaed', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{
                            height: '100%',
                            background: 'linear-gradient(90deg,#1a73e8,#34a853)',
                            width: `${snappingPct}%`,
                            borderRadius: 3,
                            transition: 'width 0.35s ease',
                        }} />
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#9aa0a6' }}>{snappingPct}% complete</div>
                </div>
            )}
        </div>
    );
}