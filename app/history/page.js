'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import NavBar from '@/components/NavBar';
import { apiFetch } from '@/lib/api';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';

const HistoryMapComponent = dynamic(() => import('@/components/HistoryMap'), {
    ssr: false,
    loading: () => (
        <div className="map-loading">
            <div className="map-loading-spinner" />
            <span style={{ color: 'var(--gray-500)', fontSize: '0.875rem' }}>Loading map...</span>
        </div>
    ),
});

const SPEED_OPTIONS = [
    { label: '1×', value: 1000 },
    { label: '2×', value: 500 },
    { label: '5×', value: 200 },
    { label: '10×', value: 100 },
];

function formatDate(dateStr) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleString([], {
        month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}
function formatTime(dateStr) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function HistoryPage() {
    const router = useRouter();
    const [devices, setDevices] = useState([]);
    const [selectedDevice, setSelectedDevice] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [positions, setPositions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [devicesLoading, setDevicesLoading] = useState(true);
    const [error, setError] = useState('');

    // Playback
    const [playbackIndex, setPlaybackIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [playbackSpeed, setPlaybackSpeed] = useState(500);
    const playbackRef = useRef(null);

    // Default dates
    useEffect(() => {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        setDateFrom(`${yyyy}-${mm}-${dd}`);
        setDateTo(`${yyyy}-${mm}-${dd}`);
    }, []);

    // Fetch devices
    useEffect(() => {
        const fetchDevices = async () => {
            const user = await new Promise((resolve) => {
                const unsub = onAuthStateChanged(auth, (u) => { unsub(); resolve(u); });
            });
            if (!user) { router.push('/login'); return; }
            try {
                const res = await apiFetch('/api/devices');
                if (res.status === 401) { router.push('/login'); return; }
                if (res.ok) {
                    const data = await res.json();
                    setDevices(data);
                    if (data.length > 0) setSelectedDevice(String(data[0].id));
                }
            } catch (err) {
                console.error('Error fetching devices:', err);
            } finally {
                setDevicesLoading(false);
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
        setPositions([]);
        try {
            const user = await new Promise((resolve) => {
                const unsub = onAuthStateChanged(auth, (u) => { unsub(); resolve(u); });
            });
            if (!user) { router.push('/login'); return; }
            const fromISO = new Date(`${dateFrom}T00:00:00`).toISOString();
            const toISO = new Date(`${dateTo}T23:59:59`).toISOString();
            const params = new URLSearchParams({ deviceId: selectedDevice, from: fromISO, to: toISO });
            const res = await apiFetch(`/api/history?${params}`);
            if (res.ok) {
                const data = await res.json();
                setPositions(data);
                if (data.length === 0) setError('No route data found for the selected period.');
            } else {
                const body = await res.json().catch(() => ({}));
                setError(body.error || 'Failed to fetch route history.');
            }
        } catch (err) {
            setError('Connection error. Please try again.');
        } finally {
            setLoading(false);
        }
    }, [selectedDevice, dateFrom, dateTo, router]);

    // Playback timer
    useEffect(() => {
        if (isPlaying && positions.length > 0) {
            playbackRef.current = setInterval(() => {
                setPlaybackIndex((prev) => {
                    if (prev >= positions.length - 1) { setIsPlaying(false); return prev; }
                    return prev + 1;
                });
            }, playbackSpeed);
        }
        return () => { if (playbackRef.current) clearInterval(playbackRef.current); };
    }, [isPlaying, playbackSpeed, positions.length]);

    // Stats
    const calcStats = () => {
        if (positions.length < 2) return { distance: 0, duration: '—', maxSpeed: 0, avgSpeed: 0, stops: 0 };
        let totalDistance = 0, stopCount = 0, totalSpeed = 0, maxSpeed = 0, wasStopped = false;
        for (let i = 1; i < positions.length; i++) {
            const prev = positions[i - 1], curr = positions[i];
            const R = 6371;
            const dLat = ((curr.latitude - prev.latitude) * Math.PI) / 180;
            const dLon = ((curr.longitude - prev.longitude) * Math.PI) / 180;
            const a = Math.sin(dLat / 2) ** 2 + Math.cos((prev.latitude * Math.PI) / 180) * Math.cos((curr.latitude * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
            totalDistance += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            const speedKmh = curr.speed * 1.852;
            totalSpeed += speedKmh;
            if (speedKmh > maxSpeed) maxSpeed = speedKmh;
            if (speedKmh < 2) { if (!wasStopped) { stopCount++; wasStopped = true; } } else wasStopped = false;
        }
        const startTime = new Date(positions[0].fixTime);
        const endTime = new Date(positions[positions.length - 1].fixTime);
        const diffMs = endTime - startTime;
        const hours = Math.floor(diffMs / 3600000);
        const minutes = Math.floor((diffMs % 3600000) / 60000);
        return {
            distance: totalDistance.toFixed(1),
            duration: hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`,
            maxSpeed: Math.round(maxSpeed),
            avgSpeed: Math.round(totalSpeed / (positions.length - 1)),
            stops: stopCount,
            points: positions.length,
        };
    };

    const stats = calcStats();
    const currentPos = positions[playbackIndex] || null;
    const selectedDeviceObj = devices.find(d => String(d.id) === selectedDevice);
    const progress = positions.length > 1 ? (playbackIndex / (positions.length - 1)) * 100 : 0;

    const inputStyle = {
        width: '100%', padding: '0.5rem 0.625rem',
        fontSize: '0.875rem', fontFamily: 'var(--font-sans)',
        color: 'var(--gray-800)', background: 'white',
        border: '1px solid var(--gray-300)', borderRadius: 'var(--radius-sm)',
        outline: 'none', boxSizing: 'border-box',
    };

    return (
        <div className="dashboard-shell">
            <NavBar />

            {/* ── Left panel ── */}
            <aside style={{
                width: 270,
                minWidth: 270,
                height: '100vh',
                display: 'flex',
                flexDirection: 'column',
                background: 'white',
                borderRight: '1px solid var(--gray-200)',
                overflow: 'hidden',
                flexShrink: 0,
            }}>
                {/* Panel title */}
                <div style={{ padding: '1.25rem 1.25rem 0.75rem', flexShrink: 0 }}>
                    <h1 style={{ fontSize: '1rem', fontWeight: 400, color: 'var(--gray-800)', margin: 0 }}>Route History</h1>
                </div>

                {/* Controls */}
                <div style={{ padding: '0 1.25rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', flexShrink: 0 }}>
                    {/* Device selector */}
                    {devicesLoading ? (
                        <div style={{ height: 38, display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--gray-600)', fontSize: '0.875rem' }}>
                            <div style={{ width: 14, height: 14, border: '2px solid var(--gray-300)', borderTopColor: 'var(--primary-500)', borderRadius: '50%', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
                            Loading...
                        </div>
                    ) : (
                        <select
                            value={selectedDevice}
                            onChange={(e) => setSelectedDevice(e.target.value)}
                            style={{
                                ...inputStyle,
                                appearance: 'none',
                                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2380868b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
                                backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.75rem center',
                                paddingRight: '2rem', cursor: 'pointer',
                            }}
                        >
                            <option value="">— Select vehicle —</option>
                            {devices.map(d => (
                                <option key={d.id} value={String(d.id)}>{d.name}</option>
                            ))}
                        </select>
                    )}

                    {/* Date row */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--gray-600)', marginBottom: '0.25rem' }}>Start Date</label>
                            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={inputStyle} />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--gray-600)', marginBottom: '0.25rem' }}>End Date</label>
                            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={inputStyle} />
                        </div>
                    </div>

                    {/* Show Route button */}
                    <button
                        onClick={fetchHistory}
                        disabled={loading || !selectedDevice || !dateFrom || !dateTo}
                        style={{
                            width: '100%', padding: '0.625rem 1rem',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                            fontSize: '0.875rem', fontWeight: 500, fontFamily: 'var(--font-sans)',
                            color: 'white', background: 'var(--primary-500)',
                            border: 'none', borderRadius: 'var(--radius-sm)',
                            cursor: loading || !selectedDevice || !dateFrom || !dateTo ? 'not-allowed' : 'pointer',
                            opacity: (!selectedDevice || !dateFrom || !dateTo) ? 0.6 : 1,
                            transition: 'background var(--transition-fast)',
                        }}
                        onMouseEnter={e => { if (!loading && selectedDevice && dateFrom && dateTo) e.currentTarget.style.background = 'var(--primary-600)'; }}
                        onMouseLeave={e => e.currentTarget.style.background = 'var(--primary-500)'}
                    >
                        {loading ? (
                            <>
                                <div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                                Loading…
                            </>
                        ) : 'Show Route'}
                    </button>
                </div>

                <div style={{ flex: 1, overflow: 'auto', borderTop: '1px solid var(--gray-200)' }}>
                    {error && (
                        <div style={{ padding: '1.25rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', color: 'var(--gray-600)' }}>
                            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" style={{ opacity: 0.3 }}>
                                <path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z" /><circle cx="12" cy="10" r="3" />
                            </svg>
                            <p style={{ fontSize: '0.875rem', fontWeight: 400, margin: 0 }}>No Data Selected</p>
                            <p style={{ fontSize: '0.75rem', color: 'var(--gray-500)', margin: 0, textAlign: 'center', lineHeight: 1.5 }}>
                                {error.includes('No route') ? 'No route data found for the selected period.' : error}
                            </p>
                        </div>
                    )}

                    {!error && positions.length === 0 && !loading && (
                        <div style={{ padding: '1.5rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', color: 'var(--gray-500)' }}>
                            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" style={{ opacity: 0.25 }}>
                                <path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z" /><circle cx="12" cy="10" r="3" />
                            </svg>
                            <p style={{ fontSize: '0.875rem', margin: 0 }}>No Data Selected</p>
                            <p style={{ fontSize: '0.75rem', color: 'var(--gray-400)', margin: 0, lineHeight: 1.5 }}>Select a vehicle and date range to view its historical route on the map.</p>
                        </div>
                    )}

                    {positions.length > 0 && (
                        <div style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {/* Stats grid */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                {[
                                    { label: 'Distance', value: `${stats.distance} km` },
                                    { label: 'Duration', value: stats.duration },
                                    { label: 'Max Speed', value: `${stats.maxSpeed} km/h` },
                                    { label: 'Avg Speed', value: `${stats.avgSpeed} km/h` },
                                    { label: 'Stops', value: stats.stops },
                                    { label: 'Points', value: stats.points },
                                ].map(({ label, value }) => (
                                    <div key={label} style={{ background: 'var(--gray-50)', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-sm)', padding: '0.5rem 0.625rem' }}>
                                        <div style={{ fontSize: '0.625rem', fontWeight: 400, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--gray-600)' }}>{label}</div>
                                        <div style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--gray-800)' }}>{value}</div>
                                    </div>
                                ))}
                            </div>

                            {/* Playback controls */}
                            <div>
                                {/* Scrubber */}
                                <div style={{ marginBottom: '0.75rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--gray-500)', marginBottom: '0.375rem' }}>
                                        <span>{positions[0] ? formatTime(positions[0].fixTime) : '—'}</span>
                                        <span>{positions[positions.length - 1] ? formatTime(positions[positions.length - 1].fixTime) : '—'}</span>
                                    </div>
                                    <input
                                        type="range" min="0" max={positions.length - 1} value={playbackIndex}
                                        onChange={e => { setIsPlaying(false); setPlaybackIndex(Number(e.target.value)); }}
                                        style={{ width: '100%', height: 4, cursor: 'pointer', accentColor: 'var(--primary-500)' }}
                                    />
                                </div>

                                {/* Speed buttons */}
                                <div style={{ display: 'flex', gap: '0.375rem', marginBottom: '0.75rem' }}>
                                    {SPEED_OPTIONS.map(({ label, value }) => (
                                        <button key={value} onClick={() => setPlaybackSpeed(value)}
                                            style={{
                                                flex: 1, padding: '0.3rem 0', fontSize: '0.75rem', fontWeight: 500,
                                                background: playbackSpeed === value ? 'var(--primary-50)' : 'var(--gray-50)',
                                                color: playbackSpeed === value ? 'var(--primary-600)' : 'var(--gray-600)',
                                                border: `1px solid ${playbackSpeed === value ? 'var(--primary-200)' : 'var(--gray-200)'}`,
                                                borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontFamily: 'inherit',
                                            }}>
                                            {label}
                                        </button>
                                    ))}
                                </div>

                                {/* Play / Pause / Skip */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.625rem' }}>
                                    <button onClick={() => setPlaybackIndex(0)}
                                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, background: 'var(--gray-50)', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--gray-600)' }}>
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="19 20 9 12 19 4 19 20"></polygon><line x1="5" y1="19" x2="5" y2="5" stroke="currentColor" strokeWidth="2" fill="none"></line></svg>
                                    </button>

                                    <button
                                        onClick={() => { if (playbackIndex >= positions.length - 1) setPlaybackIndex(0); setIsPlaying(!isPlaying); }}
                                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 42, height: 42, borderRadius: '50%', background: isPlaying ? 'var(--danger-500)' : 'var(--primary-500)', border: 'none', color: 'white', cursor: 'pointer', boxShadow: 'var(--shadow-sm)', transition: 'background var(--transition-fast)' }}>
                                        {isPlaying ? (
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
                                        ) : (
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                                        )}
                                    </button>

                                    <button onClick={() => setPlaybackIndex(positions.length - 1)}
                                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, background: 'var(--gray-50)', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--gray-600)' }}>
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 4 15 12 5 20 5 4"></polygon><line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" strokeWidth="2" fill="none"></line></svg>
                                    </button>
                                </div>

                                {/* Current position info */}
                                {currentPos && (
                                    <div style={{ marginTop: '0.75rem', background: 'var(--gray-50)', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-sm)', padding: '0.625rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                        {[
                                            { label: 'Time', value: formatTime(currentPos.fixTime) },
                                            { label: 'Speed', value: `${Math.round(currentPos.speed * 1.852)} km/h` },
                                            { label: 'Lat/Lng', value: `${currentPos.latitude?.toFixed(5)}, ${currentPos.longitude?.toFixed(5)}` },
                                        ].map(({ label, value }) => (
                                            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
                                                <span style={{ color: 'var(--gray-500)' }}>{label}</span>
                                                <span style={{ color: 'var(--gray-800)', fontWeight: 500 }}>{value}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Position log list */}
                            <div>
                                <div style={{ fontSize: '0.65rem', fontWeight: 400, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--gray-600)', marginBottom: '0.5rem' }}>
                                    Position Log ({positions.length})
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', maxHeight: 200, overflowY: 'auto' }}>
                                    {positions.map((pos, i) => (
                                        <button key={i} onClick={() => { setPlaybackIndex(i); setIsPlaying(false); }}
                                            style={{
                                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                padding: '0.375rem 0.625rem', borderRadius: 'var(--radius-sm)',
                                                background: playbackIndex === i ? 'var(--primary-50)' : 'transparent',
                                                border: `1px solid ${playbackIndex === i ? 'var(--primary-200)' : 'transparent'}`,
                                                cursor: 'pointer', fontFamily: 'inherit',
                                                transition: 'background var(--transition-fast)',
                                            }}>
                                            <span style={{ fontSize: '0.75rem', color: playbackIndex === i ? 'var(--primary-600)' : 'var(--gray-600)' }}>{formatTime(pos.fixTime)}</span>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--gray-700)', fontWeight: playbackIndex === i ? 500 : 400 }}>{Math.round(pos.speed * 1.852)} km/h</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </aside>

            {/* ── Map area ── */}
            <div style={{ flex: 1, position: 'relative', height: '100vh', overflow: 'hidden', background: '#eef2f7' }}>
                {positions.length > 0 ? (
                    <HistoryMapComponent
                        positions={positions}
                        playbackIndex={playbackIndex}
                        onMarkerClick={(i) => { setPlaybackIndex(i); setIsPlaying(false); }}
                    />
                ) : (
                    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--gray-500)' }}>
                        <div style={{
                            width: 72, height: 72, borderRadius: '50%',
                            background: 'white', border: '1px solid var(--gray-200)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            marginBottom: '1rem', boxShadow: 'var(--shadow-sm)',
                        }}>
                            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--primary-300)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                            </svg>
                        </div>
                        <p style={{ fontSize: '0.9375rem', fontWeight: 400, margin: '0 0 0.5rem', color: 'var(--gray-700)' }}>No Route Loaded</p>
                        <p style={{ fontSize: '0.8125rem', color: 'var(--gray-500)', margin: 0, textAlign: 'center', lineHeight: 1.6 }}>
                            Select a vehicle &amp; date range,<br />then click <strong>Show Route</strong>
                        </p>
                    </div>
                )}

                {/* Vehicle info overlay (top-right when route loaded) */}
                {positions.length > 0 && selectedDeviceObj && (
                    <div style={{
                        position: 'absolute', top: '1rem', right: '1rem', zIndex: 1000,
                        background: 'white',
                        border: '1px solid var(--gray-300)', borderRadius: 'var(--radius-md)',
                        padding: '0.875rem 1rem', boxShadow: 'var(--shadow-md)',
                        minWidth: '200px',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.625rem' }}>
                            <div style={{ width: 30, height: 30, borderRadius: 'var(--radius-sm)', background: 'var(--primary-50)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--primary-500)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="1" y="3" width="15" height="13" rx="2" />
                                    <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                                    <circle cx="5.5" cy="18.5" r="2.5" />
                                    <circle cx="18.5" cy="18.5" r="2.5" />
                                </svg>
                            </div>
                            <div>
                                <div style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--gray-800)' }}>{selectedDeviceObj.name}</div>
                                <div style={{ fontSize: '0.6875rem', color: 'var(--gray-600)' }}>{selectedDeviceObj.uniqueId}</div>
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.375rem' }}>
                            {[
                                { label: 'Points', value: positions.length },
                                { label: 'Distance', value: `${stats.distance} km` },
                                { label: 'Duration', value: stats.duration },
                                { label: 'Max Speed', value: `${stats.maxSpeed} km/h` },
                            ].map(({ label, value }) => (
                                <div key={label} style={{ background: 'var(--gray-50)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--gray-200)', padding: '0.375rem 0.5rem' }}>
                                    <div style={{ fontSize: '0.6rem', fontWeight: 400, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--gray-600)' }}>{label}</div>
                                    <div style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--gray-800)' }}>{value}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Route Legend */}
                {positions.length > 1 && (
                    <div style={{
                        position: 'absolute', bottom: '1.5rem', right: '1rem', zIndex: 1000,
                        background: 'white',
                        border: '1px solid var(--gray-300)', borderRadius: 'var(--radius-md)',
                        padding: '0.625rem 0.875rem', boxShadow: 'var(--shadow-md)',
                    }}>
                        <div style={{ fontSize: '0.6rem', fontWeight: 400, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--gray-600)', marginBottom: '0.375rem' }}>Legend</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                            {[
                                { color: '#1e8e3e', label: 'Start point' },
                                { color: '#d93025', label: 'End point' },
                                { color: '#1a73e8', label: 'Route path' },
                                { color: '#f9ab00', label: 'Current position' },
                            ].map(({ color, label }) => (
                                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
                                    <span style={{ fontSize: '0.75rem', color: 'var(--gray-700)' }}>{label}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
