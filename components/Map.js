'use client';

import { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import { GoogleMap, useJsApiLoader, MarkerF, InfoWindowF } from '@react-google-maps/api';

// IMPORTANT: Must match HistoryMap.js exactly. The Google Maps loader throws
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
 * Build a custom SVG pin icon for a given status.
 */
function createPinIcon(status, isSelected) {
    const color = STATUS_COLORS[status] || STATUS_COLORS.offline;
    const size = isSelected ? 38 : 30;
    
    // Google Maps requires string encoded SVG
    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size * 1.4}" viewBox="0 0 30 42">
            <!-- Pin body -->
            <path d="M15 0 C6.716 0 0 6.716 0 15 C0 23.5 15 42 15 42 C15 42 30 23.5 30 15 C30 6.716 23.284 0 15 0 Z" fill="${color}" />
            <circle cx="15" cy="15" r="7" fill="white" opacity="0.9"/>
            <circle cx="15" cy="15" r="4" fill="${color}"/>
        </svg>
    `.trim();

    return {
        url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
        scaledSize: typeof window !== 'undefined' && window.google ? new window.google.maps.Size(size, size * 1.4) : null,
        anchor: typeof window !== 'undefined' && window.google ? new window.google.maps.Point(size / 2, size * 1.4) : null,
    };
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

export default function Map({ vehicles, selectedVehicle, onVehicleSelect }) {
    const { isLoaded } = useJsApiLoader({
        id: 'google-map-script',
        googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
        libraries: GOOGLE_MAPS_LIBRARIES,
    });

    const [map, setMap] = useState(null);
    const initialFitDone = useRef(false);

    const onLoad = useCallback(function callback(map) {
        setMap(map);
    }, []);

    const onUnmount = useCallback(function callback(map) {
        setMap(null);
    }, []);

    // Only show vehicles that have GPS positions
    const positionedVehicles = useMemo(
        () => vehicles.filter((v) => v.position?.latitude && v.position?.longitude),
        [vehicles]
    );

    // Auto-fit map to show all vehicle positions, or fly to selected vehicle
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

    // When user selects a vehicle: fly to it
    useEffect(() => {
        if (!selectedVehicle || !map || !window.google) return;
        
        const vehicle = vehicles.find((v) => v.id === selectedVehicle);
        if (vehicle?.position) {
            map.panTo({ lat: vehicle.position.latitude, lng: vehicle.position.longitude });
            map.setZoom(15);
        }
    }, [selectedVehicle, vehicles, map]);

    if (!isLoaded) {
        return <div className="flex h-full w-full items-center justify-center bg-gray-50 text-gray-400">Loading Maps...</div>;
    }

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
            {positionedVehicles.map((vehicle) => {
                const isSelected = vehicle.id === selectedVehicle;
                
                return (
                    <MarkerF
                        key={vehicle.id}
                        position={{ lat: vehicle.position.latitude, lng: vehicle.position.longitude }}
                        icon={createPinIcon(vehicle.status, isSelected)}
                        onClick={() => onVehicleSelect(vehicle.id)}
                        zIndex={isSelected ? 1000 : undefined}
                    >
                        {isSelected && (
                            <InfoWindowF
                                position={{ lat: vehicle.position.latitude, lng: vehicle.position.longitude }}
                                onCloseClick={() => onVehicleSelect(null)}
                                options={{
                                    pixelOffset: new window.google.maps.Size(0, -isSelected ? 53 : 45), // Adjust based on icon size
                                    disableAutoPan: false
                                }}
                            >
                                <div className="popup-content">
                                    <div className="popup-title">{vehicle.name}</div>
                                    <div className="popup-subtitle">{vehicle.uniqueId}</div>
                                    <div className="popup-details">
                                        <div className="popup-row">
                                            <span className="popup-row-label">Status</span>
                                            <StatusBadge status={vehicle.status} />
                                        </div>
                                        <div className="popup-row">
                                            <span className="popup-row-label">Speed</span>
                                            <span className="popup-row-value">
                                                {Math.round(vehicle.position.speed * 1.852)} km/h
                                            </span>
                                        </div>
                                        <div className="popup-row">
                                            <span className="popup-row-label">Last Update</span>
                                            <span className="popup-row-value">
                                                {formatTimeAgo(vehicle.position.fixTime)}
                                            </span>
                                        </div>
                                        <div className="popup-row">
                                            <span className="popup-row-label">Coordinates</span>
                                            <span className="popup-row-value" style={{ fontSize: '0.75rem' }}>
                                                {vehicle.position.latitude.toFixed(5)}, {vehicle.position.longitude.toFixed(5)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </InfoWindowF>
                        )}
                    </MarkerF>
                );
            })}
        </GoogleMap>
    );
}

