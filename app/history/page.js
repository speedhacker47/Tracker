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
        <div className="map-loading" style={{ background: 'var(--gray-50)', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <div className="map-loading-spinner" style={{ width: 36, height: 36, border: '3px solid var(--gray-200)', borderTopColor: 'var(--primary-500)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        </div>
    ),
});

const SPEED_OPTIONS = [
    { label: '1×', value: 1000 },
    { label: '2×', value: 500 },
    { label: '5×', value: 200 },
    { label: '10×', value: 100 },
];

function formatTime(dateStr) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function StatCard({ label, value }) {
    return (
        <div style={{ padding: '12px', background: 'var(--gray-50)', borderRadius: '8px', border: '1px solid var(--gray-200)' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--gray-600)', marginBottom: '4px' }}>{label}</div>
            <div style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--gray-900)' }}>{value}</div>
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

    const [playbackIndex, setPlaybackIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [playbackSpeed, setPlaybackSpeed] = useState(500);
    const playbackRef = useRef(null);

    useEffect(() => {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        setDateFrom(`${yyyy}-${mm}-${dd}`);
        setDateTo(`${yyyy}-${mm}-${dd}`);
    }, []);

    useEffect(() => {
        const fetchDevices = async () => {
            const { onAuthStateChanged } = await import('firebase/auth');
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

    const fetchHistory = useCallback(async () => {
        if (!selectedDevice || !dateFrom || !dateTo) return;
        setLoading(true); setError(''); setIsPlaying(false); setPlaybackIndex(0); setPositions([]);

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
        const startTime = new Date(positions[0].fixTime), endTime = new Date(positions[positions.length - 1].fixTime);
        const diffMs = endTime - startTime;
        const hours = Math.floor(diffMs / 3600000), minutes = Math.floor((diffMs % 3600000) / 60000);
        const duration = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
        return { distance: totalDistance.toFixed(1), duration, maxSpeed: Math.round(maxSpeed), avgSpeed: Math.round(totalSpeed / (positions.length - 1)), stops: stopCount, points: positions.length };
    };

    const stats = calcStats();
    const currentPos = positions[playbackIndex] || null;
    const selectedDeviceObj = devices.find(d => String(d.id) === selectedDevice);
    const progress = positions.length > 1 ? (playbackIndex / (positions.length - 1)) * 100 : 0;

    // Google style input styles
    const inputStyle = {
        width: '100%', padding: '12px 16px', fontSize: '0.875rem', color: 'var(--gray-900)',
        background: 'white', border: '1px solid var(--gray-300)', borderRadius: '4px',
        outline: 'none', transition: 'border 0.2s', fontFamily: 'var(--font-sans)'
    };

    return (
        <div className="dashboard-shell">
            <NavBar />

            {/* ── Google Maps Style Sidebar ── */}
            <aside style={{ width: 400, minWidth: 400, height: '100vh', display: 'flex', flexDirection: 'column', background: 'white', borderRight: '1px solid var(--gray-300)', zIndex: 10, boxShadow: 'var(--shadow-sm)' }}>

                {/* Header */}
                <div style={{ padding: '24px', borderBottom: '1px solid var(--gray-200)' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 400, color: 'var(--gray-800)', margin: '0 0 16px 0' }}>Route History</h2>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {devicesLoading ? (
                            <div style={{ ...inputStyle, background: 'var(--gray-50)', color: 'var(--gray-500)' }}>Loading vehicles...</div>
                        ) : (
                            <select value={selectedDevice} onChange={(e) => setSelectedDevice(e.target.value)} style={inputStyle} onFocus={e => e.target.style.border = '1px solid var(--primary-500)'} onBlur={e => e.target.style.border = '1px solid var(--gray-300)'}>
                                <option value="">Select vehicle</option>
                                {devices.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                            </select>
                        )}

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--gray-600)', marginBottom: '4px' }}>Start Date</label>
                                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={inputStyle} onFocus={e => e.target.style.border = '1px solid var(--primary-500)'} onBlur={e => e.target.style.border = '1px solid var(--gray-300)'} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--gray-600)', marginBottom: '4px' }}>End Date</label>
                                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={inputStyle} onFocus={e => e.target.style.border = '1px solid var(--primary-500)'} onBlur={e => e.target.style.border = '1px solid var(--gray-300)'} />
                            </div>
                        </div>

                        <button onClick={fetchHistory} disabled={loading || !selectedDevice || !dateFrom || !dateTo}
                            style={{
                                padding: '12px', fontSize: '0.875rem', fontWeight: 500, color: 'white',
                                background: loading ? 'var(--primary-300)' : 'var(--primary-500)',
                                border: 'none', borderRadius: '4px', cursor: loading ? 'not-allowed' : 'pointer',
                                transition: 'background 0.2s', display: 'flex', justifyContent: 'center', alignItems: 'center'
                            }}
                            onMouseOver={e => { if (!loading) e.currentTarget.style.background = 'var(--primary-600)'; }}
                            onMouseOut={e => { if (!loading) e.currentTarget.style.background = 'var(--primary-500)'; }}>
                            {loading ? 'Fetching...' : 'Show Route'}
                        </button>
                    </div>

                    {error && (
                        <div style={{ marginTop: '16px', padding: '12px', background: 'var(--danger-50)', color: 'var(--danger-600)', borderRadius: '4px', fontSize: '0.875rem' }}>
                            {error}
                        </div>
                    )}
                </div>

                {/* Content Area */}
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {positions.length > 0 ? (
                        <div style={{ padding: '24px' }}>
                            <div style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--gray-800)', marginBottom: '16px' }}>Trip Summary</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <StatCard label="Total Distance" value={`${stats.distance} km`} />
                                <StatCard label="Duration" value={stats.duration} />
                                <StatCard label="Avg Speed" value={`${stats.avgSpeed} km/h`} />
                                <StatCard label="Max Speed" value={`${stats.maxSpeed} km/h`} />
                            </div>

                            <div style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--gray-800)', marginTop: '32px', marginBottom: '16px' }}>Timeline</div>
                            <div style={{ position: 'relative', borderLeft: '2px solid var(--gray-200)', marginLeft: '12px', paddingLeft: '20px' }}>
                                {positions.filter((_, i) => i === 0 || i === positions.length - 1 || i % Math.ceil(positions.length / 10) === 0).map((pos, idx, arr) => (
                                    <div key={idx} style={{ position: 'relative', marginBottom: idx === arr.length - 1 ? '0' : '24px' }}>
                                        <div style={{ position: 'absolute', left: '-27px', top: '2px', width: '12px', height: '12px', borderRadius: '50%', background: idx === 0 ? 'var(--success-500)' : idx === arr.length - 1 ? 'var(--danger-500)' : 'var(--gray-400)', border: '2px solid white' }} />
                                        <div style={{ fontSize: '0.875rem', color: 'var(--gray-900)' }}>{formatTime(pos.fixTime)}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>Speed: {Math.round(pos.speed * 1.852)} km/h</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : !loading && !error && (
                        <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--gray-500)' }}>
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ margin: '0 auto 16px auto', opacity: 0.5 }}>
                                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle>
                            </svg>
                            <div style={{ fontSize: '1rem', color: 'var(--gray-800)', marginBottom: '8px' }}>No Data Selected</div>
                            <div style={{ fontSize: '0.875rem' }}>Select a vehicle and date range to view its historical route on the map.</div>
                        </div>
                    )}
                </div>
            </aside>

            {/* ── Map Area ── */}
            <div style={{ flex: 1, position: 'relative', height: '100vh', overflow: 'hidden', background: 'var(--gray-100)' }}>
                <HistoryMapComponent positions={positions} playbackIndex={playbackIndex} isPlaying={isPlaying} />

                {/* ── Google Maps Floating Playback Controls ── */}
                {positions.length > 1 && (
                    <div style={{
                        position: 'absolute', bottom: '24px', left: '50%', transform: 'translateX(-50%)', zIndex: 1000,
                        background: 'white', borderRadius: '8px', padding: '16px 24px', width: '400px',
                        boxShadow: '0 2px 6px 2px rgba(60,64,67,0.15), 0 1px 2px 0 rgba(60,64,67,0.3)',
                        display: 'flex', flexDirection: 'column', gap: '12px'
                    }}>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--gray-800)' }}>
                                {currentPos ? formatTime(currentPos.fixTime) : 'Playback'}
                            </span>
                            <div style={{ display: 'flex', gap: '4px' }}>
                                {SPEED_OPTIONS.map((opt) => (
                                    <button key={opt.value} onClick={() => setPlaybackSpeed(opt.value)}
                                        style={{
                                            padding: '4px 8px', fontSize: '0.75rem', borderRadius: '4px', cursor: 'pointer', border: 'none',
                                            background: playbackSpeed === opt.value ? 'var(--primary-50)' : 'transparent',
                                            color: playbackSpeed === opt.value ? 'var(--primary-600)' : 'var(--gray-600)',
                                        }}>
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <input type="range" min={0} max={positions.length - 1} value={playbackIndex} onChange={(e) => { setIsPlaying(false); setPlaybackIndex(parseInt(e.target.value)); }}
                            style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--primary-500)' }} />

                        <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', alignItems: 'center' }}>
                            <button onClick={() => { setIsPlaying(false); setPlaybackIndex(Math.max(0, playbackIndex - 10)); }} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--gray-600)' }}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 19 2 12 11 5 11 19" /><polygon points="22 19 13 12 22 5 22 19" /></svg>
                            </button>

                            <button onClick={() => { if (playbackIndex >= positions.length - 1) setPlaybackIndex(0); setIsPlaying(!isPlaying); }}
                                style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--primary-500)', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }}
                                onMouseOver={e => e.currentTarget.style.background = 'var(--primary-600)'} onMouseOut={e => e.currentTarget.style.background = 'var(--primary-500)'}>
                                {isPlaying ? (
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
                                ) : (
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: '4px' }}><polygon points="5 3 19 12 5 21 5 3" /></svg>
                                )}
                            </button>

                            <button onClick={() => { setIsPlaying(false); setPlaybackIndex(Math.min(positions.length - 1, playbackIndex + 10)); }} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--gray-600)' }}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 19 22 12 13 5 13 19" /><polygon points="2 19 11 12 2 5 2 19" /></svg>
                            </button>
                        </div>

                        {currentPos && (
                            <div style={{ display: 'flex', justifyContent: 'center', fontSize: '0.875rem', color: 'var(--gray-600)' }}>
                                {Math.round(currentPos.speed * 1.852)} km/h
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}