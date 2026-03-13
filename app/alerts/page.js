'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import NavBar from '@/components/NavBar';
import { apiFetch } from '@/lib/api';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';

// ── Event metadata ────────────────────────────────────────────────────────────

const EVENT_META = {
    // Ignition
    ignitionOn: {
        label: 'Ignition On',
        color: '#16a34a',
        bg: '#dcfce7',
        icon: (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8h1a4 4 0 0 1 0 8h-1" /><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
                <line x1="6" y1="1" x2="6" y2="4" /><line x1="10" y1="1" x2="10" y2="4" /><line x1="14" y1="1" x2="14" y2="4" />
            </svg>
        ),
    },
    ignitionOff: {
        label: 'Ignition Off',
        color: '#64748b',
        bg: '#f1f5f9',
        icon: (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8h1a4 4 0 0 1 0 8h-1" /><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
                <line x1="6" y1="1" x2="6" y2="4" /><line x1="10" y1="1" x2="10" y2="4" /><line x1="14" y1="1" x2="14" y2="4" />
            </svg>
        ),
    },
    // Device status
    deviceOnline: {
        label: 'Device Online',
        color: '#2563eb',
        bg: '#dbeafe',
        icon: (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12.55a11 11 0 0 1 14.08 0" /><path d="M1.42 9a16 16 0 0 1 21.16 0" />
                <path d="M8.53 16.11a6 6 0 0 1 6.95 0" /><circle cx="12" cy="20" r="1" fill="currentColor" />
            </svg>
        ),
    },
    deviceOffline: {
        label: 'Device Offline',
        color: '#dc2626',
        bg: '#fee2e2',
        icon: (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="1" y1="1" x2="23" y2="23" />
                <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" /><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
                <path d="M10.71 5.05A16 16 0 0 1 22.56 9" /><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
                <path d="M8.53 16.11a6 6 0 0 1 6.95 0" /><circle cx="12" cy="20" r="1" fill="currentColor" />
            </svg>
        ),
    },
    // Alarms
    alarm: {
        label: 'Alarm',
        color: '#d97706',
        bg: '#fef3c7',
        icon: (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
        ),
    },
    overspeed: {
        label: 'Overspeed',
        color: '#ea580c',
        bg: '#ffedd5',
        icon: (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
        ),
    },
    // Geofence
    geofenceEnter: {
        label: 'Geofence Enter',
        color: '#0891b2',
        bg: '#cffafe',
        icon: (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z" />
                <circle cx="12" cy="10" r="3" />
            </svg>
        ),
    },
    geofenceExit: {
        label: 'Geofence Exit',
        color: '#7c3aed',
        bg: '#ede9fe',
        icon: (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z" />
                <circle cx="12" cy="10" r="3" />
            </svg>
        ),
    },
    // Movement
    deviceMoving: {
        label: 'Moving',
        color: '#16a34a',
        bg: '#dcfce7',
        icon: (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="5 12 19 12" /><polyline points="12 5 19 12 12 19" />
            </svg>
        ),
    },
    deviceStopped: {
        label: 'Stopped',
        color: '#64748b',
        bg: '#f1f5f9',
        icon: (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
            </svg>
        ),
    },
};

// Specific alarm subtypes
const ALARM_META = {
    sos: { label: 'SOS Alarm', color: '#dc2626', bg: '#fee2e2' },
    powerCut: { label: 'Power Cut', color: '#dc2626', bg: '#fee2e2' },
    hardBraking: { label: 'Hard Braking', color: '#ea580c', bg: '#ffedd5' },
    hardAcceleration: { label: 'Hard Acceleration', color: '#d97706', bg: '#fef3c7' },
    hardCornering: { label: 'Hard Cornering', color: '#d97706', bg: '#fef3c7' },
    overspeed: { label: 'Overspeed', color: '#ea580c', bg: '#ffedd5' },
    vibration: { label: 'Vibration', color: '#7c3aed', bg: '#ede9fe' },
    movement: { label: 'Movement Alert', color: '#2563eb', bg: '#dbeafe' },
    lowBattery: { label: 'Low Battery', color: '#d97706', bg: '#fef3c7' },
    tampering: { label: 'Tamper Alert', color: '#dc2626', bg: '#fee2e2' },
};

function getEventMeta(event) {
    // Alarm events: check alarm subtype
    if (event.type === 'alarm' && event.attributes?.alarm) {
        const sub = ALARM_META[event.attributes.alarm];
        if (sub) return { ...sub, icon: EVENT_META.alarm.icon };
    }
    return EVENT_META[event.type] || {
        label: event.type?.replace(/([A-Z])/g, ' $1').trim() || 'Unknown Event',
        color: '#64748b', bg: '#f1f5f9',
        icon: (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
        ),
    };
}

function fmtDateTime(d) {
    if (!d) return '—';
    return new Date(d).toLocaleString('en-IN', {
        month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
    });
}
function fmtTimeAgo(d) {
    if (!d) return '';
    const diff = (Date.now() - new Date(d)) / 1000;
    if (diff < 60) return `${Math.floor(diff)}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

// ── Filter types for the UI ───────────────────────────────────────────────────

const FILTER_TYPES = [
    { key: 'all', label: 'All Events' },
    { key: 'alarm', label: 'Alarms' },
    { key: 'ignitionOn', label: 'Ignition On' },
    { key: 'ignitionOff', label: 'Ignition Off' },
    { key: 'deviceOnline', label: 'Online' },
    { key: 'deviceOffline', label: 'Offline' },
    { key: 'overspeed', label: 'Overspeed' },
    { key: 'geofenceEnter', label: 'Geo Enter' },
    { key: 'geofenceExit', label: 'Geo Exit' },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AlertsPage() {
    const router = useRouter();

    const [devices, setDevices] = useState([]);
    const [selectedDevice, setSelectedDevice] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [filterType, setFilterType] = useState('all');

    const [events, setEvents] = useState([]);
    const [devicesLoading, setDevicesLoading] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [hasSearched, setHasSearched] = useState(false);

    // Default: today
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

    const fetchEvents = useCallback(async () => {
        if (!selectedDevice || !dateFrom || !dateTo) return;
        setLoading(true);
        setError('');
        setHasSearched(true);
        setEvents([]);

        const from = new Date(`${dateFrom}T00:00:00`).toISOString();
        const to = new Date(`${dateTo}T23:59:59`).toISOString();
        const qs = new URLSearchParams({ deviceId: selectedDevice, from, to });
        // Don't pass type to backend — we filter on frontend for better UX
        // (avoids extra API call when switching filter tabs)

        try {
            const res = await apiFetch(`/api/reports/events?${qs}`);
            if (res.ok) {
                setEvents(await res.json());
            } else {
                const body = await res.json().catch(() => ({}));
                setError(body.error || 'Failed to fetch events');
            }
        } catch (e) {
            setError('Connection error. Please try again.');
        } finally {
            setLoading(false);
        }
    }, [selectedDevice, dateFrom, dateTo]);

    // Filter events by selected type
    const filteredEvents = filterType === 'all'
        ? events
        : events.filter(e => {
            if (filterType === 'alarm') return e.type === 'alarm';
            return e.type === filterType;
        });

    // Count by type for filter badges
    const countByType = {};
    for (const e of events) {
        countByType[e.type] = (countByType[e.type] || 0) + 1;
        if (e.type === 'alarm') countByType['alarm'] = (countByType['alarm'] || 0) + 1;
    }

    const selectedVehicle = devices.find(d => String(d.id) === selectedDevice);

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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
                        <div style={{
                            width: 38, height: 38, borderRadius: 'var(--radius-md)',
                            background: 'linear-gradient(135deg, #dc2626, #f87171)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: '0 2px 8px rgba(220,38,38,0.3)',
                        }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                            </svg>
                        </div>
                        <div>
                            <h1 style={{ fontSize: '1.0625rem', fontWeight: 700, color: 'var(--gray-900)', lineHeight: 1.2 }}>Alerts & Events</h1>
                            <p style={{ fontSize: '0.75rem', color: 'var(--gray-400)' }}>
                                {hasSearched && !loading ? `${filteredEvents.length} event${filteredEvents.length !== 1 ? 's' : ''} found` : 'Device activity log'}
                            </p>
                        </div>
                    </div>

                    {/* Controls */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexWrap: 'wrap' }}>
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
                        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                            style={{
                                height: 34, padding: '0 0.625rem', fontSize: '0.8125rem',
                                border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)',
                                background: 'white', color: 'var(--gray-700)', fontFamily: 'var(--font-sans)',
                            }} />
                        <span style={{ fontSize: '0.8125rem', color: 'var(--gray-400)', fontWeight: 500 }}>→</span>
                        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                            style={{
                                height: 34, padding: '0 0.625rem', fontSize: '0.8125rem',
                                border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)',
                                background: 'white', color: 'var(--gray-700)', fontFamily: 'var(--font-sans)',
                            }} />
                        <button onClick={fetchEvents} disabled={loading || !selectedDevice || devicesLoading}
                            style={{
                                height: 34, padding: '0 1.125rem', fontSize: '0.8125rem', fontWeight: 600,
                                fontFamily: 'var(--font-sans)', border: 'none', borderRadius: 'var(--radius-md)',
                                background: loading ? 'var(--gray-200)' : 'linear-gradient(135deg, #dc2626, #ef4444)',
                                color: loading ? 'var(--gray-400)' : 'white',
                                cursor: loading ? 'not-allowed' : 'pointer',
                                display: 'flex', alignItems: 'center', gap: '0.375rem',
                                boxShadow: loading ? 'none' : '0 2px 6px rgba(220,38,38,0.3)',
                            }}>
                            {loading
                                ? <><div className="map-loading-spinner" style={{ width: 13, height: 13, borderWidth: 2 }} />Loading…</>
                                : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3" /></svg>Load Events</>
                            }
                        </button>
                    </div>
                </div>

                {/* ── Body ── */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

                    {/* Filter type pills */}
                    {hasSearched && !loading && events.length > 0 && (
                        <div style={{
                            padding: '0.75rem 1.75rem', background: 'white',
                            borderBottom: '1px solid var(--gray-200)',
                            display: 'flex', gap: '0.375rem', flexWrap: 'wrap', flexShrink: 0,
                        }}>
                            {FILTER_TYPES.map(ft => {
                                const count = ft.key === 'all' ? events.length : (countByType[ft.key] || 0);
                                if (ft.key !== 'all' && count === 0) return null;
                                const isActive = filterType === ft.key;
                                return (
                                    <button key={ft.key} onClick={() => setFilterType(ft.key)}
                                        style={{
                                            padding: '0.3125rem 0.75rem', fontSize: '0.75rem', fontWeight: 600,
                                            fontFamily: 'var(--font-sans)', borderRadius: 'var(--radius-full)',
                                            border: isActive ? 'none' : '1px solid var(--gray-200)',
                                            background: isActive ? '#1e3a5f' : 'white',
                                            color: isActive ? 'white' : 'var(--gray-600)',
                                            cursor: 'pointer', transition: 'all 0.12s',
                                            display: 'flex', alignItems: 'center', gap: '0.375rem',
                                        }}>
                                        {ft.label}
                                        <span style={{
                                            fontSize: '0.6875rem', fontWeight: 700,
                                            padding: '0 4px', minWidth: 16, height: 16,
                                            borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            background: isActive ? 'rgba(255,255,255,0.2)' : 'var(--gray-100)',
                                            color: isActive ? 'white' : 'var(--gray-500)',
                                        }}>{count}</span>
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* Events list */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.75rem' }}>

                        {error && (
                            <div style={{
                                marginBottom: '1rem', padding: '0.875rem 1rem',
                                background: '#fef2f2', border: '1px solid #fecaca',
                                borderRadius: 'var(--radius-lg)', color: '#b91c1c',
                                fontSize: '0.875rem', fontWeight: 500,
                            }}>⚠ {error}</div>
                        )}

                        {/* Idle state */}
                        {!hasSearched && (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '6rem', gap: '1rem' }}>
                                <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="var(--gray-200)" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                                </svg>
                                <p style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--gray-400)' }}>Select a vehicle and date range, then click Load Events</p>
                            </div>
                        )}

                        {hasSearched && !loading && filteredEvents.length === 0 && (
                            <div style={{
                                display: 'flex', flexDirection: 'column', alignItems: 'center',
                                padding: '4rem', background: 'var(--gray-50)',
                                borderRadius: 'var(--radius-xl)', border: '1.5px dashed var(--gray-200)',
                                gap: '0.75rem', color: 'var(--gray-400)',
                            }}>
                                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                                </svg>
                                <span style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--gray-500)' }}>
                                    {filterType === 'all' ? 'No events for this period' : `No ${FILTER_TYPES.find(f => f.key === filterType)?.label || ''} events`}
                                </span>
                            </div>
                        )}

                        {/* Events timeline */}
                        {hasSearched && !loading && filteredEvents.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                                {filteredEvents.map((event, i) => {
                                    const meta = getEventMeta(event);
                                    const isLast = i === filteredEvents.length - 1;

                                    return (
                                        <div key={event.id || i} style={{ display: 'flex', gap: '0.875rem', paddingBottom: isLast ? 0 : '0.125rem' }}>
                                            {/* Timeline line */}
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                                                <div style={{
                                                    width: 32, height: 32, borderRadius: '50%',
                                                    background: meta.bg, color: meta.color,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    flexShrink: 0, border: `1.5px solid ${meta.color}30`,
                                                    marginTop: '0.75rem',
                                                }}>{meta.icon}</div>
                                                {!isLast && (
                                                    <div style={{ width: 1.5, flex: 1, background: 'var(--gray-200)', marginTop: '2px', minHeight: 12 }} />
                                                )}
                                            </div>

                                            {/* Card */}
                                            <div style={{
                                                flex: 1, background: 'white',
                                                border: '1px solid var(--gray-200)',
                                                borderRadius: 'var(--radius-xl)',
                                                padding: '0.75rem 1rem',
                                                marginTop: '0.75rem',
                                                boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                                                marginBottom: isLast ? 0 : '0.375rem',
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                        <span style={{
                                                            padding: '0.1875rem 0.625rem', borderRadius: 'var(--radius-full)',
                                                            fontSize: '0.75rem', fontWeight: 700,
                                                            background: meta.bg, color: meta.color,
                                                        }}>{meta.label}</span>
                                                        {selectedVehicle && (
                                                            <span style={{ fontSize: '0.8125rem', color: 'var(--gray-600)', fontWeight: 500 }}>{selectedVehicle.name}</span>
                                                        )}
                                                    </div>
                                                    <span style={{ fontSize: '0.75rem', color: 'var(--gray-400)' }}>{fmtTimeAgo(event.eventTime)}</span>
                                                </div>

                                                <div style={{ fontSize: '0.8125rem', color: 'var(--gray-500)' }}>{fmtDateTime(event.eventTime)}</div>

                                                {/* Extra attributes */}
                                                {event.attributes && Object.keys(event.attributes).length > 0 && (
                                                    <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                        {Object.entries(event.attributes).map(([k, v]) => (
                                                            <span key={k} style={{
                                                                padding: '0.125rem 0.5rem', borderRadius: 'var(--radius-sm)',
                                                                background: 'var(--gray-50)', border: '1px solid var(--gray-200)',
                                                                fontSize: '0.6875rem', color: 'var(--gray-600)',
                                                            }}>
                                                                <span style={{ color: 'var(--gray-400)' }}>{k}:</span> {String(v)}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}