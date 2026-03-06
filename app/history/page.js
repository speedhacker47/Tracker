'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';
import dynamic from 'next/dynamic';
import NavBar from '@/components/NavBar';

const HistoryMapComponent = dynamic(() => import('@/components/HistoryMap'), {
    ssr: false,
    loading: () => (
        <div className="map-loading">
            <div className="map-loading-spinner" />
            <span>Loading map...</span>
        </div>
    ),
});

// Playback speed options (ms between frames)
const SPEED_OPTIONS = [
    { label: '1×', value: 1000 },
    { label: '2×', value: 500 },
    { label: '5×', value: 200 },
    { label: '10×', value: 100 },
];

export default function HistoryPage() {
    const router = useRouter();
    const [devices, setDevices] = useState([]);
    const [selectedDevice, setSelectedDevice] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [positions, setPositions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Playback state
    const [playbackIndex, setPlaybackIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [playbackSpeed, setPlaybackSpeed] = useState(500);
    const playbackRef = useRef(null);

    // Set default dates (today)
    useEffect(() => {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        setDateFrom(`${yyyy}-${mm}-${dd}`);
        setDateTo(`${yyyy}-${mm}-${dd}`);
    }, []);

    // Fetch devices on mount
    useEffect(() => {
        const fetchDevices = async () => {
            const token = Cookies.get('trackpro_token');
            if (!token) { router.push('/login'); return; }

            try {
                const res = await fetch('/api/devices', {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (res.ok) {
                    const data = await res.json();
                    setDevices(data);
                    if (data.length > 0) setSelectedDevice(String(data[0].id));
                }
            } catch (err) {
                console.error('Error fetching devices:', err);
            }
        };
        fetchDevices();
    }, [router]);

    // Fetch history
    const fetchHistory = useCallback(async () => {
        if (!selectedDevice || !dateFrom || !dateTo) return;

        setLoading(true);
        setError('');
        setIsPlaying(false);
        setPlaybackIndex(0);

        try {
            const token = Cookies.get('trackpro_token');
            if (!token) { router.push('/login'); return; }

            const fromISO = new Date(`${dateFrom}T00:00:00`).toISOString();
            const toISO = new Date(`${dateTo}T23:59:59`).toISOString();

            const params = new URLSearchParams({
                deviceId: selectedDevice,
                from: fromISO,
                to: toISO,
            });

            const res = await fetch(`/api/history?${params}`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (res.ok) {
                const data = await res.json();
                setPositions(data);
                if (data.length === 0) {
                    setError('No route data found for the selected date range.');
                }
            } else {
                setError('Failed to fetch route history.');
            }
        } catch (err) {
            setError('Connection error. Please try again.');
        } finally {
            setLoading(false);
        }
    }, [selectedDevice, dateFrom, dateTo, router]);

    // Playback logic
    useEffect(() => {
        if (isPlaying && positions.length > 0) {
            playbackRef.current = setInterval(() => {
                setPlaybackIndex((prev) => {
                    if (prev >= positions.length - 1) {
                        setIsPlaying(false);
                        return prev;
                    }
                    return prev + 1;
                });
            }, playbackSpeed);
        }

        return () => {
            if (playbackRef.current) clearInterval(playbackRef.current);
        };
    }, [isPlaying, playbackSpeed, positions.length]);

    // Calculate stats
    const calcStats = () => {
        if (positions.length < 2) return { distance: 0, duration: '—', maxSpeed: 0, avgSpeed: 0, stops: 0 };

        let totalDistance = 0;
        let stopCount = 0;
        let totalSpeed = 0;
        let maxSpeed = 0;
        let wasStopped = false;

        for (let i = 1; i < positions.length; i++) {
            const prev = positions[i - 1];
            const curr = positions[i];

            // Haversine distance
            const R = 6371;
            const dLat = ((curr.latitude - prev.latitude) * Math.PI) / 180;
            const dLon = ((curr.longitude - prev.longitude) * Math.PI) / 180;
            const a =
                Math.sin(dLat / 2) ** 2 +
                Math.cos((prev.latitude * Math.PI) / 180) *
                Math.cos((curr.latitude * Math.PI) / 180) *
                Math.sin(dLon / 2) ** 2;
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            totalDistance += R * c;

            const speedKmh = curr.speed * 1.852;
            totalSpeed += speedKmh;
            if (speedKmh > maxSpeed) maxSpeed = speedKmh;

            // Detect stops (speed < 2 km/h for the point)
            if (speedKmh < 2) {
                if (!wasStopped) { stopCount++; wasStopped = true; }
            } else {
                wasStopped = false;
            }
        }

        const startTime = new Date(positions[0].fixTime);
        const endTime = new Date(positions[positions.length - 1].fixTime);
        const diffMs = endTime - startTime;
        const hours = Math.floor(diffMs / 3600000);
        const minutes = Math.floor((diffMs % 3600000) / 60000);
        const duration = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

        return {
            distance: totalDistance.toFixed(1),
            duration,
            maxSpeed: Math.round(maxSpeed),
            avgSpeed: Math.round(totalSpeed / (positions.length - 1)),
            stops: stopCount,
        };
    };

    const stats = calcStats();
    const currentPos = positions[playbackIndex] || null;

    return (
        <div className="app-layout">
            <NavBar />
            <div className="app-content">
                {/* History Sidebar */}
                <aside className="history-sidebar">
                    <div className="history-sidebar-header">
                        <h2 className="history-sidebar-title">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                            </svg>
                            Route History
                        </h2>
                    </div>

                    {/* Controls */}
                    <div className="history-controls">
                        {/* Device selector */}
                        <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                            <label className="form-label">Vehicle</label>
                            <select
                                className="form-select"
                                value={selectedDevice}
                                onChange={(e) => setSelectedDevice(e.target.value)}
                            >
                                <option value="">Select vehicle</option>
                                {devices.map((d) => (
                                    <option key={d.id} value={d.id}>{d.name} ({d.uniqueId})</option>
                                ))}
                            </select>
                        </div>

                        {/* Date range */}
                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                                <label className="form-label">From</label>
                                <input
                                    type="date"
                                    className="form-input"
                                    value={dateFrom}
                                    onChange={(e) => setDateFrom(e.target.value)}
                                    style={{ fontSize: '0.8125rem', padding: '0.5rem 0.75rem' }}
                                />
                            </div>
                            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                                <label className="form-label">To</label>
                                <input
                                    type="date"
                                    className="form-input"
                                    value={dateTo}
                                    onChange={(e) => setDateTo(e.target.value)}
                                    style={{ fontSize: '0.8125rem', padding: '0.5rem 0.75rem' }}
                                />
                            </div>
                        </div>

                        {/* Fetch button */}
                        <button
                            className="btn-primary"
                            onClick={fetchHistory}
                            disabled={loading || !selectedDevice}
                            style={{ padding: '0.625rem 1rem', fontSize: '0.875rem' }}
                        >
                            {loading ? (
                                <><div className="spinner" style={{ width: 16, height: 16 }} /> Loading...</>
                            ) : (
                                <>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="11" cy="11" r="8" />
                                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                                    </svg>
                                    Show Route
                                </>
                            )}
                        </button>
                    </div>

                    {/* Stats */}
                    {positions.length > 0 && (
                        <div className="history-stats">
                            <div className="history-stat">
                                <div className="history-stat-value">{stats.distance} km</div>
                                <div className="history-stat-label">Distance</div>
                            </div>
                            <div className="history-stat">
                                <div className="history-stat-value">{stats.duration}</div>
                                <div className="history-stat-label">Duration</div>
                            </div>
                            <div className="history-stat">
                                <div className="history-stat-value">{stats.maxSpeed} km/h</div>
                                <div className="history-stat-label">Max Speed</div>
                            </div>
                            <div className="history-stat">
                                <div className="history-stat-value">{stats.avgSpeed} km/h</div>
                                <div className="history-stat-label">Avg Speed</div>
                            </div>
                            <div className="history-stat">
                                <div className="history-stat-value">{stats.stops}</div>
                                <div className="history-stat-label">Stops</div>
                            </div>
                            <div className="history-stat">
                                <div className="history-stat-value">{positions.length}</div>
                                <div className="history-stat-label">Points</div>
                            </div>
                        </div>
                    )}

                    {/* Playback controls */}
                    {positions.length > 1 && (
                        <div className="playback-controls">
                            <div className="playback-header">
                                <span className="playback-label">Playback</span>
                                <div className="playback-speed-btns">
                                    {SPEED_OPTIONS.map((opt) => (
                                        <button
                                            key={opt.value}
                                            className={`playback-speed-btn ${playbackSpeed === opt.value ? 'active' : ''}`}
                                            onClick={() => setPlaybackSpeed(opt.value)}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="playback-slider-row">
                                <input
                                    type="range"
                                    className="playback-slider"
                                    min={0}
                                    max={positions.length - 1}
                                    value={playbackIndex}
                                    onChange={(e) => {
                                        setIsPlaying(false);
                                        setPlaybackIndex(parseInt(e.target.value));
                                    }}
                                />
                            </div>

                            <div className="playback-btn-row">
                                {/* Rewind */}
                                <button
                                    className="playback-btn"
                                    onClick={() => { setIsPlaying(false); setPlaybackIndex(0); }}
                                    title="Rewind"
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <polygon points="19 20 9 12 19 4 19 20" />
                                        <line x1="5" y1="19" x2="5" y2="5" />
                                    </svg>
                                </button>

                                {/* Play/Pause */}
                                <button
                                    className="playback-btn playback-btn-play"
                                    onClick={() => {
                                        if (playbackIndex >= positions.length - 1) {
                                            setPlaybackIndex(0);
                                        }
                                        setIsPlaying(!isPlaying);
                                    }}
                                >
                                    {isPlaying ? (
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                            <rect x="6" y="4" width="4" height="16" rx="1" />
                                            <rect x="14" y="4" width="4" height="16" rx="1" />
                                        </svg>
                                    ) : (
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                            <polygon points="5 3 19 12 5 21 5 3" />
                                        </svg>
                                    )}
                                </button>

                                {/* Forward to end */}
                                <button
                                    className="playback-btn"
                                    onClick={() => { setIsPlaying(false); setPlaybackIndex(positions.length - 1); }}
                                    title="Skip to end"
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <polygon points="5 4 15 12 5 20 5 4" />
                                        <line x1="19" y1="5" x2="19" y2="19" />
                                    </svg>
                                </button>
                            </div>

                            {/* Current position info */}
                            {currentPos && (
                                <div className="playback-info">
                                    <div className="playback-info-row">
                                        <span>Time</span>
                                        <span>{new Date(currentPos.fixTime).toLocaleTimeString()}</span>
                                    </div>
                                    <div className="playback-info-row">
                                        <span>Speed</span>
                                        <span>{Math.round(currentPos.speed * 1.852)} km/h</span>
                                    </div>
                                    <div className="playback-info-row">
                                        <span>Point</span>
                                        <span>{playbackIndex + 1} / {positions.length}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Error */}
                    {error && (
                        <div style={{
                            margin: '1rem',
                            padding: '0.75rem',
                            background: 'var(--warning-50)',
                            border: '1px solid var(--warning-100)',
                            borderRadius: 'var(--radius-md)',
                            color: 'var(--warning-600)',
                            fontSize: '0.8125rem',
                        }}>
                            {error}
                        </div>
                    )}
                </aside>

                {/* Map */}
                <main className="map-container">
                    <HistoryMapComponent
                        positions={positions}
                        playbackIndex={playbackIndex}
                        isPlaying={isPlaying}
                    />
                </main>
            </div>
        </div>
    );
}
