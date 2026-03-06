'use client';

import { useEffect, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

// Status colors matching the design system
const STATUS_COLORS = {
    online: '#22c55e',
    idle: '#f59e0b',
    offline: '#9ca3af',
};

const STATUS_FILL = {
    online: 'rgba(34, 197, 94, 0.25)',
    idle: 'rgba(245, 158, 11, 0.2)',
    offline: 'rgba(156, 163, 175, 0.2)',
};

// India default center
const DEFAULT_CENTER = [20.5937, 78.9629];
const DEFAULT_ZOOM = 5;

// Component to fly to selected vehicle
function FlyToVehicle({ vehicles, selectedVehicle }) {
    const map = useMap();

    useEffect(() => {
        if (!selectedVehicle) return;
        const vehicle = vehicles.find((v) => v.id === selectedVehicle);
        if (vehicle && vehicle.position) {
            map.flyTo(
                [vehicle.position.latitude, vehicle.position.longitude],
                16,
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

// Status label
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

    // Only show vehicles that have positions
    const positionedVehicles = useMemo(
        () => vehicles.filter((v) => v.position && v.position.latitude && v.position.longitude),
        [vehicles]
    );

    // Auto-open popup when selected
    useEffect(() => {
        if (selectedVehicle && markerRefs.current[selectedVehicle]) {
            setTimeout(() => {
                const marker = markerRefs.current[selectedVehicle];
                if (marker) marker.openPopup();
            }, 300);
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

            <FlyToVehicle vehicles={vehicles} selectedVehicle={selectedVehicle} />

            {positionedVehicles.map((vehicle) => (
                <CircleMarker
                    key={vehicle.id}
                    center={[vehicle.position.latitude, vehicle.position.longitude]}
                    radius={vehicle.id === selectedVehicle ? 12 : 9}
                    pathOptions={{
                        color: STATUS_COLORS[vehicle.status],
                        fillColor: vehicle.id === selectedVehicle
                            ? STATUS_COLORS[vehicle.status]
                            : STATUS_FILL[vehicle.status],
                        fillOpacity: vehicle.id === selectedVehicle ? 0.5 : 0.4,
                        weight: vehicle.id === selectedVehicle ? 3 : 2,
                    }}
                    ref={(ref) => {
                        if (ref) markerRefs.current[vehicle.id] = ref;
                    }}
                    eventHandlers={{
                        click: () => onVehicleSelect(vehicle.id),
                    }}
                >
                    <Popup closeButton={true} offset={[0, -5]}>
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
                </CircleMarker>
            ))}
        </MapContainer>
    );
}
