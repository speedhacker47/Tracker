'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import NavBar from '@/components/NavBar';
import { apiFetch } from '@/lib/api';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';

// ── Format helpers ────────────────────────────────────────────────────────────

function fmtDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleString('en-IN', {
        month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true,
    });
}
function fmtDuration(ms) {
    if (!ms && ms !== 0) return '—';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}
function fmtDistance(meters) {
    if (meters == null) return '—';
    return `${(meters / 1000).toFixed(1)} km`;
}
function fmtSpeed(knots) {
    if (knots == null) return '—';
    return `${Math.round(knots * 1.852)} km/h`;
}

// ── Small UI components ───────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon, color }) {
    return (
        <div style={{
            background: 'white', border: '1px solid var(--gray-200)',
            borderRadius: 'var(--radius-md)', padding: '1rem 1.25rem',
            display: 'flex', alignItems: 'flex-start', gap: '0.875rem',
        }}>
            <div style={{
                width: 38, height: 38, borderRadius: 'var(--radius-sm)',
                background: 'var(--primary-50)', display: 'flex', alignItems: 'center',
                justifyContent: 'center', flexShrink: 0, color: 'var(--primary-500)',
            }}>{icon}</div>
            <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '1.25rem', fontWeight: 400, color: 'var(--gray-800)', lineHeight: 1, letterSpacing: '-0.02em' }}>{value}</div>
                <div style={{ fontSize: '0.8125rem', fontWeight: 400, color: 'var(--gray-600)', marginTop: '0.25rem' }}>{label}</div>
                {sub && <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)', marginTop: '0.125rem' }}>{sub}</div>}
            </div>
        </div>
    );
}

function EmptyState({ icon, title, subtitle }) {
    return (
        <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', padding: '4rem 2rem', gap: '0.75rem',
            background: 'var(--gray-50)', borderRadius: 'var(--radius-md)',
            border: '1px solid var(--gray-200)',
        }}>
            <div style={{ color: 'var(--gray-400)', marginBottom: '0.25rem' }}>{icon}</div>
            <div style={{ fontSize: '0.9375rem', fontWeight: 400, color: 'var(--gray-600)' }}>{title}</div>
            {subtitle && <div style={{ fontSize: '0.8125rem', color: 'var(--gray-500)' }}>{subtitle}</div>}
        </div>
    );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ReportsPage() {
    const router = useRouter();

    const [devices, setDevices] = useState([]);
    const [selectedDevice, setSelectedDevice] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [activeTab, setActiveTab] = useState('trips');

    const [trips, setTrips] = useState([]);
    const [stops, setStops] = useState([]);
    const [summary, setSummary] = useState(null);

    const [devicesLoading, setDevicesLoading] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [hasSearched, setHasSearched] = useState(false);

    // Default to today
    useEffect(() => {
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        setDateFrom(`${yyyy}-${mm}-${dd}`);
        setDateTo(`${yyyy}-${mm}-${dd}`);
    }, []);

    // Load devices
    useEffect(() => {
        const load = async () => {
            const user = await new Promise(resolve => {
                const unsub = onAuthStateChanged(auth, u => { unsub(); resolve(u); });
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
            } catch (e) { console.error(e); }
            finally { setDevicesLoading(false); }
        };
        load();
    }, [router]);

    const runReport = useCallback(async () => {
        if (!selectedDevice || !dateFrom || !dateTo) return;
        setLoading(true);
        setError('');
        setHasSearched(true);
        setTrips([]);
        setStops([]);
        setSummary(null);

        const from = new Date(`${dateFrom}T00:00:00`).toISOString();
        const to = new Date(`${dateTo}T23:59:59`).toISOString();
        const qs = new URLSearchParams({ deviceId: selectedDevice, from, to }).toString();

        try {
            const [tripsRes, stopsRes, summaryRes] = await Promise.allSettled([
                apiFetch(`/api/reports/trips?${qs}`),
                apiFetch(`/api/reports/stops?${qs}`),
                apiFetch(`/api/reports/summary?${qs}`),
            ]);

            if (tripsRes.status === 'fulfilled' && tripsRes.value.ok) {
                setTrips(await tripsRes.value.json());
            }
            if (stopsRes.status === 'fulfilled' && stopsRes.value.ok) {
                setStops(await stopsRes.value.json());
            }
            if (summaryRes.status === 'fulfilled' && summaryRes.value.ok) {
                const d = await summaryRes.value.json();
                setSummary(Array.isArray(d) ? (d[0] || null) : d);
            }
        } catch (e) {
            setError('Failed to load reports. Check your connection and try again.');
        } finally {
            setLoading(false);
        }
    }, [selectedDevice, dateFrom, dateTo]);

    const selectedVehicle = devices.find(d => String(d.id) === selectedDevice);

    const TABS = [
        { key: 'trips', label: 'Trips', count: trips.length },
        { key: 'stops', label: 'Stops', count: stops.length },
        { key: 'summary', label: 'Summary', count: null },
    ];

    return (
        <div className="dashboard-shell">
            <NavBar />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--gray-50)' }}>

                {/* ── Top bar ── */}
                <div style={{
                    background: 'white', borderBottom: '1px solid var(--gray-200)',
                    padding: '0 1.75rem', minHeight: 64, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: '1rem', flexWrap: 'wrap',
                }}>
                    {/* Title */}
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                        <h1 style={{ fontSize: '1.125rem', fontWeight: 400, color: 'var(--gray-800)', margin: 0 }}>Reports</h1>
                        <span style={{ fontSize: '0.8125rem', color: 'var(--gray-500)' }}>Trips · Stops · Summary</span>
                    </div>

                    {/* Controls */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexWrap: 'wrap' }}>

                        {/* Vehicle */}
                        {devicesLoading ? (
                            <div style={{ width: 160, height: 34, background: 'var(--gray-100)', borderRadius: 'var(--radius-md)' }} />
                        ) : (
                            <select value={selectedDevice} onChange={e => setSelectedDevice(e.target.value)}
                                style={{
                                    height: 34, padding: '0 2rem 0 0.75rem', fontSize: '0.8125rem',
                                    border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)',
                                    background: 'white', color: 'var(--gray-700)',
                                    fontFamily: 'var(--font-sans)', cursor: 'pointer',
                                }}>
                                {devices.map(d => <option key={d.id} value={String(d.id)}>{d.name}</option>)}
                            </select>
                        )}

                        {/* From date */}
                        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                            style={{
                                height: 34, padding: '0 0.625rem', fontSize: '0.8125rem',
                                border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)',
                                background: 'white', color: 'var(--gray-700)', fontFamily: 'var(--font-sans)',
                            }} />

                        <span style={{ fontSize: '0.8125rem', color: 'var(--gray-400)', fontWeight: 500 }}>→</span>

                        {/* To date */}
                        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                            style={{
                                height: 34, padding: '0 0.625rem', fontSize: '0.8125rem',
                                border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)',
                                background: 'white', color: 'var(--gray-700)', fontFamily: 'var(--font-sans)',
                            }} />

                        {/* Run */}
                        <button onClick={runReport} disabled={loading || !selectedDevice || devicesLoading}
                            style={{
                                height: 34, padding: '0 1.125rem', fontSize: '0.875rem', fontWeight: 500,
                                fontFamily: 'var(--font-sans)', border: 'none', borderRadius: 'var(--radius-sm)',
                                background: loading ? 'var(--gray-200)' : 'var(--primary-500)',
                                color: loading ? 'var(--gray-500)' : 'white',
                                cursor: loading ? 'not-allowed' : 'pointer',
                                display: 'flex', alignItems: 'center', gap: '0.375rem',
                                transition: 'background var(--transition-fast)',
                            }}
                            onMouseEnter={e => { if (!loading && selectedDevice) e.currentTarget.style.background = 'var(--primary-600)'; }}
                            onMouseLeave={e => { if (!loading) e.currentTarget.style.background = loading ? 'var(--gray-200)' : 'var(--primary-500)'; }}
                        >
                            {loading
                                ? <><div className="map-loading-spinner" style={{ width: 13, height: 13, borderWidth: 2 }} />Loading…</>
                                : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3" /></svg>Run Report</>
                            }
                        </button>
                    </div>
                </div>

                {/* ── Main content ── */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem 1.75rem' }}>

                    {error && (
                        <div style={{
                            marginBottom: '1.25rem', padding: '0.875rem 1rem',
                            background: '#fef2f2', border: '1px solid #fecaca',
                            borderRadius: 'var(--radius-lg)', color: '#b91c1c',
                            fontSize: '0.875rem', fontWeight: 500,
                        }}>
                            ⚠ {error}
                        </div>
                    )}

                    {/* Idle state */}
                    {!hasSearched && (
                        <div style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center',
                            justifyContent: 'center', paddingTop: '6rem', gap: '1rem',
                        }}>
                            <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="var(--gray-200)" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
                            </svg>
                            <p style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--gray-400)' }}>Pick a vehicle and date range, then click Run Report</p>
                        </div>
                    )}

                    {hasSearched && !loading && (
                        <>
                            {/* Summary stat cards */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '0.875rem', marginBottom: '1.75rem' }}>
                                <StatCard label="Total Distance" value={summary ? fmtDistance(summary.distance) : '—'} sub={`${trips.length} trip${trips.length !== 1 ? 's' : ''}`} color="#7c3aed"
                                    icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h18M3 6h18M3 18h18" /></svg>} />
                                <StatCard label="Max Speed" value={summary ? fmtSpeed(summary.maxSpeed) : '—'} color="#2563eb"
                                    icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>} />
                                <StatCard label="Average Speed" value={summary ? fmtSpeed(summary.averageSpeed) : '—'} color="#0891b2"
                                    icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>} />
                                <StatCard label="Engine Hours" value={summary ? fmtDuration(summary.engineHours) : '—'} color="#d97706"
                                    icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>} />
                                <StatCard label="Total Stops" value={stops.length} color="#16a34a"
                                    icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /></svg>} />
                                <StatCard label="Fuel Used" value={summary?.fuelConsumed ? `${summary.fuelConsumed.toFixed(1)} L` : '—'} color="#dc2626"
                                    icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 22V8l9-6 9 6v14H3z" /><path d="M9 22V12h6v10" /></svg>} />
                            </div>

                            <div style={{ display: 'flex', gap: '0', marginBottom: '1.25rem', borderBottom: '1px solid var(--gray-200)' }}>
                                {TABS.map(tab => (
                                    <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                                        style={{
                                            padding: '8px 16px', fontSize: '0.8125rem', fontWeight: activeTab === tab.key ? 500 : 400,
                                            fontFamily: 'var(--font-sans)', border: 'none', background: 'transparent',
                                            color: activeTab === tab.key ? 'var(--primary-500)' : 'var(--gray-700)',
                                            borderBottom: activeTab === tab.key ? '2px solid var(--primary-500)' : '2px solid transparent',
                                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.375rem',
                                            marginBottom: -1,
                                        }}>
                                        {tab.label}
                                        {tab.count !== null && (
                                            <span style={{
                                                fontSize: '0.75rem', fontWeight: 400,
                                                color: activeTab === tab.key ? 'var(--primary-500)' : 'var(--gray-500)',
                                            }}>{tab.count}</span>
                                        )}
                                    </button>
                                ))}
                            </div>

                            {/* ── Trips ── */}
                            {activeTab === 'trips' && (
                                trips.length === 0
                                    ? <EmptyState
                                        icon={<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>}
                                        title="No trips recorded"
                                        subtitle="The vehicle may not have moved during this period"
                                    />
                                    : <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                                        {trips.map((trip, i) => (
                                            <div key={i} style={{
                                                background: 'white', border: '1px solid var(--gray-200)',
                                                borderRadius: 'var(--radius-xl)', padding: '1rem 1.25rem',
                                                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                                                display: 'grid',
                                                gridTemplateColumns: '2.5rem 1fr 0.8fr 0.8fr 0.8fr',
                                                gap: '1rem', alignItems: 'center',
                                            }}>
                                                {/* Number */}
                                                <div style={{
                                                    width: 32, height: 32, borderRadius: '50%',
                                                    background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
                                                    color: 'white', fontSize: '0.75rem', fontWeight: 700,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                }}>{i + 1}</div>

                                                {/* Route */}
                                                <div>
                                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.375rem', marginBottom: '0.3rem' }}>
                                                        <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#16a34a' }}>FROM</span>
                                                        <span style={{ fontSize: '0.8125rem', color: 'var(--gray-700)', fontWeight: 500 }}>{trip.startAddress || 'Unknown location'}</span>
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.375rem' }}>
                                                        <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#dc2626' }}>TO</span>
                                                        <span style={{ fontSize: '0.8125rem', color: 'var(--gray-700)', fontWeight: 500 }}>{trip.endAddress || 'Unknown location'}</span>
                                                    </div>
                                                    <div style={{ fontSize: '0.75rem', color: 'var(--gray-400)', marginTop: '0.3rem' }}>
                                                        {fmtDate(trip.startTime)} → {fmtDate(trip.endTime)}
                                                    </div>
                                                </div>

                                                {/* Distance */}
                                                <div style={{ textAlign: 'center' }}>
                                                    <div style={{ fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--gray-400)', marginBottom: '0.25rem' }}>Distance</div>
                                                    <div style={{ fontSize: '1.125rem', fontWeight: 800, color: '#7c3aed', letterSpacing: '-0.02em' }}>{fmtDistance(trip.distance)}</div>
                                                </div>

                                                {/* Duration */}
                                                <div style={{ textAlign: 'center' }}>
                                                    <div style={{ fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--gray-400)', marginBottom: '0.25rem' }}>Duration</div>
                                                    <div style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--gray-800)', letterSpacing: '-0.02em' }}>{fmtDuration(trip.duration)}</div>
                                                </div>

                                                {/* Max speed */}
                                                <div style={{ textAlign: 'center' }}>
                                                    <div style={{ fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--gray-400)', marginBottom: '0.25rem' }}>Max Speed</div>
                                                    <div style={{ fontSize: '1.125rem', fontWeight: 800, color: '#2563eb', letterSpacing: '-0.02em' }}>{fmtSpeed(trip.maxSpeed)}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                            )}

                            {/* ── Stops ── */}
                            {activeTab === 'stops' && (
                                stops.length === 0
                                    ? <EmptyState
                                        icon={<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /></svg>}
                                        title="No stops recorded"
                                        subtitle="Vehicle was continuously moving or no data for this period"
                                    />
                                    : <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        {stops.map((stop, i) => (
                                            <div key={i} style={{
                                                background: 'white', border: '1px solid var(--gray-200)',
                                                borderRadius: 'var(--radius-xl)', padding: '0.875rem 1.25rem',
                                                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                                                display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 0.6fr',
                                                gap: '1rem', alignItems: 'center',
                                            }}>
                                                {/* Address */}
                                                <div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                                                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#16a34a', flexShrink: 0 }} />
                                                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Stop {i + 1}</span>
                                                    </div>
                                                    <div style={{ fontSize: '0.875rem', color: 'var(--gray-700)', fontWeight: 500, lineHeight: 1.4 }}>
                                                        {stop.address || `${stop.latitude?.toFixed(5)}, ${stop.longitude?.toFixed(5)}`}
                                                    </div>
                                                </div>

                                                {/* Arrived */}
                                                <div>
                                                    <div style={{ fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--gray-400)', marginBottom: '0.25rem' }}>Arrived</div>
                                                    <div style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--gray-700)' }}>{fmtDate(stop.startTime)}</div>
                                                </div>

                                                {/* Departed */}
                                                <div>
                                                    <div style={{ fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--gray-400)', marginBottom: '0.25rem' }}>Departed</div>
                                                    <div style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--gray-700)' }}>{fmtDate(stop.endTime)}</div>
                                                </div>

                                                {/* Duration pill */}
                                                <div style={{ textAlign: 'center' }}>
                                                    <div style={{
                                                        display: 'inline-block', padding: '0.375rem 0.875rem',
                                                        background: '#dcfce7', color: '#15803d',
                                                        borderRadius: 'var(--radius-full)', fontSize: '0.9375rem', fontWeight: 800,
                                                    }}>{fmtDuration(stop.duration)}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                            )}

                            {/* ── Summary ── */}
                            {activeTab === 'summary' && (
                                !summary
                                    ? <EmptyState
                                        icon={<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>}
                                        title="No summary data"
                                        subtitle="No activity found for this device and date range"
                                    />
                                    : <div style={{
                                        background: 'white', border: '1px solid var(--gray-200)',
                                        borderRadius: 'var(--radius-xl)', overflow: 'hidden',
                                        boxShadow: '0 1px 3px rgba(0,0,0,0.04)', maxWidth: 600,
                                    }}>
                                        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--gray-100)', background: 'linear-gradient(135deg, #7c3aed0a, #a855f70a)' }}>
                                            <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--gray-700)' }}>
                                                {selectedVehicle?.name || 'Device'} — {dateFrom} to {dateTo}
                                            </div>
                                        </div>
                                        {[
                                            ['Total Distance', fmtDistance(summary.distance)],
                                            ['Total Trips', trips.length],
                                            ['Total Stops', stops.length],
                                            ['Max Speed', fmtSpeed(summary.maxSpeed)],
                                            ['Average Speed', fmtSpeed(summary.averageSpeed)],
                                            ['Engine Hours', fmtDuration(summary.engineHours)],
                                            ['Fuel Consumed', summary.fuelConsumed ? `${summary.fuelConsumed.toFixed(2)} L` : '—'],
                                        ].map(([label, value], i, arr) => (
                                            <div key={label} style={{
                                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                padding: '0.875rem 1.5rem',
                                                borderBottom: i < arr.length - 1 ? '1px solid var(--gray-200)' : 'none',
                                            }}>
                                                <span style={{ fontSize: '0.875rem', color: 'var(--gray-600)' }}>{label}</span>
                                                <span style={{ fontSize: '0.9375rem', fontWeight: 500, color: 'var(--gray-800)' }}>{value}</span>
                                            </div>
                                        ))}
                                    </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}