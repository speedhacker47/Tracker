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
            <span>Loading map...</span>
        </div>
    ),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(d) {
    if (!d) return '—';
    return new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}
function formatDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
function fmtDuration(ms) {
    if (!ms) return '—';
    const m = Math.floor(ms / 60000);
    if (m < 60) return `${m}m`;
    return `${Math.floor(m / 60)}h ${m % 60}m`;
}
function knotsToKmh(k) { return Math.round((k || 0) * 1.852); }
function metersToKm(m) { return ((m || 0) / 1000).toFixed(1); }

function shortAddress(addr) {
    if (!addr) return null;
    const parts = addr.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length <= 2) return parts.join(', ');
    return parts.slice(0, 2).join(', ');
}

// ── Stats calculation from raw positions ─────────────────────────────────────

function calcStats(positions) {
    if (positions.length < 2) return { distance: 0, duration: '—', maxSpeed: 0, avgSpeed: 0, stops: 0, points: positions.length };
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
    const diffMs = new Date(positions[positions.length - 1].fixTime) - new Date(positions[0].fixTime);
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
}

// ── Sidebar tab button ────────────────────────────────────────────────────────

function TabBtn({ active, onClick, children }) {
    return (
        <button onClick={onClick} style={{
            flex: 1, padding: '0.5rem 0', fontSize: '0.8rem', fontWeight: active ? 700 : 500,
            fontFamily: 'inherit', border: 'none', cursor: 'pointer',
            borderBottom: active ? '2px solid white' : '2px solid transparent',
            background: 'transparent',
            color: active ? 'white' : 'rgba(255,255,255,0.5)',
            transition: 'all 0.15s',
        }}>
            {children}
        </button>
    );
}

// ── Trip card in sidebar ──────────────────────────────────────────────────────

function TripCard({ trip, index, onClick, active }) {
    const from = shortAddress(trip.startAddress) || `${trip.startLat?.toFixed(4)}, ${trip.startLon?.toFixed(4)}`;
    const to = shortAddress(trip.endAddress) || `${trip.endLat?.toFixed(4)}, ${trip.endLon?.toFixed(4)}`;
    return (
        <div
            onClick={onClick}
            style={{
                padding: '0.875rem 1.125rem',
                borderBottom: '1px solid var(--gray-100)',
                cursor: 'pointer',
                background: active ? 'var(--primary-50)' : 'white',
                borderLeft: active ? '3px solid var(--primary-500)' : '3px solid transparent',
                transition: 'background 0.15s',
            }}
            onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--gray-50)'; }}
            onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'white'; }}
        >
            {/* Trip number + time */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--primary-500)' }}>
                    Trip {index + 1}
                </span>
                <span style={{ fontSize: '0.7rem', color: 'var(--gray-400)' }}>
                    {formatDate(trip.startTime)} · {formatTime(trip.startTime)}
                </span>
            </div>

            {/* From → To */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginBottom: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.375rem' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#16a34a', flexShrink: 0, marginTop: 4 }} />
                    <span style={{ fontSize: '0.75rem', color: 'var(--gray-700)', lineHeight: 1.3 }}>{from}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.375rem' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#dc2626', flexShrink: 0, marginTop: 4 }} />
                    <span style={{ fontSize: '0.75rem', color: 'var(--gray-700)', lineHeight: 1.3 }}>{to}</span>
                </div>
            </div>

            {/* Stats chips */}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {[
                    { icon: '📏', val: `${metersToKm(trip.distance)} km` },
                    { icon: '⏱', val: fmtDuration(trip.duration) },
                    { icon: '⚡', val: `${knotsToKmh(trip.maxSpeed)} km/h` },
                ].map(c => (
                    <span key={c.icon} style={{
                        fontSize: '0.7rem', fontWeight: 600, padding: '0.15rem 0.5rem',
                        borderRadius: '999px', background: 'var(--gray-100)', color: 'var(--gray-600)',
                    }}>
                        {c.icon} {c.val}
                    </span>
                ))}
            </div>
        </div>
    );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HistoryPage() {
    const router = useRouter();
    const playbackRef = useRef(null);

    const [devices, setDevices] = useState([]);
    const [devicesLoading, setDevicesLoading] = useState(true);
    const [selectedDevice, setSelectedDevice] = useState('');

    // Date range
    const today = new Date().toISOString().split('T')[0];
    const [dateFrom, setDateFrom] = useState(today);
    const [dateTo, setDateTo] = useState(today);

    // Raw positions (manual mode)
    const [positions, setPositions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Traccar trips (auto-detected)
    const [trips, setTrips] = useState([]);
    const [tripsLoading, setTripsLoading] = useState(false);
    const [selectedTrip, setSelectedTrip] = useState(null);

    // Playback
    const [playbackIndex, setPlaybackIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [playbackSpeed, setPlaybackSpeed] = useState(200);

    // Sidebar tab: 'manual' | 'trips'
    const [sidebarTab, setSidebarTab] = useState('manual');

    // Load devices on mount
    useEffect(() => {
        const load = async () => {
            const user = await new Promise(resolve => {
                const unsub = onAuthStateChanged(auth, u => { unsub(); resolve(u); });
            });
            if (!user) { router.push('/login'); return; }
            try {
                const res = await apiFetch('/api/devices');
                if (res.status === 401) { router.push('/login'); return; }
                if (res.ok) setDevices(await res.json());
            } catch (e) { console.error(e); }
            finally { setDevicesLoading(false); }
        };
        load();
    }, [router]);

    // Stop playback on positions change
    useEffect(() => {
        setIsPlaying(false);
        setPlaybackIndex(0);
        if (playbackRef.current) clearInterval(playbackRef.current);
    }, [positions]);

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

    // ── Fetch raw history (manual) ────────────────────────────────────────────
    const fetchHistory = useCallback(async () => {
        if (!selectedDevice || !dateFrom || !dateTo) return;
        setLoading(true);
        setError('');
        setPositions([]);
        setIsPlaying(false);
        setPlaybackIndex(0);

        try {
            const from = new Date(dateFrom);
            from.setHours(0, 0, 0, 0);
            const to = new Date(dateTo);
            to.setHours(23, 59, 59, 999);
            const url = `/api/history?deviceId=${selectedDevice}&from=${from.toISOString()}&to=${to.toISOString()}`;
            const res = await apiFetch(url);
            if (res.ok) {
                const data = await res.json();
                if (data.length === 0) setError('No GPS data found for this period.');
                else setPositions(data);
            } else {
                const body = await res.json().catch(() => ({}));
                setError(body.error || 'Failed to fetch route history.');
            }
        } catch (err) {
            setError('Connection error. Please try again.');
        } finally { setLoading(false); }
    }, [selectedDevice, dateFrom, dateTo]);

    // ── Fetch auto-detected trips ─────────────────────────────────────────────
    const fetchTrips = useCallback(async () => {
        if (!selectedDevice || !dateFrom || !dateTo) return;
        setTripsLoading(true);
        setTrips([]);
        setSelectedTrip(null);

        try {
            const from = new Date(dateFrom);
            from.setHours(0, 0, 0, 0);
            const to = new Date(dateTo);
            to.setHours(23, 59, 59, 999);
            const url = `/api/reports/trips?deviceId=${selectedDevice}&from=${from.toISOString()}&to=${to.toISOString()}`;
            const res = await apiFetch(url);
            if (res.ok) {
                const data = await res.json();
                setTrips(Array.isArray(data) ? data : []);
            }
        } catch (e) { console.error(e); }
        finally { setTripsLoading(false); }
    }, [selectedDevice, dateFrom, dateTo]);

    // Load trip positions when a trip card is clicked
    const loadTripPositions = useCallback(async (trip) => {
        setSelectedTrip(trip.id || trip.startTime);
        setPositions([]);
        setIsPlaying(false);
        setPlaybackIndex(0);
        setLoading(true);
        setError('');

        try {
            const from = new Date(trip.startTime);
            const to = new Date(trip.endTime);
            const url = `/api/history?deviceId=${selectedDevice}&from=${from.toISOString()}&to=${to.toISOString()}`;
            const res = await apiFetch(url);
            if (res.ok) {
                const data = await res.json();
                if (data.length > 0) setPositions(data);
                else setError('No GPS points found for this trip.');
            }
        } catch (e) { setError('Failed to load trip route.'); }
        finally { setLoading(false); }
    }, [selectedDevice]);

    const stats = calcStats(positions);
    const currentPos = positions[playbackIndex] || null;
    const selectedDeviceObj = devices.find(d => String(d.id) === selectedDevice);
    const progress = positions.length > 1 ? (playbackIndex / (positions.length - 1)) * 100 : 0;

    const selectStyle = {
        width: '100%', padding: '0.5rem 2rem 0.5rem 0.75rem',
        fontSize: '0.875rem', fontFamily: 'inherit', color: 'var(--gray-800)',
        background: 'white', border: '1.5px solid var(--gray-200)', borderRadius: 'var(--radius-md)',
        outline: 'none', cursor: 'pointer', appearance: 'none',
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.75rem center',
    };

    const labelStyle = {
        display: 'block', fontSize: '0.6875rem', fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: '0.06em',
        color: 'rgba(255,255,255,0.6)', marginBottom: '0.375rem',
    };

    return (
        <div className="dashboard-shell">
            <NavBar />

            {/* ── Sidebar ── */}
            <aside style={{
                width: 320, minWidth: 320, height: '100vh',
                display: 'flex', flexDirection: 'column',
                background: 'white', borderRight: '1px solid var(--gray-200)',
                overflow: 'hidden', flexShrink: 0,
            }}>
                {/* Header */}
                <div style={{
                    padding: '1.25rem 1.25rem 0',
                    background: 'linear-gradient(135deg, #1e3a5f, #2563eb)',
                    flexShrink: 0,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.25rem' }}>
                        <div style={{ width: 32, height: 32, borderRadius: 'var(--radius-md)', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                            </svg>
                        </div>
                        <h2 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'white' }}>Route History</h2>
                    </div>
                    <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)', marginLeft: '2.625rem', marginBottom: '0.875rem' }}>
                        Replay GPS trips &amp; analyze routes
                    </p>

                    {/* Controls row */}
                    <div style={{ padding: '0 0 1rem' }}>
                        <div style={{ marginBottom: '0.625rem' }}>
                            <label style={labelStyle}>Vehicle</label>
                            {devicesLoading ? (
                                <div style={{ ...selectStyle, display: 'flex', alignItems: 'center', color: 'var(--gray-400)' }}>Loading...</div>
                            ) : (
                                <select value={selectedDevice} onChange={e => { setSelectedDevice(e.target.value); setPositions([]); setTrips([]); }} style={selectStyle}>
                                    <option value="">— Select vehicle —</option>
                                    {devices.map(d => <option key={d.id} value={d.id}>{d.name} · {d.uniqueId}</option>)}
                                </select>
                            )}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem' }}>
                            {[{ label: 'From', value: dateFrom, setter: setDateFrom }, { label: 'To', value: dateTo, setter: setDateTo }].map(({ label, value, setter }) => (
                                <div key={label}>
                                    <label style={labelStyle}>{label}</label>
                                    <input type="date" value={value} onChange={e => setter(e.target.value)} style={{ ...selectStyle, backgroundImage: 'none', padding: '0.5rem' }} />
                                </div>
                            ))}
                        </div>

                        {/* Action buttons */}
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button
                                onClick={() => { setSidebarTab('manual'); fetchHistory(); }}
                                disabled={loading || !selectedDevice || !dateFrom || !dateTo}
                                style={{
                                    flex: 1, padding: '0.55rem 0.75rem',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.375rem',
                                    fontSize: '0.8rem', fontWeight: 600, fontFamily: 'inherit',
                                    color: 'white', background: loading ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.2)',
                                    border: '1px solid rgba(255,255,255,0.3)', borderRadius: 'var(--radius-md)',
                                    cursor: loading ? 'not-allowed' : 'pointer',
                                    opacity: !selectedDevice || !dateFrom || !dateTo ? 0.5 : 1,
                                }}>
                                {loading ? <><div className="map-loading-spinner" style={{ width: 12, height: 12, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)', borderTopColor: 'white' }} />Loading…</> : '▶ Show Route'}
                            </button>
                            <button
                                onClick={() => { setSidebarTab('trips'); fetchTrips(); }}
                                disabled={tripsLoading || !selectedDevice || !dateFrom || !dateTo}
                                style={{
                                    flex: 1, padding: '0.55rem 0.75rem',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.375rem',
                                    fontSize: '0.8rem', fontWeight: 600, fontFamily: 'inherit',
                                    color: 'white', background: 'rgba(255,255,255,0.12)',
                                    border: '1px solid rgba(255,255,255,0.2)', borderRadius: 'var(--radius-md)',
                                    cursor: tripsLoading ? 'not-allowed' : 'pointer',
                                    opacity: !selectedDevice || !dateFrom || !dateTo ? 0.5 : 1,
                                }}>
                                {tripsLoading ? <><div className="map-loading-spinner" style={{ width: 12, height: 12, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)', borderTopColor: 'white' }} />Loading…</> : '🗂 Trips List'}
                            </button>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div style={{ display: 'flex', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                        <TabBtn active={sidebarTab === 'manual'} onClick={() => setSidebarTab('manual')}>📍 Route Playback</TabBtn>
                        <TabBtn active={sidebarTab === 'trips'} onClick={() => setSidebarTab('trips')}>🗂 Trips {trips.length > 0 ? `(${trips.length})` : ''}</TabBtn>
                    </div>
                </div>

                {/* ── Tab: Manual / Route Playback ── */}
                {sidebarTab === 'manual' && (
                    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

                        {/* Stats */}
                        {positions.length > 0 && (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', padding: '1rem 1.125rem', borderBottom: '1px solid var(--gray-100)' }}>
                                {[
                                    { label: 'Distance', value: `${stats.distance} km` },
                                    { label: 'Duration', value: stats.duration },
                                    { label: 'Max Speed', value: `${stats.maxSpeed} km/h` },
                                    { label: 'Avg Speed', value: `${stats.avgSpeed} km/h` },
                                    { label: 'Stops', value: stats.stops },
                                    { label: 'Points', value: stats.points },
                                ].map(s => (
                                    <div key={s.label} style={{ textAlign: 'center', padding: '0.5rem 0.25rem', background: 'var(--gray-50)', borderRadius: 'var(--radius-md)' }}>
                                        <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--gray-800)' }}>{s.value}</div>
                                        <div style={{ fontSize: '0.625rem', fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: '0.125rem' }}>{s.label}</div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Playback */}
                        {positions.length > 0 && (
                            <div style={{ padding: '1rem 1.125rem', borderBottom: '1px solid var(--gray-100)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.625rem' }}>
                                    <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--gray-700)' }}>Playback</span>
                                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                                        {[{ speed: 400, label: '0.5×' }, { speed: 200, label: '1×' }, { speed: 100, label: '2×' }, { speed: 50, label: '4×' }].map(s => (
                                            <button key={s.label} onClick={() => setPlaybackSpeed(s.speed)}
                                                style={{ padding: '0.2rem 0.45rem', fontSize: '0.7rem', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', borderRadius: '3px', border: '1px solid', borderColor: playbackSpeed === s.speed ? 'var(--primary-300)' : 'var(--gray-200)', background: playbackSpeed === s.speed ? 'var(--primary-50)' : 'var(--gray-50)', color: playbackSpeed === s.speed ? 'var(--primary-600)' : 'var(--gray-500)' }}>
                                                {s.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Progress bar */}
                                <div style={{ marginBottom: '0.625rem' }}>
                                    <input type="range" min={0} max={positions.length - 1} value={playbackIndex}
                                        onChange={e => { setIsPlaying(false); setPlaybackIndex(Number(e.target.value)); }}
                                        className="playback-slider" style={{ width: '100%' }} />
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--gray-400)', marginTop: '0.25rem' }}>
                                        <span>{formatTime(positions[0]?.fixTime)}</span>
                                        <span>{Math.round(progress)}%</span>
                                        <span>{formatTime(positions[positions.length - 1]?.fixTime)}</span>
                                    </div>
                                </div>

                                {/* Buttons */}
                                <div className="playback-btn-row">
                                    <button className="playback-btn" onClick={() => { setIsPlaying(false); setPlaybackIndex(0); }} title="Restart">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="19 20 9 12 19 4 19 20" /><line x1="5" y1="19" x2="5" y2="5" /></svg>
                                    </button>
                                    <button className="playback-btn" onClick={() => setPlaybackIndex(p => Math.max(0, p - 1))} title="Back">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
                                    </button>
                                    <button className="playback-btn playback-btn-play" onClick={() => setIsPlaying(!isPlaying)} title={isPlaying ? 'Pause' : 'Play'}>
                                        {isPlaying ? (
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="white" stroke="white" strokeWidth="2"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
                                        ) : (
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="white" stroke="white" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                                        )}
                                    </button>
                                    <button className="playback-btn" onClick={() => setPlaybackIndex(p => Math.min(positions.length - 1, p + 1))} title="Forward">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6" /></svg>
                                    </button>
                                    <button className="playback-btn" onClick={() => { setIsPlaying(false); setPlaybackIndex(positions.length - 1); }} title="End">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="5 4 15 12 5 20 5 4" /><line x1="19" y1="5" x2="19" y2="19" /></svg>
                                    </button>
                                </div>

                                {/* Current point info */}
                                {currentPos && (
                                    <div className="playback-info">
                                        {[
                                            { label: 'Time', value: formatTime(currentPos.fixTime) },
                                            { label: 'Speed', value: `${Math.round(currentPos.speed * 1.852)} km/h` },
                                            { label: 'Position', value: `${currentPos.latitude.toFixed(5)}, ${currentPos.longitude.toFixed(5)}` },
                                        ].map(r => (
                                            <div key={r.label} className="playback-info-row">
                                                <span>{r.label}</span><span>{r.value}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Point list */}
                        {positions.length > 0 && (
                            <div style={{ flex: 1, overflowY: 'auto' }}>
                                <div style={{ padding: '0.5rem 1.125rem 0.25rem', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--gray-400)' }}>
                                    {positions.length} GPS Points
                                </div>
                                {positions.map((pos, idx) => (
                                    <button key={idx} onClick={() => { setIsPlaying(false); setPlaybackIndex(idx); }}
                                        style={{
                                            width: '100%', display: 'flex', alignItems: 'center', gap: '0.625rem',
                                            padding: '0.5rem 1.125rem', border: 'none', cursor: 'pointer',
                                            background: playbackIndex === idx ? 'var(--primary-50)' : 'transparent',
                                            transition: 'background 0.1s',
                                        }}
                                        onMouseEnter={e => { if (playbackIndex !== idx) e.currentTarget.style.background = 'var(--gray-50)'; }}
                                        onMouseLeave={e => { if (playbackIndex !== idx) e.currentTarget.style.background = 'transparent'; }}>
                                        <span style={{
                                            width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            background: idx === 0 ? '#dcfce7' : idx === positions.length - 1 ? '#fee2e2' : 'var(--gray-100)',
                                            fontSize: '0.6rem', fontWeight: 700,
                                            color: idx === 0 ? '#16a34a' : idx === positions.length - 1 ? '#dc2626' : 'var(--gray-500)',
                                        }}>
                                            {idx === 0 ? 'S' : idx === positions.length - 1 ? 'E' : idx + 1}
                                        </span>
                                        <div style={{ flex: 1, textAlign: 'left' }}>
                                            <div style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--gray-700)' }}>{formatTime(pos.fixTime)}</div>
                                            <div style={{ fontSize: '0.6875rem', color: 'var(--gray-400)' }}>{Math.round(pos.speed * 1.852)} km/h</div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Error */}
                        {error && (
                            <div style={{ margin: '1rem 1.125rem', padding: '0.75rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--radius-md)', color: '#b91c1c', fontSize: '0.8125rem' }}>
                                {error}
                            </div>
                        )}

                        {/* Empty */}
                        {!loading && positions.length === 0 && !error && (
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2.5rem 1.5rem', textAlign: 'center', color: 'var(--gray-400)' }}>
                                <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" style={{ opacity: 0.35, marginBottom: '1rem' }}>
                                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                                </svg>
                                <p style={{ fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.375rem' }}>No route loaded</p>
                                <p style={{ fontSize: '0.75rem', color: 'var(--gray-300)' }}>Select a vehicle &amp; date range, then click Show Route</p>
                            </div>
                        )}
                    </div>
                )}

                {/* ── Tab: Trips List ── */}
                {sidebarTab === 'trips' && (
                    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                        {tripsLoading ? (
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', padding: '2rem' }}>
                                <div className="map-loading-spinner" style={{ width: 20, height: 20 }} />
                                <span style={{ fontSize: '0.875rem', color: 'var(--gray-400)' }}>Loading trips…</span>
                            </div>
                        ) : trips.length === 0 ? (
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2.5rem 1.5rem', textAlign: 'center', color: 'var(--gray-400)' }}>
                                <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" style={{ opacity: 0.35, marginBottom: '1rem' }}>
                                    <rect x="1" y="3" width="15" height="13" rx="2" />
                                    <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                                    <circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" />
                                </svg>
                                <p style={{ fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.375rem' }}>No trips found</p>
                                <p style={{ fontSize: '0.75rem', color: 'var(--gray-300)' }}>Select a vehicle &amp; date range, then click Trips List</p>
                            </div>
                        ) : (
                            <>
                                <div style={{ padding: '0.625rem 1.125rem', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--gray-400)', borderBottom: '1px solid var(--gray-100)' }}>
                                    {trips.length} auto-detected trips · click to load route
                                </div>
                                {trips.map((trip, i) => (
                                    <TripCard
                                        key={i}
                                        trip={trip}
                                        index={i}
                                        active={selectedTrip === (trip.id || trip.startTime)}
                                        onClick={() => loadTripPositions(trip)}
                                    />
                                ))}
                            </>
                        )}
                        {error && (
                            <div style={{ margin: '1rem 1.125rem', padding: '0.75rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--radius-md)', color: '#b91c1c', fontSize: '0.8125rem' }}>
                                {error}
                            </div>
                        )}
                    </div>
                )}
            </aside>

            {/* ── Map Area ── */}
            <div style={{ flex: 1, position: 'relative', height: '100vh', overflow: 'hidden' }}>
                {loading && (
                    <div style={{ position: 'absolute', top: '1rem', left: '50%', transform: 'translateX(-50%)', zIndex: 1001, background: 'white', borderRadius: 'var(--radius-lg)', padding: '0.625rem 1.25rem', boxShadow: 'var(--shadow-lg)', display: 'flex', alignItems: 'center', gap: '0.625rem', fontSize: '0.875rem', color: 'var(--gray-600)' }}>
                        <div className="map-loading-spinner" style={{ width: 16, height: 16 }} />
                        Loading route…
                    </div>
                )}

                <HistoryMapComponent
                    positions={positions}
                    playbackIndex={playbackIndex}
                    isPlaying={isPlaying}
                />

                {/* Floating vehicle info overlay */}
                {positions.length > 0 && selectedDeviceObj && (
                    <div style={{
                        position: 'absolute', top: '1rem', right: '1rem', zIndex: 1000,
                        background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(12px)',
                        border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-xl)',
                        padding: '0.875rem 1rem', boxShadow: 'var(--shadow-lg)', minWidth: 220,
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.625rem' }}>
                            <div style={{ width: 32, height: 32, borderRadius: 'var(--radius-md)', background: 'var(--primary-50)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--primary-500)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="1" y="3" width="15" height="13" rx="2" />
                                    <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                                    <circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" />
                                </svg>
                            </div>
                            <div>
                                <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--gray-900)' }}>{selectedDeviceObj.name}</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>{selectedDeviceObj.uniqueId}</div>
                            </div>
                        </div>
                        {[
                            { label: 'Distance', value: `${stats.distance} km` },
                            { label: 'Duration', value: stats.duration },
                            { label: 'Points', value: stats.points },
                            { label: 'Max Speed', value: `${stats.maxSpeed} km/h` },
                        ].map(r => (
                            <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', marginBottom: '0.25rem' }}>
                                <span style={{ color: 'var(--gray-500)' }}>{r.label}</span>
                                <span style={{ fontWeight: 600, color: 'var(--gray-800)' }}>{r.value}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}