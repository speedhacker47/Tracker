'use client';

import { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import { GoogleMap, useJsApiLoader, PolylineF, MarkerF, InfoWindowF } from '@react-google-maps/api';

const ROUTE_COLOR = '#3b82f6';
const MARKER_COLOR = '#2563eb';
const START_COLOR = '#22c55e';
const END_COLOR = '#ef4444';

// Format time
function formatTime(dateStr) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const mapContainerStyle = {
    height: '100%',
    width: '100%'
};

// SVG icons for markers
function createCircleIcon(color, size = 16) {
    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" fill="${color}" fill-opacity="0.8" stroke="white" stroke-width="2"/>
        </svg>
    `.trim();

    return {
        url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
        scaledSize: typeof window !== 'undefined' && window.google ? new window.google.maps.Size(size, size) : null,
        anchor: typeof window !== 'undefined' && window.google ? new window.google.maps.Point(size / 2, size / 2) : null,
    };
}

export default function HistoryMap({ positions, playbackIndex, isPlaying }) {
    const { isLoaded } = useJsApiLoader({
        id: 'google-map-script',
        googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''
    });

    const [map, setMap] = useState(null);
    const [selectedMarker, setSelectedMarker] = useState(null); // 'start', 'end', or 'current'

    const onLoad = useCallback(function callback(map) {
        setMap(map);
    }, []);

    const onUnmount = useCallback(function callback(map) {
        setMap(null);
    }, []);

    const routeCoords = useMemo(
        () => positions.map((p) => ({ lat: p.latitude, lng: p.longitude })),
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

    useEffect(() => {
        if (map && positions.length > 0 && window.google) {
            const bounds = new window.google.maps.LatLngBounds();
            positions.forEach(p => {
                bounds.extend({ lat: p.latitude, lng: p.longitude });
            });
            map.fitBounds(bounds, { bottom: 50, top: 50, left: 50, right: 50 });
        }
    }, [map, positions]);

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

    if (!isLoaded) {
        return <div className="flex h-full w-full items-center justify-center bg-gray-50 text-gray-400">Loading Maps...</div>;
    }

    return (
        <GoogleMap
            mapContainerStyle={mapContainerStyle}
            center={{ lat: 20.5937, lng: 78.9629 }}
            zoom={5}
            onLoad={onLoad}
            onUnmount={onUnmount}
            options={{
                mapTypeControl: false,
                streetViewControl: false,
                fullscreenControl: true,
                zoomControl: true,
            }}
        >
            {/* Full route (gray) */}
            {routeCoords.length > 1 && (
                <PolylineF
                    path={routeCoords}
                    options={{
                        strokeColor: '#d1d5db',
                        strokeOpacity: 0.6,
                        strokeWeight: 3,
                    }}
                />
            )}

            {/* Traveled route (blue) */}
            {traveledCoords.length > 1 && (
                <PolylineF
                    path={traveledCoords}
                    options={{
                        strokeColor: ROUTE_COLOR,
                        strokeOpacity: 0.9,
                        strokeWeight: 4,
                    }}
                />
            )}

            {/* Start marker */}
            {startPos && (
                <MarkerF
                    position={{ lat: startPos.latitude, lng: startPos.longitude }}
                    icon={createCircleIcon(START_COLOR, 16)}
                    onClick={() => setSelectedMarker('start')}
                    zIndex={800}
                >
                    {selectedMarker === 'start' && (
                        <InfoWindowF
                            position={{ lat: startPos.latitude, lng: startPos.longitude }}
                            onCloseClick={() => setSelectedMarker(null)}
                            options={{ pixelOffset: new window.google.maps.Size(0, -8) }}
                        >
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
                        </InfoWindowF>
                    )}
                </MarkerF>
            )}

            {/* End marker */}
            {endPos && positions.length > 1 && (
                <MarkerF
                    position={{ lat: endPos.latitude, lng: endPos.longitude }}
                    icon={createCircleIcon(END_COLOR, 16)}
                    onClick={() => setSelectedMarker('end')}
                    zIndex={800}
                >
                    {selectedMarker === 'end' && (
                        <InfoWindowF
                            position={{ lat: endPos.latitude, lng: endPos.longitude }}
                            onCloseClick={() => setSelectedMarker(null)}
                            options={{ pixelOffset: new window.google.maps.Size(0, -8) }}
                        >
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
                        </InfoWindowF>
                    )}
                </MarkerF>
            )}

            {/* Current playback marker */}
            {currentPos && (
                <MarkerF
                    position={{ lat: currentPos.latitude, lng: currentPos.longitude }}
                    icon={createCircleIcon(MARKER_COLOR, 20)}
                    onClick={() => setSelectedMarker('current')}
                    zIndex={900}
                >
                    {selectedMarker === 'current' && (
                        <InfoWindowF
                            position={{ lat: currentPos.latitude, lng: currentPos.longitude }}
                            onCloseClick={() => setSelectedMarker(null)}
                            options={{ pixelOffset: new window.google.maps.Size(0, -10) }}
                        >
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
                        </InfoWindowF>
                    )}
                </MarkerF>
            )}
        </GoogleMap>
    );
}
