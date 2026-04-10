'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import NavBar from '@/components/NavBar';
import TimelineBar from '@/components/TimelineBar';
import { apiFetch } from '@/lib/api';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';

const JourneyMapComponent = dynamic(() => import('@/components/JourneyMap'), {
    ssr: false,
    loading: () => (
        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f5' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: 36, height: 36, border: '3px solid #e8eaed', borderTopColor: '#1a73e8', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                <span style={{ color: '#9aa0a6', fontSize: '0.8125rem' }}>Loading map…</span>
            </div>
        </div>
    ),
});

const SPEED_OPTIONS = [
    { label: '0.2×', value: 0.2 },
    { label: '0.3×', value: 0.3 },
    { label: '0.5×', value: 0.5 },
    { label: '0.75×', value: 0.75 },
    { label: '1×', value: 1 },
    { label: '2×', value: 2 },
    { label: '4×', value: 4 },
];

function formatDuration(seconds) {
    if (!seconds || seconds < 60) return '< 1m';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

function formatTime(isoStr) {
    if (!isoStr) return '—';
    return new Date(isoStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function JourneyPage() {
    const router = useRouter();
    const mapRef = useRef(null);

    // ── State ─────────────────────────────────────────────────────────────
    const [devices, setDevices] = useState([]);
    const [selectedDevice, setSelectedDevice] = useState('');
    const [date, setDate] = useState('');
    const [loading, setLoading] = useState(false);
    const [devicesLoading, setDevicesLoading] = useState(true);
    const [error, setError] = useState('');

    // Journey data
    const [segments, setSegments] = useState([]);
    const [stops, setStops] = useState([]);
    const [summary, setSummary] = useState(null);

    // Playback
    const [isPlaying, setIsPlaying] = useState(false);
    const [playbackSpeed, setPlaybackSpeed] = useState(0.3);
    const [pointIndex, setPointIndex] = useState(0);
    const [currentTime, setCurrentTime] = useState(null);
    const [currentSpeed, setCurrentSpeed] = useState(null);   // km/h at current point
    const [autoFollow, setAutoFollow] = useState(true);       // camera follows arrow
    const [distanceTravelled, setDistanceTravelled] = useState(0); // km so far
    const activeStopRowRefs = useRef({});  // keyed by stop index

    // ── Default date = today ──────────────────────────────────────────────
    useEffect(() => {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        setDate(`${yyyy}-${mm}-${dd}`);
    }, []);

    // ── Fetch devices ─────────────────────────────────────────────────────
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

    // ── Fetch journey data ────────────────────────────────────────────────
    const fetchJourney = useCallback(async () => {
        if (!selectedDevice || !date) return;
        setLoading(true);
        setError('');
        setIsPlaying(false);
        setPointIndex(0);
        setCurrentTime(null);
        setSegments([]);
        setStops([]);
        setSummary(null);

        try {
            const user = await new Promise((resolve) => {
                const unsub = onAuthStateChanged(auth, (u) => { unsub(); resolve(u); });
            });
            if (!user) { router.push('/login'); return; }

            const res = await apiFetch(`/api/journey/${selectedDevice}/${date}`);
            if (res.ok) {
                const data = await res.json();
                setSegments(data.segments || []);
                setStops(data.stops || []);
                setSummary(data.summary || null);

                if ((data.segments || []).length === 0 && (data.stops || []).length === 0) {
                    setError('No journey data found for this date. Data is processed in the background — it may take a few minutes after vehicle movement.');
                }
            } else {
                const body = await res.json().catch(() => ({}));
                setError(body.error || 'Failed to fetch journey data.');
            }
        } catch {
            setError('Connection error. Please try again.');
        } finally {
            setLoading(false);
        }
    }, [selectedDevice, date, router]);

    // ── Playback tick callback from JourneyMap ────────────────────────────
    const handlePlaybackTick = useCallback((idx) => {
        if (idx === -1) {
            // Animation complete
            setIsPlaying(false);
            return;
        }
        setPointIndex(idx);
        // Update current time, speed, and distance from the point's data
        if (mapRef.current) {
            const ts = mapRef.current.getPointTimestamp(idx);
            if (ts) setCurrentTime(ts);
            const spd = mapRef.current.getPointSpeed(idx);
            setCurrentSpeed(spd);
            const dist = mapRef.current.getDistanceAtPoint(idx);
            if (dist != null) setDistanceTravelled(dist);
        }
    }, []);

    // ── Timeline seek ─────────────────────────────────────────────────────
    const handleTimelineSeek = useCallback((timestamp) => {
        if (!mapRef.current) return;
        setIsPlaying(false);
        const idx = mapRef.current.findPointByTime(timestamp);
        setPointIndex(idx);
        setCurrentTime(timestamp.toISOString());
        mapRef.current.seekTo(idx);
        const spd = mapRef.current.getPointSpeed(idx);
        setCurrentSpeed(spd);
        const dist = mapRef.current.getDistanceAtPoint(idx);
        if (dist != null) setDistanceTravelled(dist);
    }, []);

    // ── Toggle play ───────────────────────────────────────────────────────
    const togglePlay = useCallback(() => {
        if (isPlaying) {
            setIsPlaying(false);
        } else {
            // If at the end, restart
            const total = mapRef.current?.getPointCount() || 0;
            if (pointIndex >= total - 1) setPointIndex(0);
            setIsPlaying(true);
        }
    }, [isPlaying, pointIndex]);


    // ── Computed ──────────────────────────────────────────────────────────
    const totalPoints = segments.reduce((s, seg) => s + seg.points.length, 0);
    const hasData = segments.length > 0 || stops.length > 0;
    const selectedDeviceObj = devices.find(d => String(d.id) === selectedDevice);

    // Active stop: the stop whose time window contains currentTime
    const activeStopIdx = currentTime
        ? stops.findIndex(st => {
            const t = new Date(currentTime).getTime();
            const arr = st.arrivedAt ? new Date(st.arrivedAt).getTime() : null;
            const dep = st.departedAt ? new Date(st.departedAt).getTime() : null;
            return arr && dep && t >= arr && t <= dep;
        })
        : -1;

    // Distance remaining (from cumulative map distance)
    const totalDistKm = mapRef.current?.getTotalDistance?.() ?? 0;
    const distanceRemaining = Math.max(0, totalDistKm - distanceTravelled);

    // Scroll active stop into view
    useEffect(() => {
        if (activeStopIdx >= 0 && activeStopRowRefs.current[activeStopIdx]) {
            activeStopRowRefs.current[activeStopIdx].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }, [activeStopIdx]);

    // ── Keyboard shortcuts (Space = play/pause, ←/→ = step frame) ────────
    // NOTE: must be declared AFTER hasData to avoid TDZ in production builds.
    useEffect(() => {
        const onKey = (e) => {
            const tag = e.target.tagName;
            if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
            if (e.code === 'Space') {
                e.preventDefault();
                // Use raw expression — avoids any stale-closure risk with hasData
                setIsPlaying(prev => (segments.length > 0 || stops.length > 0 ? !prev : prev));
            }
            if (!isPlaying && mapRef.current) {
                if (e.code === 'ArrowRight') {
                    e.preventDefault();
                    const next = Math.min(pointIndex + 1, (mapRef.current.getPointCount() || 1) - 1);
                    setPointIndex(next);
                    mapRef.current.seekTo(next);
                    const ts = mapRef.current.getPointTimestamp(next);
                    if (ts) setCurrentTime(ts);
                }
                if (e.code === 'ArrowLeft') {
                    e.preventDefault();
                    const prev = Math.max(pointIndex - 1, 0);
                    setPointIndex(prev);
                    mapRef.current.seekTo(prev);
                    const ts = mapRef.current.getPointTimestamp(prev);
                    if (ts) setCurrentTime(ts);
                }
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [segments.length, stops.length, isPlaying, pointIndex]);

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

            {/* ── Left sidebar ── */}
            <aside style={{
                width: 280, minWidth: 280, height: '100vh',
                display: 'flex', flexDirection: 'column',
                background: 'white', borderRight: '1px solid var(--gray-200)',
                overflow: 'hidden', flexShrink: 0,
            }}>
                {/* Header */}
                <div style={{ padding: '1.25rem 1.25rem 0.75rem', flexShrink: 0 }}>
                    <h1 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--gray-800)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--primary-500)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                        </svg>
                        Journey
                    </h1>
                </div>

                {/* Controls */}
                <div style={{ padding: '0 1.25rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.625rem', flexShrink: 0 }}>
                    {devicesLoading ? (
                        <div style={{ height: 38, display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--gray-600)', fontSize: '0.875rem' }}>
                            <div style={{ width: 14, height: 14, border: '2px solid var(--gray-300)', borderTopColor: 'var(--primary-500)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                            Loading…
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

                    <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--gray-600)', marginBottom: '0.25rem' }}>Date</label>
                        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
                    </div>

                    <button
                        onClick={fetchJourney}
                        disabled={loading || !selectedDevice || !date}
                        style={{
                            width: '100%', padding: '0.625rem 1rem',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                            fontSize: '0.875rem', fontWeight: 500, fontFamily: 'var(--font-sans)',
                            color: 'white', background: 'var(--primary-500)',
                            border: 'none', borderRadius: 'var(--radius-sm)',
                            cursor: loading || !selectedDevice || !date ? 'not-allowed' : 'pointer',
                            opacity: (!selectedDevice || !date) ? 0.6 : 1,
                            transition: 'background var(--transition-fast)',
                        }}
                        onMouseEnter={e => { if (!loading) e.currentTarget.style.background = 'var(--primary-600)'; }}
                        onMouseLeave={e => e.currentTarget.style.background = 'var(--primary-500)'}
                    >
                        {loading ? (
                            <>
                                <div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                                Loading…
                            </>
                        ) : 'Load Journey'}
                    </button>
                </div>

                {/* Scrollable content area */}
                <div style={{ flex: 1, overflow: 'auto', borderTop: '1px solid var(--gray-200)' }}>
                    {/* Error / empty states */}
                    {error && (
                        <div style={{ padding: '1.25rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', color: 'var(--gray-600)' }}>
                            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" style={{ opacity: 0.3 }}>
                                <path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z" /><circle cx="12" cy="10" r="3" />
                            </svg>
                            <p style={{ fontSize: '0.8125rem', margin: 0, lineHeight: 1.5 }}>{error}</p>
                        </div>
                    )}

                    {!error && !hasData && !loading && (
                        <div style={{ padding: '1.5rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', color: 'var(--gray-500)' }}>
                            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" style={{ opacity: 0.25 }}>
                                <path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z" /><circle cx="12" cy="10" r="3" />
                            </svg>
                            <p style={{ fontSize: '0.875rem', margin: 0 }}>No Journey Loaded</p>
                            <p style={{ fontSize: '0.75rem', color: 'var(--gray-400)', margin: 0, lineHeight: 1.5 }}>Select a vehicle and date to view its journey on the map.</p>
                        </div>
                    )}

                    {/* Summary + controls when data loaded */}
                    {hasData && (
                        <div style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                            {/* Summary stats */}
                            {summary && (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                    {[
                                        { label: 'Distance', value: `${summary.totalDistanceKm} km` },
                                        { label: 'Driving', value: `${summary.totalDrivingMinutes}m` },
                                        { label: 'Stopped', value: `${summary.totalStoppedMinutes}m` },
                                        { label: 'Segments', value: summary.segmentCount },
                                        { label: 'Stops', value: summary.stopCount },
                                        { label: 'Points', value: totalPoints },
                                    ].map(({ label, value }) => (
                                        <div key={label} style={{ background: 'var(--gray-50)', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-sm)', padding: '0.5rem 0.625rem' }}>
                                            <div style={{ fontSize: '0.625rem', fontWeight: 400, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--gray-600)' }}>{label}</div>
                                            <div style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--gray-800)' }}>{value}</div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Playback controls */}
                            {totalPoints > 0 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>

                                    {/* ── Time clock + scrubber ── */}
                                    <div style={{ background: 'var(--gray-50)', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', padding: '0.625rem 0.75rem', textAlign: 'center' }}>
                                        <div style={{ fontSize: '0.575rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--gray-500)', marginBottom: '0.2rem' }}>
                                            Position Time
                                        </div>
                                        <div style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--gray-800)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', lineHeight: 1 }}>
                                            {currentTime
                                                ? new Date(currentTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                                                : '——:——:——'}
                                        </div>
                                        {currentTime && (
                                            <div style={{ fontSize: '0.625rem', color: 'var(--gray-500)', marginTop: '0.125rem' }}>
                                                {new Date(currentTime).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                                            </div>
                                        )}
                                        {/* Scrubber */}
                                        <input
                                            type="range"
                                            min={0}
                                            max={Math.max(totalPoints - 1, 1)}
                                            value={pointIndex}
                                            onChange={(e) => {
                                                const idx = Number(e.target.value);
                                                setIsPlaying(false);
                                                setPointIndex(idx);
                                                if (mapRef.current) {
                                                    mapRef.current.seekTo(idx);
                                                    const ts = mapRef.current.getPointTimestamp(idx);
                                                    if (ts) setCurrentTime(ts);
                                                }
                                            }}
                                            style={{ width: '100%', margin: '0.5rem 0 0.2rem', accentColor: 'var(--primary-500)', cursor: 'pointer' }}
                                        />
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.575rem', color: 'var(--gray-400)' }}>
                                            <span>0</span>
                                            <span style={{ color: 'var(--primary-500)', fontWeight: 600 }}>
                                                {Math.round((pointIndex / Math.max(totalPoints - 1, 1)) * 100)}%
                                            </span>
                                            <span>{totalPoints} pts</span>
                                        </div>
                                    </div>

                                    {/* ── Speed strip ── */}
                                    <div>
                                        <div style={{ fontSize: '0.575rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--gray-500)', marginBottom: '0.25rem' }}>
                                            Playback Speed
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.25rem', overflowX: 'auto', paddingBottom: '2px' }}>
                                            {SPEED_OPTIONS.map(({ label, value }) => (
                                                <button key={value} onClick={() => setPlaybackSpeed(value)}
                                                    style={{
                                                        flexShrink: 0,
                                                        padding: '0.25rem 0.5rem',
                                                        fontSize: '0.7rem', fontWeight: 600,
                                                        background: playbackSpeed === value ? 'var(--primary-500)' : 'var(--gray-50)',
                                                        color: playbackSpeed === value ? 'white' : 'var(--gray-600)',
                                                        border: `1px solid ${playbackSpeed === value ? 'var(--primary-500)' : 'var(--gray-200)'}`,
                                                        borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontFamily: 'inherit',
                                                        transition: 'background 0.12s ease, color 0.12s ease, border-color 0.12s ease',
                                                    }}>
                                                    {label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* ── Play / Skip controls ── */}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.625rem' }}>
                                        <button title="Skip to start" onClick={() => { setIsPlaying(false); setPointIndex(0); setCurrentTime(null); if (mapRef.current) mapRef.current.seekTo(0); }}
                                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, background: 'var(--gray-50)', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--gray-600)' }}>
                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="19 20 9 12 19 4 19 20"></polygon><line x1="5" y1="19" x2="5" y2="5" stroke="currentColor" strokeWidth="2" fill="none"></line></svg>
                                        </button>

                                        <button title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
                                            onClick={togglePlay}
                                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 42, height: 42, borderRadius: '50%', background: isPlaying ? '#ea4335' : 'var(--primary-500)', border: 'none', color: 'white', cursor: 'pointer', boxShadow: 'var(--shadow-sm)', transition: 'background 0.15s ease' }}>
                                            {isPlaying ? (
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
                                            ) : (
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                                            )}
                                        </button>

                                        <button title="Skip to end" onClick={() => { setIsPlaying(false); const total = mapRef.current?.getPointCount() || 1; setPointIndex(total - 1); if (mapRef.current) mapRef.current.seekTo(total - 1); }}
                                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, background: 'var(--gray-50)', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--gray-600)' }}>
                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 4 15 12 5 20 5 4"></polygon><line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" strokeWidth="2" fill="none"></line></svg>
                                        </button>
                                    </div>

                                    {/* ── Auto-follow toggle ── */}
                                    <button
                                        title={autoFollow ? 'Auto-follow ON — click to free-pan' : 'Auto-follow OFF — click to re-lock camera'}
                                        onClick={() => setAutoFollow(p => !p)}
                                        style={{
                                            alignSelf: 'center', marginTop: '0.375rem',
                                            display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                                            fontSize: '0.6875rem', fontWeight: 500,
                                            padding: '0.25rem 0.625rem', borderRadius: 'var(--radius-sm)',
                                            background: autoFollow ? 'var(--primary-50)' : 'var(--gray-50)',
                                            border: `1px solid ${autoFollow ? 'var(--primary-300)' : 'var(--gray-200)'}`,
                                            color: autoFollow ? 'var(--primary-600)' : 'var(--gray-500)',
                                            cursor: 'pointer', transition: 'all 0.15s ease',
                                        }}
                                    >
                                        {autoFollow ? '📍' : '🔓'}
                                        {autoFollow ? 'Camera: Following' : 'Camera: Free'}
                                    </button>

                                    {/* ── Keyboard hint ── */}
                                    <div style={{ textAlign: 'center', fontSize: '0.575rem', color: 'var(--gray-400)', lineHeight: 1.6 }}>
                                        <kbd style={{ background: 'var(--gray-100)', border: '1px solid var(--gray-300)', borderRadius: 3, padding: '0 3px', fontSize: 'inherit' }}>Space</kbd>
                                        {' '}play/pause
                                        {' · '}
                                        <kbd style={{ background: 'var(--gray-100)', border: '1px solid var(--gray-300)', borderRadius: 3, padding: '0 3px', fontSize: 'inherit' }}>←</kbd>
                                        {' '}
                                        <kbd style={{ background: 'var(--gray-100)', border: '1px solid var(--gray-300)', borderRadius: 3, padding: '0 3px', fontSize: 'inherit' }}>→</kbd>
                                        {' '}step frame
                                    </div>

                                </div>
                            )}

                            {/* Segments list */}

                            {segments.length > 0 && (
                                <div>
                                    <div style={{ fontSize: '0.65rem', fontWeight: 400, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--gray-600)', marginBottom: '0.5rem' }}>
                                        Segments ({segments.length})
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', maxHeight: 200, overflowY: 'auto' }}>
                                        {segments.map((seg, i) => (
                                            <button key={seg.id || i}
                                                onClick={() => {
                                                    setIsPlaying(false);
                                                    if (mapRef.current) {
                                                        const idx = mapRef.current.findPointByTime(seg.startedAt);
                                                        setPointIndex(idx);
                                                        setCurrentTime(seg.startedAt);
                                                        mapRef.current.seekTo(idx);
                                                    }
                                                }}
                                                style={{
                                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                    padding: '0.5rem 0.625rem', borderRadius: 'var(--radius-sm)',
                                                    background: 'var(--gray-50)', border: '1px solid var(--gray-200)',
                                                    cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#34a853', display: 'inline-block', flexShrink: 0 }} />
                                                    <div>
                                                        <div style={{ fontSize: '0.8125rem', color: 'var(--gray-800)', fontWeight: 500 }}>
                                                            {formatTime(seg.startedAt)} → {formatTime(seg.endedAt)}
                                                        </div>
                                                    </div>
                                                </div>
                                                <span style={{ fontSize: '0.75rem', color: 'var(--gray-600)', fontWeight: 500, whiteSpace: 'nowrap' }}>
                                                    {(seg.distanceMeters / 1000).toFixed(1)} km
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Stops list */}
                            {stops.length > 0 && (
                                <div>
                                    <div style={{ fontSize: '0.65rem', fontWeight: 400, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--gray-600)', marginBottom: '0.5rem' }}>
                                        Stops ({stops.length})
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', maxHeight: 240, overflowY: 'auto' }}>
                                        {stops.map((st, i) => {
                                            const isActive = i === activeStopIdx;
                                            return (
                                                <button key={st.id || i}
                                                    ref={el => { activeStopRowRefs.current[i] = el; }}
                                                    onClick={() => {
                                                        setIsPlaying(false);
                                                        if (mapRef.current) {
                                                            const idx = mapRef.current.findPointByTime(st.arrivedAt);
                                                            setPointIndex(idx);
                                                            setCurrentTime(st.arrivedAt);
                                                            mapRef.current.seekTo(idx);
                                                            const spd = mapRef.current.getPointSpeed(idx);
                                                            setCurrentSpeed(spd);
                                                        }
                                                    }}
                                                    style={{
                                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                        padding: '0.5rem 0.625rem', borderRadius: 'var(--radius-sm)',
                                                        background: isActive ? '#fef2f2' : 'var(--gray-50)',
                                                        border: `1px solid ${isActive ? '#fca5a5' : 'var(--gray-200)'}`,
                                                        cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                                                        transition: 'background 0.15s ease, border-color 0.15s ease',
                                                        outline: isActive ? '2px solid #ef4444' : 'none',
                                                        outlineOffset: -1,
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: isActive ? '#ef4444' : '#ea4335', display: 'inline-block', flexShrink: 0, boxShadow: isActive ? '0 0 0 3px rgba(239,68,68,0.25)' : 'none', transition: 'box-shadow 0.2s' }} />
                                                        <div>
                                                            <div style={{ fontSize: '0.8125rem', color: isActive ? '#b91c1c' : 'var(--gray-800)', fontWeight: isActive ? 600 : 500 }}>
                                                                {formatTime(st.arrivedAt)} → {formatTime(st.departedAt)}
                                                            </div>
                                                            <div style={{ fontSize: '0.6875rem', color: 'var(--gray-500)' }}>
                                                                {st.lat?.toFixed(4)}, {st.lng?.toFixed(4)}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <span style={{ fontSize: '0.75rem', color: isActive ? '#b91c1c' : 'var(--gray-600)', fontWeight: 500, whiteSpace: 'nowrap' }}>
                                                        {formatDuration(st.durationSeconds)}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}



                        </div>
                    )}
                </div>
            </aside>

            {/* ── Main area: Timeline + Map ── */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: '#eef2f7' }}>

                {/* Timeline bar (top) */}
                {hasData && (
                    <div style={{
                        flexShrink: 0, padding: '0.5rem 1rem',
                        background: 'white', borderBottom: '1px solid var(--gray-200)',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                    }}>
                        <TimelineBar
                            segments={segments}
                            stops={stops}
                            currentTime={currentTime}
                            onSeek={handleTimelineSeek}
                            isPlaying={isPlaying}
                            date={date}
                        />
                    </div>
                )}

                {/* Map */}
                <div style={{ flex: 1, position: 'relative' }}>
                    {hasData ? (
                        <JourneyMapComponent
                            ref={mapRef}
                            segments={segments}
                            stops={stops}
                            playbackState={{ isPlaying, speed: playbackSpeed, pointIndex }}
                            onPlaybackTick={handlePlaybackTick}
                            autoFollow={autoFollow}
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
                            <p style={{ fontSize: '0.9375rem', fontWeight: 500, margin: '0 0 0.5rem', color: 'var(--gray-700)' }}>No Journey Loaded</p>
                            <p style={{ fontSize: '0.8125rem', color: 'var(--gray-500)', margin: 0, textAlign: 'center', lineHeight: 1.6 }}>
                                Select a vehicle &amp; date,<br />then click <strong>Load Journey</strong>
                            </p>
                        </div>
                    )}

                    {/* Vehicle info overlay */}
                    {hasData && selectedDeviceObj && (
                        <div style={{
                            position: 'absolute', top: '1rem', right: '1rem', zIndex: 1000,
                            background: 'white',
                            border: '1px solid var(--gray-300)', borderRadius: 'var(--radius-md)',
                            padding: '0.75rem 1rem', boxShadow: 'var(--shadow-md)',
                            minWidth: '180px',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.375rem' }}>
                                <div style={{ width: 28, height: 28, borderRadius: 'var(--radius-sm)', background: 'var(--primary-50)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--primary-500)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <rect x="1" y="3" width="15" height="13" rx="2" />
                                        <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                                        <circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" />
                                    </svg>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--gray-800)' }}>{selectedDeviceObj.name}</div>
                                    <div style={{ fontSize: '0.625rem', color: 'var(--gray-500)' }}>{date}</div>
                                </div>
                            </div>
                            {summary && (
                                <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.6875rem', color: 'var(--gray-600)' }}>
                                    <span>{summary.totalDistanceKm} km</span>
                                    <span>·</span>
                                    <span>{summary.segmentCount} trips</span>
                                    <span>·</span>
                                    <span>{summary.stopCount} stops</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Playback time + speed overlay — bottom-left of map */}
                    {hasData && currentTime && (
                        <div style={{
                            position: 'absolute', bottom: '1.5rem', left: '1rem', zIndex: 1000,
                            display: 'flex', alignItems: 'stretch', gap: 0,
                            borderRadius: 'var(--radius-md)',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
                            overflow: 'hidden',
                            userSelect: 'none',
                        }}>
                            {/* Time block */}
                            <div style={{
                                background: 'rgba(26, 115, 232, 0.90)',
                                backdropFilter: 'blur(8px)',
                                WebkitBackdropFilter: 'blur(8px)',
                                padding: '0.375rem 0.75rem',
                                color: 'white',
                            }}>
                                <div style={{ fontSize: '0.55rem', opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                                    {isPlaying ? '▶ Playing' : '⏸ Paused'}
                                </div>
                                <div style={{ fontSize: '1.0625rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                                    {new Date(currentTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                </div>
                            </div>
                            {/* Speed block */}
                            {currentSpeed != null && (
                                <div style={{
                                    background: currentSpeed > 80 ? 'rgba(220,38,38,0.88)'
                                        : currentSpeed > 40 ? 'rgba(234,88,12,0.88)'
                                            : 'rgba(5,150,105,0.88)',
                                    backdropFilter: 'blur(8px)',
                                    WebkitBackdropFilter: 'blur(8px)',
                                    padding: '0.375rem 0.75rem',
                                    color: 'white',
                                    borderLeft: '1px solid rgba(255,255,255,0.2)',
                                    minWidth: 60,
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <div style={{ fontSize: '0.55rem', opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Speed</div>
                                    <div style={{ fontSize: '1.0625rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                                        {currentSpeed > 0 ? currentSpeed : '—'}
                                    </div>
                                    <div style={{ fontSize: '0.5rem', opacity: 0.8, letterSpacing: '0.04em' }}>km/h</div>
                                </div>
                            )}
                            {/* Distance remaining block */}
                            {totalDistKm > 0 && (
                                <div style={{
                                    background: 'rgba(15,23,42,0.82)',
                                    backdropFilter: 'blur(8px)',
                                    WebkitBackdropFilter: 'blur(8px)',
                                    padding: '0.375rem 0.75rem',
                                    color: 'white',
                                    borderLeft: '1px solid rgba(255,255,255,0.1)',
                                    minWidth: 64,
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <div style={{ fontSize: '0.55rem', opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Remaining</div>
                                    <div style={{ fontSize: '1.0625rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                                        {distanceRemaining < 1 ? `${Math.round(distanceRemaining * 1000)}m` : `${distanceRemaining.toFixed(1)}`}
                                    </div>
                                    {distanceRemaining >= 1 && <div style={{ fontSize: '0.5rem', opacity: 0.7, letterSpacing: '0.04em' }}>km</div>}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Legend */}
                    {hasData && (
                        <div style={{
                            position: 'absolute', bottom: '1.5rem', right: '1rem', zIndex: 1000,
                            background: 'white',
                            border: '1px solid var(--gray-300)', borderRadius: 'var(--radius-md)',
                            padding: '0.5rem 0.75rem', boxShadow: 'var(--shadow-md)',
                        }}>
                            <div style={{ fontSize: '0.6rem', fontWeight: 400, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--gray-600)', marginBottom: '0.25rem' }}>Legend</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                {[
                                    { color: '#1e8e3e', label: 'Start' },
                                    { color: '#d93025', label: 'End' },
                                    { color: '#1a73e8', label: 'Route' },
                                    { color: '#ea4335', label: 'Stop' },
                                ].map(({ color, label }) => (
                                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
                                        <span style={{ fontSize: '0.6875rem', color: 'var(--gray-700)' }}>{label}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
