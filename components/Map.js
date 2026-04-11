'use client';

import { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import { GoogleMap, useJsApiLoader, InfoWindowF } from '@react-google-maps/api';

// IMPORTANT: Must match JourneyMap.js exactly. The Google Maps loader throws
// "Loader must not be called again with different options" if two components
// call useJsApiLoader with the same id but different libraries.
const GOOGLE_MAPS_LIBRARIES = ['geometry', 'marker'];

// Status colors matching the design system
const STATUS_COLORS = {
    online: '#22c55e',
    idle: '#f59e0b',
    offline: '#9ca3af',
};

const DEFAULT_CENTER = { lat: 20.5937, lng: 78.9629 };
const DEFAULT_ZOOM = 5;

/**
 * Build the SVG for a vehicle marker at a given bearing.
 * The marker is a directional arrow + colored status ring.
 * Bearing rotation is applied via CSS transform on the element,
 * not baked into the SVG, so we can update it without recreating the marker.
 */
function createMarkerElement(status, isSelected) {
    const color = STATUS_COLORS[status] || STATUS_COLORS.offline;
    const size = isSelected ? 38 : 30;

    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size * 1.4}" viewBox="0 0 30 42">
            <path d="M15 0 C6.716 0 0 6.716 0 15 C0 23.5 15 42 15 42 C15 42 30 23.5 30 15 C30 6.716 23.284 0 15 0 Z" fill="${color}" />
            <circle cx="15" cy="15" r="7" fill="white" opacity="0.9"/>
            <path d="M15 7 L19 15 L15 12 L11 15 Z" fill="${color}"/>
        </svg>
    `.trim();

    const wrapper = document.createElement('div');
    wrapper.style.cssText = [
        `width:${size}px`,
        `height:${size * 1.4}px`,
        'transform-origin:50% 50%',
        // 150ms CSS transition provides an additional smoothness layer on top of
        // the JS rAF animation — eliminates any sub-frame jitter
        'transition:transform 150ms ease',
        'will-change:transform',
        'cursor:pointer',
    ].join(';');

    const img = document.createElement('img');
    img.src = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
    img.width = size;
    img.height = Math.round(size * 1.4);
    img.style.cssText = 'display:block;pointer-events:none';
    wrapper.appendChild(img);

    return wrapper;
}

// Format relative time
function formatTimeAgo(dateStr) {
    if (!dateStr) return '—';
    const diff = (new Date() - new Date(dateStr)) / 1000;
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

// Status label badge in popup
function StatusBadge({ status }) {
    const labels = { online: 'Online', idle: 'Idle', offline: 'Offline' };
    return (
        <span className={`popup-status popup-status-${status}`}>
            <span
                style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: STATUS_COLORS[status],
                    display: 'inline-block',
                }}
            />
            {labels[status]}
        </span>
    );
}

const mapContainerStyle = {
    height: '100%',
    width: '100%'
};

/**
 * Map component — uses AdvancedMarkerElement instances that are kept alive
 * across position updates. Only marker.position is updated each render,
 * the DOM element is never recreated. Bearing is applied via CSS transform.
 */
export default function TrackerMap({ vehicles = [], selectedVehicle = null, onVehicleSelect = () => { } }) {
    const { isLoaded } = useJsApiLoader({
        id: 'google-map-script',
        googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
        libraries: GOOGLE_MAPS_LIBRARIES,
    });

    const [map, setMap] = useState(null);
    const [infoVehicleId, setInfoVehicleId] = useState(null);
    const initialFitDone = useRef(false);

    // Map of deviceId → AdvancedMarkerElement (kept alive across renders)
    const markersRef = useRef(new Map());
    // Map of deviceId → last vehicle data (for info window)
    const vehicleDataRef = useRef(new Map());

    const onLoad = useCallback((mapInstance) => {
        setMap(mapInstance);
    }, []);

    const onUnmount = useCallback(() => {
        setMap(null);
    }, []);

    // Only show vehicles that have GPS positions
    const positionedVehicles = useMemo(
        () => vehicles.filter((v) => v.position?.latitude && v.position?.longitude),
        [vehicles]
    );

    // ── Marker management: create / update / remove markers ───────────────────
    useEffect(() => {
        if (!map || !window.google || !window.google.maps.marker) return;
        const { AdvancedMarkerElement } = window.google.maps.marker;

        // Update vehicleData ref for info window use
        for (const v of vehicles) {
            vehicleDataRef.current.set(v.id, v);
        }

        // Set of IDs currently in vehicles prop
        const currentIds = new Set(vehicles.map(v => v.id));

        // Remove markers for vehicles no longer in the list
        for (const [id, marker] of markersRef.current) {
            if (!currentIds.has(id)) {
                marker.map = null;
                markersRef.current.delete(id);
            }
        }

        // Create or update markers for each vehicle
        for (const vehicle of vehicles) {
            const hasPosition = vehicle.position?.latitude && vehicle.position?.longitude;
            const isSelected = vehicle.id === selectedVehicle;
            const bearing = vehicle.position?.bearing ?? vehicle.position?.course ?? 0;

            if (!hasPosition) {
                // Hide marker if no position
                const m = markersRef.current.get(vehicle.id);
                if (m) m.map = null;
                continue;
            }

            const pos = {
                lat: vehicle.position.latitude,
                lng: vehicle.position.longitude,
            };

            if (!markersRef.current.has(vehicle.id)) {
                // ── Create new marker ──────────────────────────────────────
                const el = createMarkerElement(vehicle.status, isSelected);

                // Apply initial bearing rotation
                el.style.transform = `rotate(${Math.round(bearing)}deg)`;

                const marker = new AdvancedMarkerElement({
                    position: pos,
                    map,
                    zIndex: isSelected ? 1000 : 1,
                    content: el,
                    title: vehicle.name,
                });

                // Click to select
                marker.addListener('click', () => {
                    setInfoVehicleId(prev => prev === vehicle.id ? null : vehicle.id);
                    onVehicleSelect(vehicle.id);
                });

                markersRef.current.set(vehicle.id, marker);
            } else {
                // ── Update existing marker in-place (no recreation) ────────
                const marker = markersRef.current.get(vehicle.id);

                // Re-show if it was hidden
                if (!marker.map) marker.map = map;

                // Update position (Google Maps will animate this internally)
                marker.position = pos;

                // Update zIndex for selection state
                marker.zIndex = isSelected ? 1000 : 1;

                // Update bearing via CSS transform on the content element
                // The 150ms CSS transition handles micro-smoothing
                if (marker.content) {
                    marker.content.style.transform = `rotate(${Math.round(bearing)}deg)`;
                }

                // Rebuild icon if selection state changed (different size)
                // We check the current content size vs desired size
                const currentSize = marker.content?.style?.width;
                const desiredSize = `${isSelected ? 38 : 30}px`;
                if (currentSize !== desiredSize) {
                    const el = createMarkerElement(vehicle.status, isSelected);
                    el.style.transform = `rotate(${Math.round(bearing)}deg)`;
                    marker.content = el;
                }
            }
        }
    }, [map, vehicles, selectedVehicle, onVehicleSelect]);

    // ── Auto-fit map on first load ────────────────────────────────────────────
    useEffect(() => {
        if (!map || !window.google) return;

        if (!initialFitDone.current) {
            const positioned = vehicles.filter((v) => v.position);
            if (positioned.length === 0) return;

            initialFitDone.current = true;

            if (positioned.length === 1) {
                map.setCenter({ lat: positioned[0].position.latitude, lng: positioned[0].position.longitude });
                map.setZoom(13);
            } else {
                const bounds = new window.google.maps.LatLngBounds();
                positioned.forEach((v) => {
                    bounds.extend({ lat: v.position.latitude, lng: v.position.longitude });
                });
                map.fitBounds(bounds, { bottom: 60, top: 60, left: 60, right: 60 });
            }
        }
    }, [map, vehicles]);

    // ── Fly to selected vehicle ───────────────────────────────────────────────
    useEffect(() => {
        if (!selectedVehicle || !map || !window.google) return;

        const vehicle = vehicles.find((v) => v.id === selectedVehicle);
        if (vehicle?.position) {
            map.panTo({ lat: vehicle.position.latitude, lng: vehicle.position.longitude });
            map.setZoom(15);
        }
    }, [selectedVehicle, vehicles, map]);

    // ── Sync info window state with selectedVehicle prop ─────────────────────
    useEffect(() => {
        if (selectedVehicle !== infoVehicleId) {
            setInfoVehicleId(selectedVehicle);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedVehicle]);

    // ── Clean up all markers on unmount ──────────────────────────────────────
    useEffect(() => {
        return () => {
            for (const marker of markersRef.current.values()) {
                marker.map = null;
            }
            markersRef.current.clear();
        };
    }, []);

    if (!isLoaded) {
        return <div className="flex h-full w-full items-center justify-center bg-gray-50 text-gray-400">Loading Maps...</div>;
    }

    // Find selected vehicle data for info window
    const infoVehicle = infoVehicleId ? vehicleDataRef.current.get(infoVehicleId) : null;

    return (
        <GoogleMap
            mapContainerStyle={mapContainerStyle}
            center={DEFAULT_CENTER}
            zoom={DEFAULT_ZOOM}
            onLoad={onLoad}
            onUnmount={onUnmount}
            options={{
                mapTypeControl: false,
                streetViewControl: false,
                fullscreenControl: true,
                zoomControl: true,
            }}
        >
            {/* Info window for selected vehicle */}
            {infoVehicle?.position && (
                <InfoWindowF
                    position={{
                        lat: infoVehicle.position.latitude,
                        lng: infoVehicle.position.longitude,
                    }}
                    onCloseClick={() => {
                        setInfoVehicleId(null);
                        onVehicleSelect(null);
                    }}
                    options={{
                        pixelOffset: new window.google.maps.Size(0, infoVehicle.id === selectedVehicle ? -53 : -45),
                        disableAutoPan: false,
                    }}
                >
                    <div className="popup-content">
                        <div className="popup-title">{infoVehicle.name}</div>
                        <div className="popup-subtitle">{infoVehicle.uniqueId}</div>
                        <div className="popup-details">
                            <div className="popup-row">
                                <span className="popup-row-label">Status</span>
                                <StatusBadge status={infoVehicle.status} />
                            </div>
                            <div className="popup-row">
                                <span className="popup-row-label">Speed</span>
                                <span className="popup-row-value">
                                    {Math.round((infoVehicle.position.speed || 0) * 1.852)} km/h
                                </span>
                            </div>
                            <div className="popup-row">
                                <span className="popup-row-label">Last Update</span>
                                <span className="popup-row-value">
                                    {formatTimeAgo(infoVehicle.position.fixTime)}
                                </span>
                            </div>
                            <div className="popup-row">
                                <span className="popup-row-label">Coordinates</span>
                                <span className="popup-row-value" style={{ fontSize: '0.75rem' }}>
                                    {infoVehicle.position.latitude.toFixed(5)}, {infoVehicle.position.longitude.toFixed(5)}
                                </span>
                            </div>
                        </div>
                    </div>
                </InfoWindowF>
            )}
        </GoogleMap>
    );
}