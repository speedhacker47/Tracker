'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';
import dynamic from 'next/dynamic';
import NavBar from '@/components/NavBar';
import { apiFetch } from '@/lib/api';

const HistoryMapComponent = dynamic(() => import('@/components/HistoryMap'), {
    ssr: false,
    loading: () => (
        <div className="map-loading">
            <div className="map-loading-spinner" />
            <span style={{ color: 'var(--gray-400)', fontSize: '0.875rem' }}>Loading map...</span>
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

function StatCard({ label, value, icon, accent }) {
    return (
        <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '0.875rem 0.5rem', borderRadius: 'var(--radius-lg)',
            background: accent ? `${accent}10` : 'var(--gray-50)',
            border: `1px solid ${accent ? `${accent}25` : 'var(--gray-200)'}`,
            gap: '0.25rem', flex: 1, minWidth: 0,
        }}>
            {icon && <div style={{ color: accent || 'var(--gray-400)', marginBottom: '0.125rem' }}>{icon}</div>}
            <div style={{
                fontSize: '1.125rem', fontWeight: 800, color: accent || 'var(--gray-800)',
                lineHeight: 1, letterSpacing: '-0.02em',
            }}>{value}</div>
            <div style={{
                fontSize: '0.6rem', fontWeight: 600, textTransform: 'uppercase',
                letterSpacing: '0.07em', color: accent || 'var(--gray-400)', opacity: 0.85,
                textAlign: 'center', lineHeight: 1.2,
            }}>{label}</div>
        </div>
    );
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
                const res = await apiFetch('/api/devices', {
                    headers: { Authorization: `Bearer ${token}` },
                });
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
            const token = Cookies.get('trackpro_token');
            if (!token) { router.push('/login'); return; }

            const fromISO = new Date(`${dateFrom}T00:00:00`).toISOString();
            const toISO = new Date(`${dateTo}T23:59:59`).toISOString();
            const params = new URLSearchParams({ deviceId: selectedDevice, from: fromISO, to: toISO });

            const res = await apiFetch(`/api/history?${params}`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (res.ok) {
                const data = await res.json();
                setPositions(data);
                if (data.length === 0) {
                    setError('No route data found for the selected period.');
                }
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
                    if (prev >= positions.length - 1) {
                        setIsPlaying(false);
                        return prev;
                    }
                    return prev + 1;
                });
            }, playbackSpeed);
        }
        return () => { if (playbackRef.current) clearInterval(playbackRef.current); };
    }, [isPlaying, playbackSpeed, positions.length]);

    // Stats calculation
    const calcStats = () => {
        if (positions.length < 2) return { distance: 0, duration: '—', maxSpeed: 0, avgSpeed: 0, stops: 0 };

        let totalDistance = 0, stopCount = 0, totalSpeed = 0, maxSpeed = 0, wasStopped = false;

        for (let i = 1; i < positions.length; i++) {
            const prev = positions[i - 1], curr = positions[i];
            const R = 6371;
            const dLat = ((curr.latitude - prev.latitude) * Math.PI) / 180;
            const dLon = ((curr.longitude - prev.longitude) * Math.PI) / 180;
            const a = Math.sin(dLat / 2) ** 2 +
                Math.cos((prev.latitude * Math.PI) / 180) *
                Math.cos((curr.latitude * Math.PI) / 180) *
                Math.sin(dLon / 2) ** 2;
            totalDistance += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

            const speedKmh = curr.speed * 1.852;
            totalSpeed += speedKmh;
            if (speedKmh > maxSpeed) maxSpeed = speedKmh;
            if (speedKmh < 2) { if (!wasStopped) { stopCount++; wasStopped = true; } }
            else wasStopped = false;
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
            points: positions.length,
        };
    };

    const stats = calcStats();
    const currentPos = positions[playbackIndex] || null;
    const selectedDeviceObj = devices.find(d => String(d.id) === selectedDevice);
    const progress = positions.length > 1 ? (playbackIndex / (positions.length - 1)) * 100 : 0;

    return (
        <div className="dashboard-shell">
            <NavBar />

            {/* ── Sidebar ── */}
            <aside style={{
                width: 320,
                minWidth: 320,
                height: '100vh',
                display: 'flex',
                flexDirection: 'column',
                background: 'white',
                borderRight: '1px solid var(--gray-200)',
                overflow: 'hidden',
                flexShrink: 0,
            }}>
                {/* Sidebar Header */}
                <div style={{
                    padding: '1.25rem 1.25rem 1rem',
                    borderBottom: '1px solid var(--gray-100)',
                    background: 'linear-gradient(135deg, #1e3a5f, #2563eb)',
                    flexShrink: 0,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.25rem' }}>
                        <div style={{
                            width: 32, height: 32, borderRadius: 'var(--radius-md)',
                            background: 'rgba(255,255,255,0.15)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                            </svg>
                        </div>
                        <h2 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'white', letterSpacing: '-0.01em' }}>Route History</h2>
                    </div>
                    <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)', marginLeft: '2.625rem' }}>
                        Replay GPS trips &amp; analyze routes
                    </p>
                </div>

                {/* Scrollable content */}
                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

                    {/* ── Controls ── */}
                    <div style={{ padding: '1.125rem 1.25rem', borderBottom: '1px solid var(--gray-100)' }}>

                        {/* Vehicle selector */}
                        <div style={{ marginBottom: '0.875rem' }}>
                            <label style={{
                                display: 'block', fontSize: '0.6875rem', fontWeight: 600,
                                textTransform: 'uppercase', letterSpacing: '0.06em',
                                color: 'var(--gray-500)', marginBottom: '0.375rem',
                            }}>
                                Vehicle
                            </label>
                            {devicesLoading ? (
                                <div style={{
                                    height: 38, borderRadius: 'var(--radius-md)',
                                    background: 'var(--gray-100)', border: '1.5px solid var(--gray-200)',
                                    display: 'flex', alignItems: 'center', padding: '0 0.75rem',
                                    gap: '0.5rem', color: 'var(--gray-400)', fontSize: '0.875rem',
                                }}>
                                    <div style={{ width: 14, height: 14, border: '2px solid var(--gray-300)', borderTopColor: 'var(--primary-400)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                                    Loading vehicles...
                                </div>
                            ) : (
                                <select
                                    value={selectedDevice}
                                    onChange={(e) => setSelectedDevice(e.target.value)}
                                    style={{
                                        width: '100%', padding: '0.5625rem 2rem 0.5625rem 0.75rem',
                                        fontSize: '0.875rem', fontFamily: 'var(--font-sans)',
                                        color: 'var(--gray-800)', background: 'white',
                                        border: '1.5px solid var(--gray-200)', borderRadius: 'var(--radius-md)',
                                        outline: 'none', cursor: 'pointer', appearance: 'none',
                                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
                                        backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.75rem center',
                                        transition: 'all var(--transition-fast)',
                                    }}
                                >
                                    <option value="">— Select vehicle —</option>
                                    {devices.map((d) => (
                                        <option key={d.id} value={d.id}>{d.name} · {d.uniqueId}</option>
                                    ))}
                                </select>
                            )}
                        </div>

                        {/* Date range */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.875rem' }}>
                            {[
                                { label: 'From', value: dateFrom, setter: setDateFrom },
                                { label: 'To', value: dateTo, setter: setDateTo },
                            ].map(({ label, value, setter }) => (
                                <div key={label}>
                                    <label style={{
                                        display: 'block', fontSize: '0.6875rem', fontWeight: 600,
                                        textTransform: 'uppercase', letterSpacing: '0.06em',
                                        color: 'var(--gray-500)', marginBottom: '0.375rem',
                                    }}>{label}</label>
                                    <input
                                        type="date"
                                        value={value}
                                        onChange={(e) => setter(e.target.value)}
                                        style={{
                                            width: '100%', padding: '0.5rem 0.5rem',
                                            fontSize: '0.8125rem', fontFamily: 'var(--font-sans)',
                                            color: 'var(--gray-800)', background: 'white',
                                            border: '1.5px solid var(--gray-200)', borderRadius: 'var(--radius-md)',
                                            outline: 'none', transition: 'all var(--transition-fast)',
                                        }}
                                    />
                                </div>
                            ))}
                        </div>

                        {/* Show Route button */}
                        <button
                            onClick={fetchHistory}
                            disabled={loading || !selectedDevice || !dateFrom || !dateTo}
                            style={{
                                width: '100%', padding: '0.625rem 1rem',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                                fontSize: '0.875rem', fontWeight: 600, fontFamily: 'var(--font-sans)',
                                color: 'white',
                                background: loading ? 'var(--primary-400)' : 'linear-gradient(135deg, var(--primary-500), var(--primary-600))',
                                border: 'none', borderRadius: 'var(--radius-md)', cursor: loading ? 'not-allowed' : 'pointer',
                                boxShadow: '0 2px 8px rgba(59,130,246,0.25)',
                                transition: 'all var(--transition-fast)',
                                opacity: (!selectedDevice || !dateFrom || !dateTo) ? 0.6 : 1,
                            }}
                        >
                            {loading ? (
                                <>
                                    <div style={{ width: 15, height: 15, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                                    Fetching route...
                                </>
                            ) : (
                                <>
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <polygon points="5 3 19 12 5 21 5 3" />
                                    </svg>
                                    Show Route
                                </>
                            )}
                        </button>
                    </div>

                    {/* ── Error state ── */}
                    {error && (
                        <div style={{
                            margin: '1rem 1.25rem',
                            padding: '0.75rem 1rem',
                            background: '#fffbeb', border: '1px solid #fef3c7',
                            borderRadius: 'var(--radius-md)',
                            display: 'flex', alignItems: 'flex-start', gap: '0.5rem',
                        }}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" style={{ flexShrink: 0, marginTop: 1 }}>
                                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                            </svg>
                            <span style={{ fontSize: '0.8125rem', color: '#92400e' }}>{error}</span>
                        </div>
                    )}

                    {/* ── Stats ── */}
                    {positions.length >= 2 && (
                        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--gray-100)' }}>
                            <div style={{
                                fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase',
                                letterSpacing: '0.07em', color: 'var(--gray-400)', marginBottom: '0.625rem',
                            }}>Trip Summary</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                <StatCard label="Distance" value={`${stats.distance}km`} accent="#3b82f6"
                                    icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z" /><path d="M8 2v16" /><path d="M16 6v16" /></svg>} />
                                <StatCard label="Duration" value={stats.duration} accent="#8b5cf6"
                                    icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>} />
                                <StatCard label="Stops" value={stats.stops} accent="#f59e0b"
                                    icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /></svg>} />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                                <StatCard label="Max Speed" value={`${stats.maxSpeed}`} accent="#ef4444"
                                    icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>} />
                                <StatCard label="Avg Speed" value={`${stats.avgSpeed}`} accent="#22c55e"
                                    icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>} />
                                <StatCard label="Points" value={stats.points}
                                    icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /></svg>} />
                            </div>
                        </div>
                    )}

                    {/* ── Playback ── */}
                    {positions.length > 1 && (
                        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--gray-100)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                                <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--gray-700)' }}>Playback</span>
                                {/* Speed buttons */}
                                <div style={{ display: 'flex', gap: '0.25rem' }}>
                                    {SPEED_OPTIONS.map((opt) => (
                                        <button
                                            key={opt.value}
                                            onClick={() => setPlaybackSpeed(opt.value)}
                                            style={{
                                                padding: '0.2rem 0.45rem', fontSize: '0.6875rem', fontWeight: 600,
                                                fontFamily: 'var(--font-sans)',
                                                color: playbackSpeed === opt.value ? 'var(--primary-600)' : 'var(--gray-400)',
                                                background: playbackSpeed === opt.value ? 'var(--primary-50)' : 'var(--gray-50)',
                                                border: `1px solid ${playbackSpeed === opt.value ? 'var(--primary-200)' : 'var(--gray-200)'}`,
                                                borderRadius: 4, cursor: 'pointer',
                                                transition: 'all var(--transition-fast)',
                                            }}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Progress bar */}
                            <div style={{ marginBottom: '0.875rem' }}>
                                <div style={{
                                    display: 'flex', justifyContent: 'space-between',
                                    fontSize: '0.6875rem', color: 'var(--gray-400)', marginBottom: '0.375rem',
                                }}>
                                    <span>{formatTime(positions[0]?.fixTime)}</span>
                                    <span style={{ color: 'var(--primary-500)', fontWeight: 600 }}>
                                        {playbackIndex + 1} / {positions.length}
                                    </span>
                                    <span>{formatTime(positions[positions.length - 1]?.fixTime)}</span>
                                </div>
                                <input
                                    type="range"
                                    min={0}
                                    max={positions.length - 1}
                                    value={playbackIndex}
                                    onChange={(e) => { setIsPlaying(false); setPlaybackIndex(parseInt(e.target.value)); }}
                                    style={{
                                        width: '100%', height: '6px', WebkitAppearance: 'none',
                                        appearance: 'none', borderRadius: 'var(--radius-full)', outline: 'none',
                                        cursor: 'pointer',
                                        background: `linear-gradient(to right, var(--primary-500) ${progress}%, var(--gray-200) ${progress}%)`,
                                    }}
                                />
                            </div>

                            {/* Playback controls */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                                {/* Rewind */}
                                <button onClick={() => { setIsPlaying(false); setPlaybackIndex(0); }}
                                    style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        width: 34, height: 34, border: '1px solid var(--gray-200)',
                                        borderRadius: 'var(--radius-md)', background: 'white',
                                        color: 'var(--gray-500)', cursor: 'pointer',
                                        transition: 'all var(--transition-fast)',
                                    }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <polygon points="19 20 9 12 19 4 19 20" /><line x1="5" y1="19" x2="5" y2="5" />
                                    </svg>
                                </button>

                                {/* Play/Pause */}
                                <button
                                    onClick={() => {
                                        if (playbackIndex >= positions.length - 1) setPlaybackIndex(0);
                                        setIsPlaying(!isPlaying);
                                    }}
                                    style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        width: 44, height: 44, borderRadius: '50%',
                                        background: isPlaying
                                            ? 'linear-gradient(135deg, #ef4444, #dc2626)'
                                            : 'linear-gradient(135deg, var(--primary-500), var(--primary-600))',
                                        border: 'none', color: 'white', cursor: 'pointer',
                                        boxShadow: isPlaying ? '0 2px 8px rgba(239,68,68,0.35)' : '0 2px 8px rgba(59,130,246,0.35)',
                                        transition: 'all var(--transition-fast)',
                                    }}>
                                    {isPlaying ? (
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                            <rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" />
                                        </svg>
                                    ) : (
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                            <polygon points="5 3 19 12 5 21 5 3" />
                                        </svg>
                                    )}
                                </button>

                                {/* Skip to end */}
                                <button onClick={() => { setIsPlaying(false); setPlaybackIndex(positions.length - 1); }}
                                    style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        width: 34, height: 34, border: '1px solid var(--gray-200)',
                                        borderRadius: 'var(--radius-md)', background: 'white',
                                        color: 'var(--gray-500)', cursor: 'pointer',
                                        transition: 'all var(--transition-fast)',
                                    }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <polygon points="5 4 15 12 5 20 5 4" /><line x1="19" y1="5" x2="19" y2="19" />
                                    </svg>
                                </button>
                            </div>

                            {/* Current position info */}
                            {currentPos && (
                                <div style={{
                                    background: 'var(--gray-50)', border: '1px solid var(--gray-200)',
                                    borderRadius: 'var(--radius-md)', padding: '0.625rem 0.75rem',
                                    display: 'flex', flexDirection: 'column', gap: '0.3125rem',
                                }}>
                                    {[
                                        { label: 'Time', value: formatTime(currentPos.fixTime) },
                                        { label: 'Speed', value: `${Math.round(currentPos.speed * 1.852)} km/h` },
                                        { label: 'Altitude', value: `${Math.round(currentPos.altitude || 0)} m` },
                                        { label: 'Course', value: `${Math.round(currentPos.course || 0)}°` },
                                    ].map(({ label, value }) => (
                                        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--gray-400)', fontWeight: 500 }}>{label}</span>
                                            <span style={{ fontSize: '0.8125rem', color: 'var(--gray-800)', fontWeight: 600 }}>{value}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Point list (scrollable log) ── */}
                    {positions.length > 0 && (
                        <div style={{ padding: '0.875rem 1.25rem' }}>
                            <div style={{
                                fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase',
                                letterSpacing: '0.07em', color: 'var(--gray-400)', marginBottom: '0.625rem',
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            }}>
                                <span>Position Log</span>
                                <span style={{ color: 'var(--primary-500)' }}>{positions.length} points</span>
                            </div>
                            <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                {positions.map((pos, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => { setIsPlaying(false); setPlaybackIndex(idx); }}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                                            padding: '0.4rem 0.625rem',
                                            borderRadius: 'var(--radius-sm)',
                                            border: `1px solid ${idx === playbackIndex ? 'var(--primary-200)' : 'transparent'}`,
                                            background: idx === playbackIndex ? 'var(--primary-50)' : 'transparent',
                                            cursor: 'pointer', textAlign: 'left',
                                            transition: 'all var(--transition-fast)',
                                            fontFamily: 'var(--font-sans)',
                                        }}
                                    >
                                        <span style={{
                                            width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            background: idx === 0 ? '#dcfce7' : idx === positions.length - 1 ? '#fee2e2' : 'var(--gray-100)',
                                            fontSize: '0.6rem', fontWeight: 700,
                                            color: idx === 0 ? '#16a34a' : idx === positions.length - 1 ? '#dc2626' : 'var(--gray-500)',
                                        }}>
                                            {idx === 0 ? 'S' : idx === positions.length - 1 ? 'E' : idx + 1}
                                        </span>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--gray-700)' }}>
                                                {formatTime(pos.fixTime)}
                                            </div>
                                            <div style={{ fontSize: '0.6875rem', color: 'var(--gray-400)' }}>
                                                {Math.round(pos.speed * 1.852)} km/h
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Empty state */}
                    {!loading && positions.length === 0 && !error && (
                        <div style={{
                            flex: 1, display: 'flex', flexDirection: 'column',
                            alignItems: 'center', justifyContent: 'center',
                            padding: '2.5rem 1.5rem', textAlign: 'center',
                            color: 'var(--gray-400)',
                        }}>
                            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" style={{ opacity: 0.35, marginBottom: '1rem' }}>
                                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                            </svg>
                            <p style={{ fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.375rem' }}>No route loaded</p>
                            <p style={{ fontSize: '0.75rem', color: 'var(--gray-300)' }}>Select a vehicle &amp; date range,<br />then click Show Route</p>
                        </div>
                    )}
                </div>
            </aside>

            {/* ── Map Area ── */}
            <div style={{ flex: 1, position: 'relative', height: '100vh', overflow: 'hidden' }}>
                <HistoryMapComponent
                    positions={positions}
                    playbackIndex={playbackIndex}
                    isPlaying={isPlaying}
                />

                {/* Floating overlay — vehicle info when data is loaded */}
                {positions.length > 0 && selectedDeviceObj && (
                    <div style={{
                        position: 'absolute', top: '1rem', right: '1rem', zIndex: 1000,
                        background: 'rgba(255,255,255,0.95)',
                        backdropFilter: 'blur(12px)',
                        border: '1px solid var(--gray-200)',
                        borderRadius: 'var(--radius-xl)',
                        padding: '0.875rem 1rem',
                        boxShadow: 'var(--shadow-lg)',
                        minWidth: '220px',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.625rem' }}>
                            <div style={{
                                width: 32, height: 32, borderRadius: 'var(--radius-md)',
                                background: 'linear-gradient(135deg, var(--primary-100), var(--primary-50))',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--primary-500)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="1" y="3" width="15" height="13" rx="2" />
                                    <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                                    <circle cx="5.5" cy="18.5" r="2.5" />
                                    <circle cx="18.5" cy="18.5" r="2.5" />
                                </svg>
                            </div>
                            <div>
                                <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--gray-900)' }}>{selectedDeviceObj.name}</div>
                                <div style={{ fontSize: '0.6875rem', color: 'var(--gray-400)' }}>{selectedDeviceObj.uniqueId}</div>
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.375rem' }}>
                            {[
                                { label: 'Points', value: positions.length },
                                { label: 'Distance', value: `${stats.distance} km` },
                                { label: 'Max Speed', value: `${stats.maxSpeed} km/h` },
                                { label: 'Duration', value: stats.duration },
                            ].map(({ label, value }) => (
                                <div key={label} style={{
                                    background: 'var(--gray-50)', borderRadius: 'var(--radius-sm)',
                                    padding: '0.375rem 0.5rem',
                                }}>
                                    <div style={{ fontSize: '0.6rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--gray-400)' }}>{label}</div>
                                    <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--gray-800)' }}>{value}</div>
                                </div>
                            ))}
                        </div>

                        {/* Playback status */}
                        {isPlaying && (
                            <div style={{
                                marginTop: '0.625rem', padding: '0.375rem 0.625rem',
                                background: 'var(--primary-50)', borderRadius: 'var(--radius-md)',
                                display: 'flex', alignItems: 'center', gap: '0.375rem',
                                border: '1px solid var(--primary-100)',
                            }}>
                                <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--primary-500)', animation: 'pulse-green 1s infinite' }} />
                                <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--primary-600)' }}>
                                    Playing · {playbackIndex + 1}/{positions.length}
                                </span>
                            </div>
                        )}
                    </div>
                )}

                {/* Route Legend */}
                {positions.length > 1 && (
                    <div style={{
                        position: 'absolute', bottom: '1.5rem', right: '1rem', zIndex: 1000,
                        background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(12px)',
                        border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-lg)',
                        padding: '0.625rem 0.875rem', boxShadow: 'var(--shadow-md)',
                    }}>
                        <div style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--gray-400)', marginBottom: '0.375rem' }}>Legend</div>
                        {[
                            { color: '#22c55e', label: 'Start point' },
                            { color: '#3b82f6', label: 'Traveled route' },
                            { color: '#d1d5db', label: 'Remaining route' },
                            { color: '#ef4444', label: 'End point' },
                        ].map(({ color, label }) => (
                            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                                <span style={{ width: 24, height: 4, borderRadius: 2, background: color, flexShrink: 0 }} />
                                <span style={{ fontSize: '0.75rem', color: 'var(--gray-600)' }}>{label}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
