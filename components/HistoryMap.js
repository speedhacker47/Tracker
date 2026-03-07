'use client';

import { useEffect, useRef, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const ROUTE_COLOR = '#3b82f6';
const MARKER_COLOR = '#2563eb';
const START_COLOR = '#22c55e';
const END_COLOR = '#ef4444';

// Fit map bounds to route
function FitBounds({ positions }) {
    const map = useMap();

    useEffect(() => {
        if (positions.length > 0) {
            const bounds = positions.map((p) => [p.latitude, p.longitude]);
            map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
        }
    }, [positions, map]);

    return null;
}

// Format time
function formatTime(dateStr) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function HistoryMap({ positions, playbackIndex, isPlaying }) {
    const routeCoords = useMemo(
        () => positions.map((p) => [p.latitude, p.longitude]),
        [positions]
    );

    // Route up to current playback position
    const traveledCoords = useMemo(
        () => routeCoords.slice(0, playbackIndex + 1),
        [routeCoords, playbackIndex]
    );

    const currentPos = positions[playbackIndex] || null;
    const startPos = positions[0] || null;
    const endPos = positions[positions.length - 1] || null;

    if (positions.length === 0) {
        return (
            <div style={{
                height: '100%', width: '100%',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                background: 'linear-gradient(135deg, #f8faff 0%, #f0f4ff 100%)',
                gap: '1rem',
            }}>
                <div style={{
                    width: 72, height: 72, borderRadius: '50%',
                    background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 4px 20px rgba(59,130,246,0.1)',
                    border: '1px solid rgba(59,130,246,0.1)',
                }}>
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--primary-300)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                    </svg>
                </div>
                <div style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--gray-600)', marginBottom: '0.375rem' }}>No Route Loaded</p>
                    <p style={{ fontSize: '0.8125rem', color: 'var(--gray-400)' }}>Select a vehicle &amp; date range,<br />then click <strong>Show Route</strong></p>
                </div>
            </div>
        );
    }

    return (
        <MapContainer
            center={[20.5937, 78.9629]}
            zoom={5}
            style={{ height: '100%', width: '100%' }}
            zoomControl={true}
        >
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            <FitBounds positions={positions} />

            {/* Full route (gray) */}
            {routeCoords.length > 1 && (
                <Polyline
                    positions={routeCoords}
                    pathOptions={{
                        color: '#d1d5db',
                        weight: 3,
                        opacity: 0.6,
                        dashArray: '8, 8',
                    }}
                />
            )}

            {/* Traveled route (blue) */}
            {traveledCoords.length > 1 && (
                <Polyline
                    positions={traveledCoords}
                    pathOptions={{
                        color: ROUTE_COLOR,
                        weight: 4,
                        opacity: 0.9,
                    }}
                />
            )}

            {/* Start marker */}
            {startPos && (
                <CircleMarker
                    center={[startPos.latitude, startPos.longitude]}
                    radius={8}
                    pathOptions={{
                        color: START_COLOR,
                        fillColor: START_COLOR,
                        fillOpacity: 0.8,
                        weight: 2,
                    }}
                >
                    <Popup>
                        <div className="popup-content">
                            <div className="popup-title" style={{ color: START_COLOR }}>▶ Start</div>
                            <div className="popup-details">
                                <div className="popup-row">
                                    <span className="popup-row-label">Time</span>
                                    <span className="popup-row-value">{formatTime(startPos.fixTime)}</span>
                                </div>
                                <div className="popup-row">
                                    <span className="popup-row-label">Speed</span>
                                    <span className="popup-row-value">{Math.round(startPos.speed * 1.852)} km/h</span>
                                </div>
                            </div>
                        </div>
                    </Popup>
                </CircleMarker>
            )}

            {/* End marker */}
            {endPos && positions.length > 1 && (
                <CircleMarker
                    center={[endPos.latitude, endPos.longitude]}
                    radius={8}
                    pathOptions={{
                        color: END_COLOR,
                        fillColor: END_COLOR,
                        fillOpacity: 0.8,
                        weight: 2,
                    }}
                >
                    <Popup>
                        <div className="popup-content">
                            <div className="popup-title" style={{ color: END_COLOR }}>■ End</div>
                            <div className="popup-details">
                                <div className="popup-row">
                                    <span className="popup-row-label">Time</span>
                                    <span className="popup-row-value">{formatTime(endPos.fixTime)}</span>
                                </div>
                                <div className="popup-row">
                                    <span className="popup-row-label">Speed</span>
                                    <span className="popup-row-value">{Math.round(endPos.speed * 1.852)} km/h</span>
                                </div>
                            </div>
                        </div>
                    </Popup>
                </CircleMarker>
            )}

            {/* Current playback marker */}
            {currentPos && (
                <CircleMarker
                    center={[currentPos.latitude, currentPos.longitude]}
                    radius={10}
                    pathOptions={{
                        color: MARKER_COLOR,
                        fillColor: MARKER_COLOR,
                        fillOpacity: 0.9,
                        weight: 3,
                    }}
                >
                    <Popup>
                        <div className="popup-content">
                            <div className="popup-title">Current Position</div>
                            <div className="popup-details">
                                <div className="popup-row">
                                    <span className="popup-row-label">Time</span>
                                    <span className="popup-row-value">{formatTime(currentPos.fixTime)}</span>
                                </div>
                                <div className="popup-row">
                                    <span className="popup-row-label">Speed</span>
                                    <span className="popup-row-value">{Math.round(currentPos.speed * 1.852)} km/h</span>
                                </div>
                                <div className="popup-row">
                                    <span className="popup-row-label">Coords</span>
                                    <span className="popup-row-value" style={{ fontSize: '0.75rem' }}>
                                        {currentPos.latitude.toFixed(5)}, {currentPos.longitude.toFixed(5)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </Popup>
                </CircleMarker>
            )}
        </MapContainer>
    );
}
