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

const STATUS_META = {
    online: { label: 'Online', dotColor: 'var(--success-500)', bg: 'var(--success-50)', color: 'var(--success-700)' },
    idle: { label: 'Idle', dotColor: 'var(--warning-500)', bg: 'var(--warning-50)', color: 'var(--warning-700)' },
    offline: { label: 'Offline', dotColor: 'var(--gray-400)', bg: 'var(--danger-50)', color: 'var(--danger-700)' },
};

// ── Sub-components ────────────────────────────────────────────────────────────

function SortIcon({ col, sortBy, sortDir }) {
    if (sortBy !== col) return <span style={{ color: 'var(--gray-300)', fontSize: '0.625rem' }}>↕</span>;
    return <span style={{ color: 'var(--primary-500)', fontSize: '0.75rem' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>;
}

function IgnitionBadge({ on }) {
    if (on === null || on === undefined) return <span style={{ color: 'var(--gray-600)' }}>—</span>;
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
            padding: '0.2rem 0.5rem', borderRadius: 'var(--radius-sm)', fontSize: '0.7rem', fontWeight: 500,
            background: on ? 'var(--success-50)' : 'var(--gray-100)', color: on ? 'var(--success-600)' : 'var(--gray-600)',
            border: `1px solid ${on ? 'var(--success-100)' : 'var(--gray-200)'}`,
        }}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            {on ? 'On' : 'Off'}
        </span>
    );
}

function MotionBadge({ moving }) {
    if (moving === null || moving === undefined) return <span style={{ color: 'var(--gray-600)' }}>—</span>;
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
            padding: '0.2rem 0.5rem', borderRadius: 'var(--radius-sm)', fontSize: '0.7rem', fontWeight: 500,
            background: moving ? 'var(--primary-50)' : 'var(--gray-100)', color: moving ? 'var(--primary-600)' : 'var(--gray-600)',
            border: `1px solid ${moving ? 'var(--primary-100)' : 'var(--gray-200)'}`,
        }}>
            {moving ? (
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
            ) : (
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="18" height="18" rx="2" /></svg>
            )}
            {moving ? 'Moving' : 'Parked'}
        </span>
    );
}

function AlarmBadge({ alarm }) {
    if (!alarm) return null;
    const labels = { sos: 'SOS', panic: 'SOS', overspeed: 'Overspeed', geofenceEnter: 'Geo In', geofenceExit: 'Geo Out', powerCut: 'Power Cut', lowBattery: 'Low Bat', vibration: 'Vibration', accident: 'Accident' };
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.7rem', fontWeight: 500,
            padding: '0.2rem 0.5rem', borderRadius: 'var(--radius-sm)',
            background: 'var(--danger-50)', color: 'var(--danger-600)',
            border: '1px solid var(--danger-100)', animation: 'alarm-pulse 1.5s ease-in-out infinite',
        }}>
            ⚠ {labels[alarm] || alarm}
        </span>
    );
}

function BatteryBar({ level }) {
    if (level === null || level === undefined) return <span style={{ color: 'var(--gray-300)' }}>—</span>;
    const pct = Math.round(level);
    const color = pct > 60 ? '#22c55e' : pct > 20 ? '#f59e0b' : '#ef4444';
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ width: 48, height: 10, background: 'var(--gray-100)', borderRadius: 3, overflow: 'hidden', border: '1px solid var(--gray-200)' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.3s' }} />
            </div>
            <span style={{ fontSize: '0.8125rem', fontWeight: 600, color }}>{pct}%</span>
        </div>
    );
}

function DetailBlock({ label, value, accent }) {
    return (
        <div>
            <div style={{ fontSize: '0.6875rem', fontWeight: 400, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--gray-600)', marginBottom: '0.25rem' }}>{label}</div>
            <div style={{ fontSize: '0.875rem', fontWeight: 400, color: accent || 'var(--gray-800)' }}>{value}</div>
        </div>
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

    const fetchData = useCallback(async () => {
        const { onAuthStateChanged } = await import('firebase/auth');
        const user = await new Promise((resolve) => {
            const unsub = onAuthStateChanged(auth, (u) => { unsub(); resolve(u); });
        });
        if (!user) { router.push('/login'); return; }

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
        }
    }, [router]);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, REFRESH_INTERVAL);
        return () => clearInterval(interval);
    }, [fetchData]);

    // Merge devices + positions + attributes
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
            phone: device.phone || null,
            model: device.model || null,
            category: device.category || null,
            contact: device.contact || null,
            position,
            ignition: attrs.ignition ?? null,
            motion: attrs.motion ?? null,
            batteryLevel: attrs.batteryLevel ?? null,
            charge: attrs.charge ?? null,
            alarm: attrs.alarm ?? null,
            sat: attrs.sat ?? null,
            odometer: attrs.odometer ?? null,
            hours: attrs.hours ?? null,
            rpm: attrs.rpm ?? null,
            fuel: attrs.fuel ?? null,
            temperature: attrs.temperature ?? null,
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

    return (
        <div className="dashboard-shell">
            <NavBar />
            <div className="vehicles-page">

                {/* ── Header ── */}
                <div className="vehicles-header">
                    <div className="vehicles-header-left">
                        <div>
                            <h1 className="vehicles-title">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="1" y="3" width="15" height="13" rx="2" /><polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                                    <circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" />
                                </svg>
                                Vehicles
                                <span className="vehicles-count">({vehicles.length})</span>
                            </h1>
                            <p style={{ fontSize: '0.75rem', color: 'var(--gray-400)', marginTop: '0.125rem' }}>
                                {lastRefresh ? `Updated ${formatTimeAgo(lastRefresh)}` : 'Loading...'}
                            </p>
                        </div>
                    </div>

                    <div className="vehicles-header-right">
                        {/* Status pills */}
                        <div className="status-filter-pills">
                            {[
                                { key: 'all', label: 'All', count: stats.total },
                                { key: 'online', label: 'Online', count: stats.online },
                                { key: 'idle', label: 'Idle', count: stats.idle },
                                { key: 'offline', label: 'Offline', count: stats.offline },
                            ].map(({ key, label, count }) => (
                                <button key={key}
                                    className={`status-filter-pill ${statusFilter === key ? 'active' : ''} ${statusFilter === key && key !== 'all' ? `pill-${key}` : ''}`}
                                    onClick={() => setStatusFilter(key)}>
                                    {label} <span className="pill-count">{count}</span>
                                </button>
                            ))}
                        </div>

                        {/* Search */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--gray-50)', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', padding: '0.5rem 0.875rem' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--gray-400)' }}>
                                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                            </svg>
                            <input type="text" placeholder="Search vehicles..." value={search} onChange={(e) => setSearch(e.target.value)}
                                style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: '0.875rem', fontFamily: 'var(--font-sans)', color: 'var(--gray-700)', width: '180px' }} />
                        </div>

                        {/* ── Claim Device button ── */}
                        <button onClick={() => router.push('/claim')}
                            style={{
                                height: 36, padding: '0 1rem', display: 'flex', alignItems: 'center', gap: '0.375rem',
                                fontSize: '0.8125rem', fontWeight: 500, fontFamily: 'var(--font-sans)',
                                background: 'var(--primary-500)', color: 'white',
                                border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                                boxShadow: 'none', transition: 'background var(--transition-fast)',
                            }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" />
                            </svg>
                            Add Device
                        </button>

                        {/* Refresh */}
                        <button onClick={fetchData}
                            style={{ height: 36, padding: '0 0.875rem', display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem', fontWeight: 400, fontFamily: 'var(--font-sans)', background: 'white', color: 'var(--gray-700)', border: '1px solid var(--gray-300)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', transition: 'background var(--transition-fast)', }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
                                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                            </svg>
                            Refresh
                        </button>
                    </div>
                </div>

                {/* ── Table area ── */}
                <div className="vehicles-table-wrapper">
                    {sorted.length === 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem', color: 'var(--gray-600)' }}>
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" style={{ opacity: 0.3, marginBottom: '1rem' }}>
                                <rect x="1" y="3" width="15" height="13" rx="2" /><polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                                <circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" />
                            </svg>
                            <p style={{ fontWeight: 400, marginBottom: '0.5rem' }}>{search || statusFilter !== 'all' ? 'No vehicles match your filters' : 'No vehicles found'}</p>
                            {!search && statusFilter === 'all' && (
                                <button onClick={() => router.push('/claim')} style={{ marginTop: '0.5rem', height: 36, padding: '0 1.25rem', background: 'var(--primary-500)', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '0.875rem', fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer' }}>
                                    + Add your first device
                                </button>
                            )}
                        </div>
                    ) : (
                        <div style={{ background: 'white', borderRadius: 'var(--radius-md)', border: '1px solid var(--gray-300)', overflow: 'hidden' }}>
                            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
                                <thead>
                                    <tr style={{ background: 'var(--gray-50)' }}>
                                        {[
                                            { key: 'name', label: 'Vehicle' },
                                            { key: null, label: 'Plate / IMEI' },
                                            { key: 'status', label: 'Status' },
                                            { key: null, label: 'Ignition' },
                                            { key: null, label: 'Motion' },
                                            { key: 'speed', label: 'Speed' },
                                            { key: 'lastUpdate', label: 'Last Update' },
                                            { key: null, label: 'Location' },
                                            { key: null, label: 'Actions' },
                                        ].map((col, i) => (
                                            <th key={i} onClick={() => col.key && handleSort(col.key)}
                                                style={{
                                                    padding: '0.75rem 1rem', textAlign: 'left',
                                                    fontSize: '0.6875rem', fontWeight: 600,
                                                    textTransform: 'uppercase', letterSpacing: '0.06em',
                                                    color: sortBy === col.key ? 'var(--primary-600)' : 'var(--gray-500)',
                                                    borderBottom: '1px solid var(--gray-200)',
                                                    cursor: col.key ? 'pointer' : 'default',
                                                    whiteSpace: 'nowrap', userSelect: 'none',
                                                    background: sortBy === col.key ? 'var(--primary-50)' : undefined,
                                                }}>
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}>
                                                    {col.label}
                                                    {col.key && <SortIcon col={col.key} sortBy={sortBy} sortDir={sortDir} />}
                                                </span>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {sorted.map((v) => {
                                        const meta = STATUS_META[v.status] || STATUS_META.offline;
                                        const isExpanded = expandedRow === v.id;
                                        return (
                                            <React.Fragment key={v.id}>
                                                <tr
                                                    style={{ cursor: 'pointer', background: isExpanded ? 'var(--primary-25, #f8fbff)' : 'white', transition: 'background 0.15s' }}
                                                    onClick={() => setExpandedRow(isExpanded ? null : v.id)}
                                                    onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = 'var(--gray-25, #fafafa)'; }}
                                                    onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = 'white'; }}
                                                >
                                                    {/* Vehicle name */}
                                                    <td style={{ padding: '1rem', borderBottom: isExpanded ? 'none' : '1px solid var(--gray-200)' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                                                            <div style={{ width: 32, height: 32, borderRadius: 'var(--radius-sm)', background: meta.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={meta.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                    <rect x="1" y="3" width="15" height="13" rx="2" /><polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                                                                    <circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" />
                                                                </svg>
                                                            </div>
                                                            <div>
                                                                <div style={{ fontWeight: 500, color: 'var(--gray-800)', fontSize: '0.875rem' }}>{v.name}</div>
                                                                {v.alarm && <AlarmBadge alarm={v.alarm} />}
                                                            </div>
                                                        </div>
                                                    </td>

                                                    {/* Plate / IMEI */}
                                                    <td style={{ padding: '0.875rem 1rem', borderBottom: isExpanded ? 'none' : '1px solid var(--gray-100)' }}>
                                                        {v.vehicleNumber ? (
                                                            <div>
                                                                <span style={{ fontSize: '0.8125rem', fontWeight: 700, fontFamily: 'SF Mono, Consolas, monospace', background: '#fffbeb', color: '#92400e', padding: '0.15rem 0.5rem', borderRadius: 4, border: '1px solid #fde68a' }}>
                                                                    {v.vehicleNumber}
                                                                </span>
                                                                <div style={{ fontSize: '0.7rem', color: 'var(--gray-400)', marginTop: '0.2rem', fontFamily: 'monospace' }}>{v.imei || v.uniqueId}</div>
                                                            </div>
                                                        ) : (
                                                            <span style={{ fontSize: '0.8125rem', fontFamily: 'SF Mono, Consolas, monospace', background: 'var(--gray-50)', color: 'var(--gray-600)', padding: '0.15rem 0.5rem', borderRadius: 4, border: '1px solid var(--gray-200)' }}>
                                                                {v.imei || v.uniqueId}
                                                            </span>
                                                        )}
                                                    </td>

                                                    {/* Status */}
                                                    <td style={{ padding: '0.875rem 1rem', borderBottom: isExpanded ? 'none' : '1px solid var(--gray-100)' }}>
                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', padding: '0.25rem 0.75rem', borderRadius: 'var(--radius-full)', background: meta.bg, color: meta.color, fontSize: '0.75rem', fontWeight: 600 }}>
                                                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: meta.dotColor }} />
                                                            {meta.label}
                                                        </span>
                                                    </td>

                                                    {/* Ignition */}
                                                    <td style={{ padding: '0.875rem 1rem', borderBottom: isExpanded ? 'none' : '1px solid var(--gray-100)' }}>
                                                        <IgnitionBadge on={v.ignition} />
                                                    </td>

                                                    {/* Motion */}
                                                    <td style={{ padding: '0.875rem 1rem', borderBottom: isExpanded ? 'none' : '1px solid var(--gray-100)' }}>
                                                        <MotionBadge moving={v.motion} />
                                                    </td>

                                                    {/* Speed */}
                                                    <td style={{ padding: '1rem', borderBottom: isExpanded ? 'none' : '1px solid var(--gray-200)', fontWeight: v.position?.speed > 0 ? 500 : 400, color: v.position?.speed > 0 ? 'var(--primary-600)' : 'var(--gray-600)', fontSize: '0.875rem' }}>
                                                        {v.position ? `${Math.round(v.position.speed * 1.852)} km/h` : '—'}
                                                    </td>

                                                    {/* Last Update */}
                                                    <td style={{ padding: '0.875rem 1rem', borderBottom: isExpanded ? 'none' : '1px solid var(--gray-100)', fontSize: '0.8125rem', color: 'var(--gray-500)' }}>
                                                        {v.position?.fixTime ? formatTimeAgo(v.position.fixTime) : formatDate(v.lastUpdate)}
                                                    </td>

                                                    {/* Location */}
                                                    <td style={{ padding: '0.875rem 1rem', borderBottom: isExpanded ? 'none' : '1px solid var(--gray-100)', fontSize: '0.8125rem', color: 'var(--gray-500)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {v.position?.address ? v.position.address.split(',').slice(0, 2).join(',') : '—'}
                                                    </td>

                                                    {/* Actions */}
                                                    <td style={{ padding: '0.875rem 1rem', borderBottom: isExpanded ? 'none' : '1px solid var(--gray-100)' }}>
                                                        <div className="vehicle-actions">
                                                            {/* Live map */}
                                                            <button className="vehicle-action-btn" title="View on map"
                                                                onClick={e => { e.stopPropagation(); router.push('/dashboard'); }}>
                                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                    <circle cx="12" cy="12" r="3" /><path d="M12 2v4" /><path d="M12 18v4" /><path d="M4.93 4.93l2.83 2.83" /><path d="M16.24 16.24l2.83 2.83" /><path d="M2 12h4" /><path d="M18 12h4" /><path d="M4.93 19.07l2.83-2.83" /><path d="M16.24 7.76l2.83-2.83" />
                                                                </svg>
                                                            </button>
                                                            {/* Route history */}
                                                            <button className="vehicle-action-btn" title="Route history"
                                                                onClick={e => { e.stopPropagation(); router.push('/history'); }}>
                                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                                                                </svg>
                                                            </button>
                                                            {/* Detail page */}
                                                            <button className="vehicle-action-btn" title="Full details"
                                                                onClick={e => { e.stopPropagation(); router.push(`/vehicles/${v.id}`); }}>
                                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                                                                </svg>
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>

                                                {/* ── Expanded row ── */}
                                                {isExpanded && (
                                                    <tr key={`${v.id}-expanded`}>
                                                        <td colSpan={9} style={{ padding: 0, borderBottom: '1px solid var(--gray-200)' }}>
                                                            <div style={{ background: 'var(--gray-50)', borderTop: '1px solid var(--gray-200)', padding: '1.5rem 2rem' }}>
                                                                <div style={{ fontSize: '0.6875rem', fontWeight: 400, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--gray-600)', marginBottom: '1rem' }}>
                                                                    Full device details
                                                                </div>
                                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '1rem' }}>

                                                                    {/* ── Identity ── */}
                                                                    <DetailBlock label="Vehicle Name" value={v.name} />
                                                                    <DetailBlock label="Number Plate" value={v.vehicleNumber || '—'} />
                                                                    <DetailBlock label="IMEI" value={v.imei || v.uniqueId} />
                                                                    <DetailBlock label="Traccar ID" value={`#${v.id}`} />

                                                                    {/* ── GPS ── */}
                                                                    <DetailBlock label="Altitude" value={v.position ? `${Math.round(v.position.altitude || 0)} m` : '—'} />
                                                                    <DetailBlock label="Course" value={v.position ? `${Math.round(v.position.course || 0)}°` : '—'} />
                                                                    <DetailBlock label="GPS Fix" value={v.position ? (v.position.valid !== false ? 'Valid' : 'No fix') : '—'} accent={v.position?.valid !== false ? 'var(--success-600)' : 'var(--danger-600)'} />
                                                                    <DetailBlock label="Satellites" value={v.sat !== null ? `${v.sat} sats` : '—'} />
                                                                    <DetailBlock label="Fix Time" value={v.position ? formatDate(v.position.fixTime) : '—'} />

                                                                    {/* ── Engine & power ── */}
                                                                    <DetailBlock label="Ignition" value={v.ignition !== null ? (v.ignition ? 'On' : 'Off') : '—'} accent={v.ignition ? 'var(--success-600)' : undefined} />
                                                                    <DetailBlock label="Motion" value={v.motion !== null ? (v.motion ? 'Moving' : 'Parked') : '—'} />
                                                                    <DetailBlock label="Battery" value={v.batteryLevel !== null ? `${Math.round(v.batteryLevel)}%` : '—'} />
                                                                    <DetailBlock label="Charging" value={v.charge !== null ? (v.charge ? 'Yes' : 'No') : '—'} accent={v.charge ? 'var(--success-600)' : undefined} />
                                                                    <DetailBlock label="Odometer" value={v.odometer !== null ? `${(v.odometer / 1000).toFixed(0)} km` : '—'} />
                                                                    <DetailBlock label="Engine Hours" value={v.hours !== null ? `${Math.round(v.hours / 3600000)}h` : '—'} />

                                                                    {/* ── Optional sensors ── */}
                                                                    {v.rpm !== null && <DetailBlock label="RPM" value={v.rpm} />}
                                                                    {v.fuel !== null && <DetailBlock label="Fuel" value={`${v.fuel}%`} />}
                                                                    {v.temperature !== null && <DetailBlock label="Temperature" value={`${v.temperature}°C`} />}

                                                                    {/* ── Battery bar ── */}
                                                                    {v.batteryLevel !== null && (
                                                                        <div>
                                                                            <div style={{ fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--primary-400)', marginBottom: '0.5rem' }}>Battery Level</div>
                                                                            <BatteryBar level={v.batteryLevel} />
                                                                        </div>
                                                                    )}

                                                                    {/* ── Alarm ── */}
                                                                    {v.alarm && (
                                                                        <div>
                                                                            <div style={{ fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--danger-500)', marginBottom: '0.375rem' }}>Active Alarm</div>
                                                                            <AlarmBadge alarm={v.alarm} />
                                                                        </div>
                                                                    )}
                                                                </div>
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
                            <div style={{ padding: '0.75rem 1.25rem', background: 'white', borderTop: '1px solid var(--gray-200)', fontSize: '0.75rem', color: 'var(--gray-600)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>Showing {sorted.length} of {vehicles.length} vehicles</span>
                                <span>Click a row to expand full details · Click Actions to navigate</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}