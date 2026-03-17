'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import NavBar from '@/components/NavBar';
import { apiFetch } from '@/lib/api';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';

const MapComponent = dynamic(() => import('@/components/Map'), { ssr: false, loading: () => <div className="map-loading"><div className="map-loading-spinner" /></div> });

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true });
}
function fmtTime(d) {
    if (!d) return '—';
    return new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}
function fmtDuration(ms) {
    if (!ms) return '—';
    const m = Math.floor(ms / 60000);
    return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}
function knotsToKmh(k) { return Math.round((k || 0) * 1.852); }
function metersToKm(m) { return ((m || 0) / 1000).toFixed(1); }
function timeAgo(d) {
    if (!d) return '—';
    const diff = (new Date() - new Date(d)) / 1000;
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}
function shortAddress(addr) {
    if (!addr) return null;
    const parts = addr.split(',').map(s => s.trim()).filter(Boolean);
    return parts.length <= 2 ? parts.join(', ') : parts.slice(0, 2).join(', ');
}
function getStatus(device, position) {
    const s = (device?.status || '').toLowerCase();
    if (s === 'online') {
        if (position?.speed > 0) return 'online';
        if (position?.fixTime && (Date.now() - new Date(position.fixTime)) / 1000 < 300) return 'online';
        return 'idle';
    }
    if (s === 'unknown') return 'idle';
    return 'offline';
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color, icon }) {
    return (
        <div style={{
            background: 'white', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-xl)',
            padding: '1rem 1.125rem', boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
            display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
        }}>
            <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', background: color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ color, fontSize: '1rem' }}>{icon}</span>
            </div>
            <div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--gray-900)', lineHeight: 1, letterSpacing: '-0.02em' }}>{value}</div>
                <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '0.25rem' }}>{label}</div>
                {sub && <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)', marginTop: '0.125rem' }}>{sub}</div>}
            </div>
        </div>
    );
}

// ── Info row ─────────────────────────────────────────────────────────────────

function InfoRow({ label, value, mono, last }) {
    return (
        <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0.75rem 1.125rem',
            borderBottom: last ? 'none' : '1px solid var(--gray-100)',
        }}>
            <span style={{ fontSize: '0.8125rem', color: 'var(--gray-500)', fontWeight: 500 }}>{label}</span>
            <span style={{
                fontSize: '0.8125rem', color: 'var(--gray-800)', fontWeight: 600,
                fontFamily: mono ? 'monospace' : 'inherit',
                background: mono ? 'var(--gray-50)' : 'transparent',
                padding: mono ? '0.125rem 0.5rem' : 0,
                borderRadius: mono ? '4px' : 0,
                border: mono ? '1px solid var(--gray-200)' : 'none',
            }}>{value || '—'}</span>
        </div>
    );
}

// ── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
    const c = { online: { bg: '#dcfce7', color: '#15803d', dot: '#16a34a' }, idle: { bg: '#fef3c7', color: '#b45309', dot: '#d97706' }, offline: { bg: '#fee2e2', color: '#b91c1c', dot: '#ef4444' } }[status] || { bg: '#f3f4f6', color: '#6b7280', dot: '#9ca3af' };
    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.25rem 0.75rem', borderRadius: '999px', background: c.bg, color: c.color, fontSize: '0.8125rem', fontWeight: 700 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.dot }} />
            {status.charAt(0).toUpperCase() + status.slice(1)}
        </span>
    );
}

// ── Event type config ─────────────────────────────────────────────────────────

function eventConfig(event) {
    const type = event.type || '';
    const alarm = event.attributes?.alarm;
    const map = {
        ignitionOn: { label: 'Ignition On', color: '#16a34a', bg: '#dcfce7', icon: '⚡' },
        ignitionOff: { label: 'Ignition Off', color: '#6b7280', bg: '#f3f4f6', icon: '⚡' },
        deviceOnline: { label: 'Device Online', color: '#2563eb', bg: '#dbeafe', icon: '📶' },
        deviceOffline: { label: 'Device Offline', color: '#6b7280', bg: '#f3f4f6', icon: '📶' },
        overspeed: { label: 'Overspeed', color: '#ea580c', bg: '#ffedd5', icon: '⚠' },
        geofenceEnter: { label: 'Geofence Enter', color: '#0891b2', bg: '#cffafe', icon: '📍' },
        geofenceExit: { label: 'Geofence Exit', color: '#7c3aed', bg: '#ede9fe', icon: '📍' },
        deviceMoving: { label: 'Moving', color: '#0ea5e9', bg: '#e0f2fe', icon: '🚗' },
        deviceStopped: { label: 'Stopped', color: '#78716c', bg: '#f5f5f4', icon: '🅿' },
    };
    if (type === 'alarm') {
        const alarmLabels = { sos: { label: 'SOS Alarm', color: '#dc2626', bg: '#fee2e2', icon: '🆘' }, powerCut: { label: 'Power Cut', color: '#dc2626', bg: '#fee2e2', icon: '⚡' }, hardBraking: { label: 'Hard Braking', color: '#ea580c', bg: '#ffedd5', icon: '🛑' }, hardAcceleration: { label: 'Hard Acceleration', color: '#d97706', bg: '#fef3c7', icon: '🚀' }, lowBattery: { label: 'Low Battery', color: '#ca8a04', bg: '#fef9c3', icon: '🔋' }, vibration: { label: 'Vibration', color: '#7c3aed', bg: '#ede9fe', icon: '📳' }, tampering: { label: 'Tampering', color: '#dc2626', bg: '#fee2e2', icon: '⚠' } };
        return alarmLabels[alarm] || { label: `Alarm: ${alarm || 'Unknown'}`, color: '#dc2626', bg: '#fee2e2', icon: '⚠' };
    }
    return map[type] || { label: type.replace(/([A-Z])/g, ' $1').trim(), color: '#64748b', bg: '#f1f5f9', icon: 'ℹ' };
}

// ── Trip row ──────────────────────────────────────────────────────────────────

function TripRow({ trip, index }) {
    const from = shortAddress(trip.startAddress) || '—';
    const to = shortAddress(trip.endAddress) || '—';
    return (
        <div style={{ padding: '0.875rem 1.125rem', borderBottom: '1px solid var(--gray-100)', display: 'flex', gap: '0.875rem', alignItems: 'flex-start' }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--primary-50)', border: '1px solid var(--primary-200)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary-600)', marginTop: 2 }}>
                {index + 1}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.375rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>{fmtTime(trip.startTime)} → {fmtTime(trip.endTime)}</span>
                    <span style={{ fontSize: '0.7rem', background: 'var(--primary-50)', color: 'var(--primary-600)', padding: '0.1rem 0.5rem', borderRadius: '999px', fontWeight: 600 }}>{metersToKm(trip.distance)} km</span>
                    <span style={{ fontSize: '0.7rem', background: 'var(--gray-100)', color: 'var(--gray-600)', padding: '0.1rem 0.5rem', borderRadius: '999px', fontWeight: 600 }}>{fmtDuration(trip.duration)}</span>
                    <span style={{ fontSize: '0.7rem', background: '#fef3c7', color: '#b45309', padding: '0.1rem 0.5rem', borderRadius: '999px', fontWeight: 600 }}>⚡ {knotsToKmh(trip.maxSpeed)} km/h</span>
                </div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--gray-700)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span style={{ color: '#16a34a', fontWeight: 600 }}>A</span> {from}
                </div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--gray-700)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span style={{ color: '#dc2626', fontWeight: 600 }}>B</span> {to}
                </div>
            </div>
        </div>
    );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function VehicleDetailPage() {
    const router = useRouter();
    const params = useParams();
    const deviceId = params?.id;

    const [device, setDevice] = useState(null);
    const [position, setPosition] = useState(null);
    const [trips, setTrips] = useState([]);
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [tripsLoading, setTripsLoading] = useState(true);
    const [eventsLoading, setEventsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('overview');

    const load = useCallback(async () => {
        const user = await new Promise(resolve => {
            const unsub = onAuthStateChanged(auth, u => { unsub(); resolve(u); });
        });
        if (!user) { router.push('/login'); return; }

        try {
            // Load device list + positions
            const [devRes, posRes] = await Promise.all([
                apiFetch('/api/devices'),
                apiFetch('/api/positions'),
            ]);
            if (devRes.status === 401) { router.push('/login'); return; }

            if (devRes.ok) {
                const devs = await devRes.json();
                const found = devs.find(d => String(d.id) === String(deviceId));
                if (!found) { router.push('/vehicles'); return; }
                setDevice(found);
            }
            if (posRes.ok) {
                const positions = await posRes.json();
                const pos = positions.find(p => String(p.deviceId) === String(deviceId));
                setPosition(pos || null);
            }
        } catch (e) { console.error(e); }
        finally { setLoading(false); }

        // Today's trips
        try {
            const from = new Date(); from.setHours(0, 0, 0, 0);
            const to = new Date(); to.setHours(23, 59, 59, 999);
            const res = await apiFetch(`/api/reports/trips?deviceId=${deviceId}&from=${from.toISOString()}&to=${to.toISOString()}`);
            if (res.ok) { const d = await res.json(); setTrips(Array.isArray(d) ? d : []); }
        } catch (e) { console.error(e); }
        finally { setTripsLoading(false); }

        // Recent events (last 24h)
        try {
            const from = new Date(Date.now() - 24 * 3600 * 1000);
            const to = new Date();
            const res = await apiFetch(`/api/reports/events?deviceId=${deviceId}&from=${from.toISOString()}&to=${to.toISOString()}`);
            if (res.ok) { const d = await res.json(); setEvents(Array.isArray(d) ? d.slice(0, 50) : []); }
        } catch (e) { console.error(e); }
        finally { setEventsLoading(false); }
    }, [deviceId, router]);

    useEffect(() => { load(); }, [load]);

    if (loading) {
        return (
            <div className="dashboard-shell">
                <NavBar />
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="map-loading-spinner" style={{ width: 32, height: 32 }} />
                </div>
            </div>
        );
    }

    if (!device) return null;

    const status = getStatus(device, position);
    const attrs = position?.attributes || {};
    const speedKmh = knotsToKmh(position?.speed);

    // Today's trip totals
    const todayDistance = trips.reduce((s, t) => s + (t.distance || 0), 0);
    const todayDuration = trips.reduce((s, t) => s + (t.duration || 0), 0);
    const todayMaxSpeed = trips.reduce((max, t) => Math.max(max, t.maxSpeed || 0), 0);

    // Map vehicle format
    const mapVehicle = device ? [{
        id: device.id, name: device.name, uniqueId: device.uniqueId,
        status, lastUpdate: device.lastUpdate,
        position: position ? { latitude: position.latitude, longitude: position.longitude, speed: position.speed || 0, course: position.course || 0, fixTime: position.fixTime, address: position.address || null } : null,
        attrs: { ignition: attrs.ignition ?? null, motion: attrs.motion ?? null, batteryLevel: attrs.batteryLevel ?? null, alarm: attrs.alarm ?? null },
    }] : [];

    const TABS = [
        { key: 'overview', label: 'Overview' },
        { key: 'trips', label: `Trips (${trips.length})` },
        { key: 'events', label: `Events (${events.length})` },
    ];

    const tabStyle = (active) => ({
        padding: '0.75rem 1.25rem', fontSize: '0.875rem', fontWeight: active ? 700 : 500,
        color: active ? 'var(--primary-600)' : 'var(--gray-500)',
        borderBottom: active ? '2px solid var(--primary-500)' : '2px solid transparent',
        background: 'transparent', border: 'none',
        borderBottom: active ? '2px solid var(--primary-500)' : '2px solid transparent',
        cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
        transition: 'color 0.15s',
    });

    return (
        <div className="dashboard-shell">
            <NavBar />

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--gray-50)' }}>

                {/* ── Header ── */}
                <div style={{
                    background: 'white', borderBottom: '1px solid var(--gray-200)',
                    padding: '0 1.5rem', minHeight: 64, flexShrink: 0,
                    display: 'flex', alignItems: 'center', gap: '1rem',
                }}>
                    {/* Back button */}
                    <button onClick={() => router.push('/vehicles')} style={{
                        width: 34, height: 34, borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--gray-200)', background: 'var(--gray-50)',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'var(--gray-500)', flexShrink: 0,
                    }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="15 18 9 12 15 6" />
                        </svg>
                    </button>

                    {/* Vehicle icon */}
                    <div style={{
                        width: 40, height: 40, borderRadius: 'var(--radius-md)',
                        background: 'linear-gradient(135deg, #1e3a5f, #2563eb)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        boxShadow: '0 2px 8px rgba(37,99,235,0.25)',
                    }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="1" y="3" width="15" height="13" rx="2" />
                            <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                            <circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" />
                        </svg>
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexWrap: 'wrap' }}>
                            <h1 style={{ fontSize: '1.0625rem', fontWeight: 800, color: 'var(--gray-900)', letterSpacing: '-0.01em' }}>{device.name}</h1>
                            <StatusBadge status={status} />
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--gray-400)', marginTop: '0.125rem' }}>
                            IMEI: {device.uniqueId} · Last seen: {timeAgo(device.lastUpdate)}
                        </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                        {/* <button onClick={() => router.push(`/history?device=${deviceId}`)} style={{
                            height: 34, padding: '0 0.875rem', fontSize: '0.8125rem', fontWeight: 600,
                            fontFamily: 'inherit', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)',
                            background: 'white', color: 'var(--gray-600)', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '0.375rem',
                        }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
                            Route History
                        </button> */}
                    </div>
                </div>

                {/* ── Tabs ── */}
                <div style={{ background: 'white', borderBottom: '1px solid var(--gray-200)', padding: '0 1.5rem', display: 'flex', gap: '0', flexShrink: 0 }}>
                    {TABS.map(t => (
                        <button key={t.key} style={tabStyle(activeTab === t.key)} onClick={() => setActiveTab(t.key)}>
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* ── Body ── */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem' }}>

                    {/* ══ OVERVIEW TAB ══ */}
                    {activeTab === 'overview' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: 1100 }}>

                            {/* Live position map */}
                            {position && (
                                <div style={{ background: 'white', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-xl)', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                                    <div style={{ padding: '0.875rem 1.125rem', borderBottom: '1px solid var(--gray-100)', display: 'flex', alignItems: 'center', gap: '0.625rem', background: 'var(--gray-50)' }}>
                                        <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--gray-700)' }}>Live Position</span>
                                        <span style={{ fontSize: '0.7rem', color: 'var(--gray-400)' }}>Updated {timeAgo(position.fixTime)}</span>
                                        {position.address && <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--gray-500)', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📍 {shortAddress(position.address)}</span>}
                                    </div>
                                    <div style={{ height: 260 }}>
                                        <MapComponent vehicles={mapVehicle} selectedVehicle={device.id} onVehicleSelect={() => { }} />
                                    </div>
                                </div>
                            )}

                            {/* Stat cards */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.875rem' }}>
                                <StatCard label="Current Speed" value={position ? `${speedKmh} km/h` : '—'} icon="⚡" color="#2563eb" sub={position ? (speedKmh > 0 ? 'Moving' : 'Stationary') : 'No signal'} />
                                <StatCard label="Today's Distance" value={tripsLoading ? '…' : `${metersToKm(todayDistance)} km`} icon="📏" color="#16a34a" sub={tripsLoading ? '' : `${trips.length} trips`} />
                                <StatCard label="Drive Time Today" value={tripsLoading ? '…' : fmtDuration(todayDuration)} icon="⏱" color="#7c3aed" />
                                <StatCard label="Today's Max Speed" value={tripsLoading ? '…' : `${knotsToKmh(todayMaxSpeed)} km/h`} icon="🏎" color="#ea580c" />
                                <StatCard label="Ignition" value={attrs.ignition !== undefined && attrs.ignition !== null ? (attrs.ignition ? 'ON' : 'OFF') : '—'} icon="🔑" color={attrs.ignition ? '#16a34a' : '#6b7280'} />
                                <StatCard label="Battery" value={attrs.batteryLevel !== null && attrs.batteryLevel !== undefined ? `${Math.round(attrs.batteryLevel)}%` : '—'} icon="🔋" color={attrs.batteryLevel > 20 ? '#16a34a' : '#dc2626'} />
                            </div>

                            {/* Device info + position details two columns */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>

                                {/* Device info */}
                                <div style={{ background: 'white', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-xl)', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                                    <div style={{ padding: '0.875rem 1.125rem', background: 'var(--gray-50)', borderBottom: '1px solid var(--gray-100)' }}>
                                        <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--gray-700)' }}>Device Information</span>
                                    </div>
                                    <InfoRow label="Vehicle Name" value={device.name} />
                                    <InfoRow label="IMEI / Device ID" value={device.uniqueId} mono />
                                    <InfoRow label="Traccar ID" value={`#${device.id}`} mono />
                                    <InfoRow label="Model" value={device.model} />
                                    <InfoRow label="Category" value={device.category} />
                                    <InfoRow label="Phone" value={device.phone} />
                                    <InfoRow label="Status" value={status.charAt(0).toUpperCase() + status.slice(1)} last />
                                </div>

                                {/* GPS Position */}
                                <div style={{ background: 'white', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-xl)', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                                    <div style={{ padding: '0.875rem 1.125rem', background: 'var(--gray-50)', borderBottom: '1px solid var(--gray-100)' }}>
                                        <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--gray-700)' }}>GPS & Telemetry</span>
                                    </div>
                                    <InfoRow label="Latitude" value={position ? position.latitude.toFixed(6) : '—'} mono />
                                    <InfoRow label="Longitude" value={position ? position.longitude.toFixed(6) : '—'} mono />
                                    <InfoRow label="Altitude" value={position ? `${Math.round(position.altitude || 0)} m` : '—'} />
                                    <InfoRow label="Course" value={position ? `${Math.round(position.course || 0)}°` : '—'} />
                                    <InfoRow label="Satellites" value={attrs.sat !== undefined && attrs.sat !== null ? `${attrs.sat}` : '—'} />
                                    <InfoRow label="Fix Time" value={fmtDate(position?.fixTime)} />
                                    <InfoRow label="Odometer" value={attrs.odometer ? `${(attrs.odometer / 1000).toFixed(0)} km` : '—'} last />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ══ TRIPS TAB ══ */}
                    {activeTab === 'trips' && (
                        <div style={{ maxWidth: 860 }}>
                            {tripsLoading ? (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', padding: '3rem' }}>
                                    <div className="map-loading-spinner" />
                                    <span style={{ color: 'var(--gray-400)', fontSize: '0.875rem' }}>Loading trips…</span>
                                </div>
                            ) : trips.length === 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 2rem', textAlign: 'center', color: 'var(--gray-400)' }}>
                                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" style={{ opacity: 0.3, marginBottom: '1rem' }}>
                                        <rect x="1" y="3" width="15" height="13" rx="2" /><polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                                        <circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" />
                                    </svg>
                                    <p style={{ fontSize: '0.9375rem', fontWeight: 600, marginBottom: '0.375rem' }}>No trips today</p>
                                    <p style={{ fontSize: '0.8125rem' }}>This vehicle hasn't made any detected trips today.</p>
                                </div>
                            ) : (
                                <div style={{ background: 'white', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-xl)', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                                    {/* Summary row */}
                                    <div style={{ padding: '0.875rem 1.125rem', background: 'var(--gray-50)', borderBottom: '1px solid var(--gray-100)', display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                                        {[
                                            { label: 'Trips', value: trips.length },
                                            { label: 'Total Distance', value: `${metersToKm(todayDistance)} km` },
                                            { label: 'Drive Time', value: fmtDuration(todayDuration) },
                                            { label: 'Max Speed', value: `${knotsToKmh(todayMaxSpeed)} km/h` },
                                        ].map(s => (
                                            <div key={s.label}>
                                                <div style={{ fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--gray-400)' }}>{s.label}</div>
                                                <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--gray-800)', marginTop: '0.125rem' }}>{s.value}</div>
                                            </div>
                                        ))}
                                    </div>
                                    {trips.map((trip, i) => <TripRow key={i} trip={trip} index={i} />)}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ══ EVENTS TAB ══ */}
                    {activeTab === 'events' && (
                        <div style={{ maxWidth: 700 }}>
                            {eventsLoading ? (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', padding: '3rem' }}>
                                    <div className="map-loading-spinner" />
                                    <span style={{ color: 'var(--gray-400)', fontSize: '0.875rem' }}>Loading events…</span>
                                </div>
                            ) : events.length === 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 2rem', textAlign: 'center', color: 'var(--gray-400)' }}>
                                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" style={{ opacity: 0.3, marginBottom: '1rem' }}>
                                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
                                    </svg>
                                    <p style={{ fontSize: '0.9375rem', fontWeight: 600, marginBottom: '0.375rem' }}>No events in last 24h</p>
                                    <p style={{ fontSize: '0.8125rem' }}>No alerts or events recorded for this vehicle.</p>
                                </div>
                            ) : (
                                <div style={{ background: 'white', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-xl)', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                                    <div style={{ padding: '0.75rem 1.125rem', background: 'var(--gray-50)', borderBottom: '1px solid var(--gray-100)', fontSize: '0.75rem', fontWeight: 600, color: 'var(--gray-500)' }}>
                                        Last 24 hours · {events.length} events
                                    </div>
                                    {events.map((event, i) => {
                                        const cfg = eventConfig(event);
                                        return (
                                            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.875rem', padding: '0.75rem 1.125rem', borderBottom: i < events.length - 1 ? '1px solid var(--gray-100)' : 'none' }}>
                                                <div style={{ width: 30, height: 30, borderRadius: '50%', background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '0.875rem' }}>
                                                    {cfg.icon}
                                                </div>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontSize: '0.875rem', fontWeight: 600, color: cfg.color }}>{cfg.label}</div>
                                                    <div style={{ fontSize: '0.75rem', color: 'var(--gray-400)', marginTop: '0.125rem' }}>{fmtDate(event.eventTime)}</div>
                                                </div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--gray-400)', flexShrink: 0 }}>{timeAgo(event.eventTime)}</div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}