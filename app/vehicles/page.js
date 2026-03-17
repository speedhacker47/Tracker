'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import NavBar from '@/components/NavBar';
import { apiFetch } from '@/lib/api';
import { auth } from '@/lib/firebase';

const REFRESH_INTERVAL = 30000;

// ── Helpers ───────────────────────────────────────────────────────────────────

function getVehicleStatus(device, position) {
    const s = (device.status || '').toLowerCase();
    if (s === 'online') {
        if (position?.speed > 0) return 'online';
        if (position?.fixTime && (new Date() - new Date(position.fixTime)) / 1000 < 300) return 'online';
        return 'idle';
    }
    if (s === 'unknown') return 'idle';
    return 'offline';
}

function formatDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true });
}
function formatTimeAgo(d) {
    if (!d) return '—';
    const diff = (new Date() - new Date(d)) / 1000;
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

const STATUS_DOT = {
    online: '#1e8e3e',
    idle: '#f9ab00',
    offline: '#dadce0',
};

const STATUS_BADGE = {
    online: { bg: '#e6f4ea', color: '#137333', label: 'Online' },
    idle: { bg: '#fef9e7', color: '#e37400', label: 'Idle' },
    offline: { bg: '#f8f9fa', color: '#80868b', label: 'Offline' },
};

// ── Sub-components ────────────────────────────────────────────────────────────

function SortIcon({ col, sortBy, sortDir }) {
    if (sortBy !== col) return <span style={{ color: 'var(--gray-400)', fontSize: '0.7rem', marginLeft: 2 }}>↕</span>;
    return <span style={{ color: 'var(--primary-500)', fontSize: '0.75rem', marginLeft: 2 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>;
}

function AlarmBadge({ alarm }) {
    if (!alarm) return null;
    const labels = { sos: 'SOS', panic: 'SOS', overspeed: 'Overspeed', geofenceEnter: 'Geo In', geofenceExit: 'Geo Out', powerCut: 'Power Cut', lowBattery: 'Low Bat', vibration: 'Vibration' };
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.7rem', fontWeight: 500,
            padding: '0.15rem 0.4rem', borderRadius: 'var(--radius-sm)',
            background: 'var(--danger-50)', color: 'var(--danger-600)',
            border: '1px solid var(--danger-100)', animation: 'alarm-pulse 1.5s ease-in-out infinite',
            marginLeft: '0.375rem',
        }}>
            ⚠ {labels[alarm] || alarm}
        </span>
    );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function VehiclesPage() {
    const router = useRouter();
    const [devices, setDevices] = useState([]);
    const [positions, setPositions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [sortBy, setSortBy] = useState('status');
    const [sortDir, setSortDir] = useState('asc');
    const [expandedRow, setExpandedRow] = useState(null);
    const [lastRefresh, setLastRefresh] = useState(null);
    const [refreshing, setRefreshing] = useState(false);

    const fetchData = useCallback(async (silent = false) => {
        const { onAuthStateChanged } = await import('firebase/auth');
        const user = await new Promise((resolve) => {
            const unsub = onAuthStateChanged(auth, (u) => { unsub(); resolve(u); });
        });
        if (!user) { router.push('/login'); return; }

        if (!silent) setLoading(true);
        else setRefreshing(true);

        try {
            const [devRes, posRes] = await Promise.all([
                apiFetch('/api/devices'),
                apiFetch('/api/positions'),
            ]);
            if (devRes.status === 401) { router.push('/login'); return; }
            if (devRes.ok && posRes.ok) {
                setDevices(await devRes.json());
                setPositions(await posRes.json());
                setLastRefresh(new Date());
            }
        } catch (err) {
            console.error('Error:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [router]);

    useEffect(() => {
        fetchData(false);
        const interval = setInterval(() => fetchData(true), REFRESH_INTERVAL);
        return () => clearInterval(interval);
    }, [fetchData]);

    const vehicles = devices.map((device) => {
        const position = positions.find((p) => p.deviceId === device.id) || null;
        const attrs = position?.attributes || {};
        return {
            id: device.id,
            name: device.name || `Device ${device.id}`,
            uniqueId: device.uniqueId,
            vehicleNumber: device.vehicleNumber || null,
            imei: device.imei || device.uniqueId,
            status: getVehicleStatus(device, position),
            lastUpdate: device.lastUpdate,
            position,
            ignition: attrs.ignition ?? null,
            motion: attrs.motion ?? null,
            batteryLevel: attrs.batteryLevel ?? null,
            alarm: attrs.alarm ?? null,
            sat: attrs.sat ?? null,
            odometer: attrs.odometer ?? null,
            hours: attrs.hours ?? null,
        };
    });

    const stats = vehicles.reduce(
        (acc, v) => { acc[v.status] = (acc[v.status] || 0) + 1; acc.total++; return acc; },
        { online: 0, idle: 0, offline: 0, total: 0 }
    );

    const handleSort = (col) => {
        if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortBy(col); setSortDir('asc'); }
    };

    const filtered = vehicles.filter(v => {
        const q = search.toLowerCase();
        const matchSearch = !q || v.name.toLowerCase().includes(q) ||
            (v.uniqueId && v.uniqueId.toLowerCase().includes(q)) ||
            (v.vehicleNumber && v.vehicleNumber.toLowerCase().includes(q));
        const matchStatus = statusFilter === 'all' || v.status === statusFilter;
        return matchSearch && matchStatus;
    });

    const sorted = [...filtered].sort((a, b) => {
        let av, bv;
        if (sortBy === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
        else if (sortBy === 'status') { const o = { online: 0, idle: 1, offline: 2 }; av = o[a.status]; bv = o[b.status]; }
        else if (sortBy === 'speed') { av = a.position?.speed || 0; bv = b.position?.speed || 0; }
        else if (sortBy === 'lastUpdate') { av = new Date(a.lastUpdate || 0); bv = new Date(b.lastUpdate || 0); }
        else return 0;
        if (av < bv) return sortDir === 'asc' ? -1 : 1;
        if (av > bv) return sortDir === 'asc' ? 1 : -1;
        return 0;
    });

    const TAB_FILTERS = [
        { key: 'all', label: 'All vehicles', count: stats.total },
        { key: 'online', label: 'Online', count: stats.online },
        { key: 'idle', label: 'Idle', count: stats.idle },
        { key: 'offline', label: 'Offline', count: stats.offline },
    ];

    const COLUMNS = [
        { key: 'name', label: 'Vehicle Name' },
        { key: null, label: 'Identifier' },
        { key: 'status', label: 'Status' },
        { key: 'speed', label: 'Speed' },
        { key: 'lastUpdate', label: 'Last Activity' },
        { key: null, label: 'Actions' },
    ];

    if (loading) {
        return (
            <div className="dashboard-shell">
                <NavBar />
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--gray-50)' }}>
                    <div className="map-loading-spinner" style={{ width: 32, height: 32 }} />
                </div>
            </div>
        );
    }

    return (
        <div className="dashboard-shell">
            <NavBar />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--gray-50)', overflow: 'hidden' }}>

                {/* ── Top header bar ── */}
                <div style={{
                    background: 'white', borderBottom: '1px solid var(--gray-200)',
                    padding: '0 24px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    minHeight: 56, flexShrink: 0,
                }}>
                    {/* Left: title */}
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                        <h1 style={{ fontSize: '1.125rem', fontWeight: 400, color: 'var(--gray-800)', margin: 0 }}>
                            Vehicles
                        </h1>
                        <span style={{ fontSize: '0.875rem', color: 'var(--gray-600)' }}>{vehicles.length}</span>
                    </div>

                    {/* Right: search + add + refresh */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        {/* Search */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'white', border: '1px solid var(--gray-300)', borderRadius: 'var(--radius-sm)', padding: '0.4rem 0.875rem', minWidth: 220 }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--gray-500)', flexShrink: 0 }}>
                                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                            </svg>
                            <input
                                type="text"
                                placeholder="Search devices..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: '0.875rem', fontFamily: 'var(--font-sans)', color: 'var(--gray-800)', width: '100%' }}
                            />
                        </div>

                        {/* Add Device */}
                        <button
                            onClick={() => router.push('/claim')}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '0.375rem',
                                padding: '0.4rem 1rem', fontSize: '0.875rem', fontWeight: 500,
                                fontFamily: 'var(--font-sans)', color: 'white',
                                background: 'var(--primary-500)', border: 'none',
                                borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                                transition: 'background var(--transition-fast)',
                                whiteSpace: 'nowrap',
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--primary-600)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'var(--primary-500)'}
                        >
                            + Add Device
                        </button>

                        {/* Refresh */}
                        <button
                            onClick={() => fetchData(true)}
                            title="Refresh"
                            style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                width: 34, height: 34, background: 'white',
                                border: '1px solid var(--gray-300)', borderRadius: 'var(--radius-sm)',
                                cursor: 'pointer', color: 'var(--gray-600)',
                                transition: 'background var(--transition-fast)',
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--gray-50)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'white'}
                        >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                                strokeLinecap="round" strokeLinejoin="round"
                                style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }}>
                                <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
                                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* ── Subtitle bar (sync time) ── */}
                <div style={{ background: 'white', padding: '4px 24px 0', flexShrink: 0 }}>
                    <p style={{ fontSize: '0.75rem', color: 'var(--gray-600)', margin: 0 }}>
                        {lastRefresh ? `Last synced: ${formatTimeAgo(lastRefresh)}` : 'Loading...'}
                    </p>
                </div>

                {/* ── Tab filters ── */}
                <div style={{
                    background: 'white', padding: '0 24px',
                    borderBottom: '1px solid var(--gray-200)',
                    display: 'flex', alignItems: 'center', gap: '0',
                    flexShrink: 0,
                }}>
                    {TAB_FILTERS.map(({ key, label, count }) => {
                        const active = statusFilter === key;
                        return (
                            <button
                                key={key}
                                onClick={() => setStatusFilter(key)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '0.35rem',
                                    padding: '10px 14px', fontSize: '0.8125rem',
                                    fontWeight: active ? 500 : 400,
                                    fontFamily: 'var(--font-sans)',
                                    color: active ? 'var(--primary-500)' : 'var(--gray-700)',
                                    background: 'transparent', border: 'none',
                                    borderBottom: active ? '2px solid var(--primary-500)' : '2px solid transparent',
                                    cursor: 'pointer', whiteSpace: 'nowrap',
                                    transition: 'color var(--transition-fast)',
                                    marginBottom: -1,
                                }}
                            >
                                {label}
                                <span style={{
                                    fontSize: '0.75rem',
                                    color: active ? 'var(--primary-500)' : 'var(--gray-500)',
                                }}>{count}</span>
                            </button>
                        );
                    })}
                </div>

                {/* ── Table area ── */}
                <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px' }}>
                    {sorted.length === 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem', color: 'var(--gray-600)', background: 'white', borderRadius: 'var(--radius-md)', border: '1px solid var(--gray-200)' }}>
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" style={{ opacity: 0.25, marginBottom: '1rem', color: 'var(--gray-500)' }}>
                                <rect x="1" y="3" width="15" height="13" rx="2" /><polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                                <circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" />
                            </svg>
                            <p style={{ fontWeight: 400, marginBottom: '0.5rem', fontSize: '0.9375rem' }}>
                                {search || statusFilter !== 'all' ? 'No vehicles match your filters' : 'No vehicles found'}
                            </p>
                            {!search && statusFilter === 'all' && (
                                <button onClick={() => router.push('/claim')} style={{ marginTop: '0.5rem', padding: '0.5rem 1.25rem', background: 'var(--primary-500)', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '0.875rem', fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer' }}>
                                    + Add your first device
                                </button>
                            )}
                        </div>
                    ) : (
                        <div style={{ background: 'white', borderRadius: 'var(--radius-md)', border: '1px solid var(--gray-200)', overflow: 'hidden' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--gray-200)' }}>
                                        {COLUMNS.map((col, i) => (
                                            <th
                                                key={i}
                                                onClick={() => col.key && handleSort(col.key)}
                                                style={{
                                                    padding: '10px 16px', textAlign: 'left',
                                                    fontSize: '0.75rem', fontWeight: 400,
                                                    color: sortBy === col.key ? 'var(--primary-500)' : 'var(--gray-700)',
                                                    cursor: col.key ? 'pointer' : 'default',
                                                    whiteSpace: 'nowrap', userSelect: 'none',
                                                    background: 'white',
                                                }}
                                            >
                                                {col.label}
                                                {col.key && <SortIcon col={col.key} sortBy={sortBy} sortDir={sortDir} />}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {sorted.map((v) => {
                                        const badge = STATUS_BADGE[v.status] || STATUS_BADGE.offline;
                                        const isExpanded = expandedRow === v.id;
                                        return (
                                            <React.Fragment key={v.id}>
                                                <tr
                                                    onClick={() => setExpandedRow(isExpanded ? null : v.id)}
                                                    style={{ cursor: 'pointer', borderBottom: '1px solid var(--gray-200)', transition: 'background 0.1s' }}
                                                    onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = 'var(--gray-50)'; }}
                                                    onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = 'white'; }}
                                                >
                                                    {/* Vehicle name */}
                                                    <td style={{ padding: '12px 16px' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_DOT[v.status], flexShrink: 0, display: 'inline-block' }} />
                                                            <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--gray-800)' }}>{v.name}</span>
                                                            {v.alarm && <AlarmBadge alarm={v.alarm} />}
                                                        </div>
                                                    </td>

                                                    {/* Identifier */}
                                                    <td style={{ padding: '12px 16px' }}>
                                                        <div style={{ fontSize: '0.8125rem', color: 'var(--gray-700)', fontFamily: 'monospace' }}>{v.vehicleNumber || v.uniqueId}</div>
                                                        {v.vehicleNumber && <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)', fontFamily: 'monospace' }}>{v.uniqueId}</div>}
                                                    </td>

                                                    {/* Status */}
                                                    <td style={{ padding: '12px 16px' }}>
                                                        <span style={{
                                                            display: 'inline-flex', alignItems: 'center',
                                                            padding: '0.2rem 0.625rem', borderRadius: 'var(--radius-sm)',
                                                            fontSize: '0.75rem', fontWeight: 500,
                                                            background: badge.bg, color: badge.color,
                                                        }}>
                                                            {badge.label}
                                                        </span>
                                                    </td>

                                                    {/* Speed */}
                                                    <td style={{ padding: '12px 16px', fontSize: '0.875rem', color: v.position?.speed > 0 ? 'var(--gray-800)' : 'var(--gray-500)' }}>
                                                        {v.position ? `${Math.round(v.position.speed * 1.852)} km/h` : '—'}
                                                    </td>

                                                    {/* Last Activity */}
                                                    <td style={{ padding: '12px 16px', fontSize: '0.875rem', color: 'var(--gray-600)' }}>
                                                        {v.position?.fixTime ? formatTimeAgo(v.position.fixTime) : formatDate(v.lastUpdate)}
                                                    </td>

                                                    {/* Actions */}
                                                    <td style={{ padding: '12px 16px' }}>
                                                        <div style={{ display: 'flex', gap: '0.375rem' }}>
                                                            <button
                                                                title="View on map"
                                                                onClick={e => { e.stopPropagation(); router.push('/dashboard'); }}
                                                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--gray-500)', borderRadius: 'var(--radius-sm)', transition: 'color var(--transition-fast), background var(--transition-fast)' }}
                                                                onMouseEnter={e => { e.currentTarget.style.color = 'var(--primary-500)'; e.currentTarget.style.background = 'var(--primary-50)'; }}
                                                                onMouseLeave={e => { e.currentTarget.style.color = 'var(--gray-500)'; e.currentTarget.style.background = 'transparent'; }}
                                                            >
                                                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                    <circle cx="12" cy="12" r="3" /><path d="M12 2v4" /><path d="M12 18v4" /><path d="M4.93 4.93l2.83 2.83" /><path d="M16.24 16.24l2.83 2.83" /><path d="M2 12h4" /><path d="M18 12h4" /><path d="M4.93 19.07l2.83-2.83" /><path d="M16.24 7.76l2.83-2.83" />
                                                                </svg>
                                                            </button>
                                                            {/* <button
                                                                title="Route history"
                                                                onClick={e => { e.stopPropagation(); router.push('/history'); }}
                                                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--gray-500)', borderRadius: 'var(--radius-sm)', transition: 'color var(--transition-fast), background var(--transition-fast)' }}
                                                                onMouseEnter={e => { e.currentTarget.style.color = 'var(--primary-500)'; e.currentTarget.style.background = 'var(--primary-50)'; }}
                                                                onMouseLeave={e => { e.currentTarget.style.color = 'var(--gray-500)'; e.currentTarget.style.background = 'transparent'; }}
                                                            >
                                                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                                                                </svg>
                                                            </button> */}
                                                            <button
                                                                title="Full details"
                                                                onClick={e => { e.stopPropagation(); router.push(`/vehicles/${v.id}`); }}
                                                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--gray-500)', borderRadius: 'var(--radius-sm)', transition: 'color var(--transition-fast), background var(--transition-fast)' }}
                                                                onMouseEnter={e => { e.currentTarget.style.color = 'var(--primary-500)'; e.currentTarget.style.background = 'var(--primary-50)'; }}
                                                                onMouseLeave={e => { e.currentTarget.style.color = 'var(--gray-500)'; e.currentTarget.style.background = 'transparent'; }}
                                                            >
                                                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                                                                </svg>
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>

                                                {/* Expanded detail row */}
                                                {isExpanded && (
                                                    <tr key={`${v.id}-exp`}>
                                                        <td colSpan={6} style={{ padding: 0, borderBottom: '1px solid var(--gray-200)' }}>
                                                            <div style={{ background: 'var(--gray-50)', padding: '1.25rem 2rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '1.25rem' }}>
                                                                {[
                                                                    { label: 'Vehicle Name', value: v.name },
                                                                    { label: 'Number Plate', value: v.vehicleNumber || '—' },
                                                                    { label: 'IMEI', value: v.imei || v.uniqueId },
                                                                    { label: 'Traccar ID', value: `#${v.id}` },
                                                                    { label: 'Altitude', value: v.position ? `${Math.round(v.position.altitude || 0)} m` : '—' },
                                                                    { label: 'Course', value: v.position ? `${Math.round(v.position.course || 0)}°` : '—' },
                                                                    { label: 'GPS Fix', value: v.position ? (v.position.valid !== false ? 'Valid' : 'No fix') : '—' },
                                                                    { label: 'Satellites', value: v.sat !== null ? `${v.sat} sats` : '—' },
                                                                    { label: 'Ignition', value: v.ignition !== null ? (v.ignition ? 'On' : 'Off') : '—' },
                                                                    { label: 'Motion', value: v.motion !== null ? (v.motion ? 'Moving' : 'Parked') : '—' },
                                                                    { label: 'Battery', value: v.batteryLevel !== null ? `${Math.round(v.batteryLevel)}%` : '—' },
                                                                    { label: 'Odometer', value: v.odometer !== null ? `${(v.odometer / 1000).toFixed(0)} km` : '—' },
                                                                    { label: 'Engine Hours', value: v.hours !== null ? `${Math.round(v.hours / 3600000)}h` : '—' },
                                                                    { label: 'Fix Time', value: v.position ? formatDate(v.position.fixTime) : '—' },
                                                                ].map(({ label, value }) => (
                                                                    <div key={label}>
                                                                        <div style={{ fontSize: '0.6875rem', fontWeight: 400, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--gray-600)', marginBottom: '0.2rem' }}>{label}</div>
                                                                        <div style={{ fontSize: '0.875rem', color: 'var(--gray-800)' }}>{value}</div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>

                            {/* Footer */}
                            <div style={{ padding: '8px 16px', borderTop: '1px solid var(--gray-200)', fontSize: '0.75rem', color: 'var(--gray-600)', display: 'flex', justifyContent: 'space-between' }}>
                                <span>Showing {sorted.length} of {vehicles.length} vehicles</span>
                                <span>Click a row to expand details</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}