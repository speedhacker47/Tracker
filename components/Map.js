'use client';

import { useEffect, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Status colors matching the design system
const STATUS_COLORS = {
    online: '#22c55e',
    idle: '#f59e0b',
    offline: '#9ca3af',
};

// India default center (fallback when no vehicles have positions)
const DEFAULT_CENTER = [20.5937, 78.9629];
const DEFAULT_ZOOM = 5;

/**
 * Build a custom SVG pin icon for a given status.
 * The pin has a filled circle on top and a pointed bottom (classic map pin).
 */
function createPinIcon(status, isSelected) {
    const color = STATUS_COLORS[status] || STATUS_COLORS.offline;
    const size = isSelected ? 38 : 30;
    const shadow = isSelected ? `drop-shadow(0 4px 8px ${color}88)` : `drop-shadow(0 2px 4px rgba(0,0,0,0.3))`;

    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size * 1.4}" viewBox="0 0 30 42" style="filter:${shadow}">
            <!-- Pin body -->
            <path d="M15 0 C6.716 0 0 6.716 0 15 C0 23.5 15 42 15 42 C15 42 30 23.5 30 15 C30 6.716 23.284 0 15 0 Z"
                  fill="${color}" />
            <!-- Inner white circle -->
            <circle cx="15" cy="15" r="7" fill="white" opacity="0.9"/>
            <!-- Status dot -->
            <circle cx="15" cy="15" r="4" fill="${color}"/>
        </svg>
    `.trim();

    return L.divIcon({
        html: svg,
        className: '',
        iconSize: [size, size * 1.4],
        iconAnchor: [size / 2, size * 1.4],   // tip of the pin
        popupAnchor: [0, -size * 1.4 + 4],    // popup above the pin
    });
}

// Auto-fit map to show all vehicle positions, or fly to selected vehicle
function MapController({ vehicles, selectedVehicle }) {
    const map = useMap();
    const initialFitDone = useRef(false);

    // On first load: fit bounds to all positioned vehicles
    useEffect(() => {
        if (initialFitDone.current) return;
        const positioned = vehicles.filter((v) => v.position);
        if (positioned.length === 0) return;

        initialFitDone.current = true;

        if (positioned.length === 1) {
            map.setView(
                [positioned[0].position.latitude, positioned[0].position.longitude],
                13,
                { animate: false }
            );
        } else {
            const bounds = positioned.map((v) => [v.position.latitude, v.position.longitude]);
            map.fitBounds(bounds, { padding: [60, 60], maxZoom: 14, animate: false });
        }
    }, [vehicles, map]);

    // When user selects a vehicle: fly to it
    useEffect(() => {
        if (!selectedVehicle) return;
        const vehicle = vehicles.find((v) => v.id === selectedVehicle);
        if (vehicle?.position) {
            map.flyTo(
                [vehicle.position.latitude, vehicle.position.longitude],
                15,
                { duration: 1.2, easeLinearity: 0.25 }
            );
        }
    }, [selectedVehicle, vehicles, map]);

    return null;
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

export default function Map({ vehicles, selectedVehicle, onVehicleSelect }) {
    const markerRefs = useRef({});

    // Only show vehicles that have GPS positions
    const positionedVehicles = useMemo(
        () => vehicles.filter((v) => v.position?.latitude && v.position?.longitude),
        [vehicles]
    );

    // Auto-open popup when selected
    useEffect(() => {
        if (selectedVehicle && markerRefs.current[selectedVehicle]) {
            setTimeout(() => {
                const marker = markerRefs.current[selectedVehicle];
                if (marker) marker.openPopup();
            }, 400);
        }
    }, [selectedVehicle]);

    return (
        <MapContainer
            center={DEFAULT_CENTER}
            zoom={DEFAULT_ZOOM}
            style={{ height: '100%', width: '100%' }}
            zoomControl={true}
            attributionControl={true}
        >
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            <MapController vehicles={vehicles} selectedVehicle={selectedVehicle} />

            {positionedVehicles.map((vehicle) => (
                <Marker
                    key={vehicle.id}
                    position={[vehicle.position.latitude, vehicle.position.longitude]}
                    icon={createPinIcon(vehicle.status, vehicle.id === selectedVehicle)}
                    ref={(ref) => {
                        if (ref) markerRefs.current[vehicle.id] = ref;
                    }}
                    eventHandlers={{
                        click: () => onVehicleSelect(vehicle.id),
                    }}
                >
                    <Popup closeButton={true} offset={[0, -4]}>
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
                    </Popup>
                </Marker>
            ))}
        </MapContainer>
    );
}
