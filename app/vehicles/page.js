'use client';

import React from 'react';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import NavBar from '@/components/NavBar';
import { apiFetch } from '@/lib/api';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';

const REFRESH_INTERVAL = 30000;

// ── Helpers ─────────────────────────────────────────────────────────────────

function getVehicleStatus(device, position) {
    const traccarStatus = (device.status || '').toLowerCase();
    if (traccarStatus === 'online') {
        if (position && position.speed > 0) return 'online';
        if (position && position.fixTime) {
            const diff = (new Date() - new Date(position.fixTime)) / 1000;
            if (diff < 300) return 'online';
        }
        return 'idle';
    }
    if (traccarStatus === 'unknown') return 'idle';
    return 'offline';
}

function formatTimeAgo(dateStr) {
    if (!dateStr) return '—';
    const diff = (new Date() - new Date(dateStr)) / 1000;
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

function formatDate(dateStr) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleString([], {
        month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

function formatOdometer(meters) {
    if (meters === null || meters === undefined) return '—';
    return `${(meters / 1000).toFixed(1)} km`;
}

function formatHours(seconds) {
    if (seconds === null || seconds === undefined) return '—';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

const STATUS_META = {
    online: { label: 'Online', dot: '#22c55e', bg: '#f0fdf4', text: '#16a34a', border: '#dcfce7' },
    idle: { label: 'Idle', dot: '#f59e0b', bg: '#fffbeb', text: '#d97706', border: '#fef3c7' },
    offline: { label: 'Offline', dot: '#9ca3af', bg: '#f9fafb', text: '#6b7280', border: '#e5e7eb' },
};

// ── Small badge components ───────────────────────────────────────────────────

function IgnitionBadge({ ignition }) {
    if (ignition === null || ignition === undefined) return null;
    const on = ignition === true || ignition === 'true';
    return (
        <span title={on ? 'Engine on' : 'Engine off'} style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.2rem',
            fontSize: '0.7rem', fontWeight: 600, padding: '0.2rem 0.5rem',
            borderRadius: '999px',
            background: on ? 'var(--success-50)' : 'var(--gray-100)',
            color: on ? 'var(--success-700)' : 'var(--gray-500)',
            border: `1px solid ${on ? 'var(--success-200)' : 'var(--gray-200)'}`,
            whiteSpace: 'nowrap',
        }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="7.5" cy="15.5" r="5.5" />
                <path d="M21 2l-9.6 9.6" />
                <path d="M15.5 7.5l3 3L22 7l-3-3" />
            </svg>
            {on ? 'On' : 'Off'}
        </span>
    );
}

function MotionBadge({ motion }) {
    if (motion === null || motion === undefined) return null;
    const moving = motion === true || motion === 'true';
    return (
        <span title={moving ? 'Moving' : 'Parked'} style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.2rem',
            fontSize: '0.7rem', fontWeight: 600, padding: '0.2rem 0.5rem',
            borderRadius: '999px',
            background: moving ? 'var(--primary-50)' : 'var(--gray-100)',
            color: moving ? 'var(--primary-700)' : 'var(--gray-500)',
            border: `1px solid ${moving ? 'var(--primary-200)' : 'var(--gray-200)'}`,
            whiteSpace: 'nowrap',
        }}>
            {moving ? (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
            ) : (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                </svg>
            )}
            {moving ? 'Moving' : 'Parked'}
        </span>
    );
}

function AlarmBadge({ alarm }) {
    if (!alarm) return null;
    const labels = {
        sos: 'SOS', panic: 'SOS', overspeed: 'Overspeed',
        geofenceEnter: 'Geo In', geofenceExit: 'Geo Out',
        powerCut: 'Power Cut', lowBattery: 'Low Bat',
        vibration: 'Vibration', accident: 'Accident',
    };
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
            fontSize: '0.7rem', fontWeight: 700, padding: '0.2rem 0.5rem',
            borderRadius: '999px',
            background: 'var(--danger-50)', color: 'var(--danger-700)',
            border: '1px solid var(--danger-200)',
            animation: 'alarm-pulse 1.5s ease-in-out infinite',
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
            {/* bar */}
            <div style={{ width: 48, height: 10, background: 'var(--gray-100)', borderRadius: 3, overflow: 'hidden', border: '1px solid var(--gray-200)' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.3s' }} />
            </div>
            <span style={{ fontSize: '0.8125rem', fontWeight: 600, color }}>{pct}%</span>
        </div>
    );
}

// ── Page ─────────────────────────────────────────────────────────────────────

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
            status: getVehicleStatus(device, position),
            lastUpdate: device.lastUpdate,
            phone: device.phone || null,
            model: device.model || null,
            category: device.category || null,
            contact: device.contact || null,
            position,
            // Flattened attributes
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

    const filtered = vehicles.filter((v) => {
        const q = search.toLowerCase();
        const matchesSearch =
            v.name.toLowerCase().includes(q) ||
            (v.uniqueId && v.uniqueId.toLowerCase().includes(q)) ||
            (v.phone && v.phone.toLowerCase().includes(q));
        const matchesStatus = statusFilter === 'all' || v.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    const sorted = [...filtered].sort((a, b) => {
        let aVal, bVal;
        if (sortBy === 'status') {
            const order = { online: 0, idle: 1, offline: 2 };
            aVal = order[a.status] ?? 2; bVal = order[b.status] ?? 2;
        } else if (sortBy === 'name') {
            aVal = a.name.toLowerCase(); bVal = b.name.toLowerCase();
        } else if (sortBy === 'speed') {
            aVal = a.position?.speed || 0; bVal = b.position?.speed || 0;
        } else if (sortBy === 'lastUpdate') {
            aVal = a.lastUpdate ? new Date(a.lastUpdate).getTime() : 0;
            bVal = b.lastUpdate ? new Date(b.lastUpdate).getTime() : 0;
        }
        if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
        return 0;
    });

    const handleSort = (col) => {
        if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortBy(col); setSortDir('asc'); }
    };

    const SortIcon = ({ col }) => {
        if (sortBy !== col) return (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ opacity: 0.35 }}>
                <path d="M7 15l5 5 5-5M7 9l5-5 5 5" />
            </svg>
        );
        return (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: 'var(--primary-500)' }}>
                {sortDir === 'asc' ? <path d="M7 15l5 5 5-5" /> : <path d="M7 9l5-5 5 5" />}
            </svg>
        );
    };

    if (loading) {
        return (
            <div className="dashboard-shell">
                <NavBar />
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--gray-50)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                        <div className="map-loading-spinner" />
                        <p style={{ color: 'var(--gray-400)', fontSize: '0.875rem' }}>Loading vehicles...</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="dashboard-shell">
            <NavBar />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--gray-50)' }}>

                {/* ── Page Header ── */}
                <div style={{
                    background: 'white', borderBottom: '1px solid var(--gray-200)',
                    padding: '0 2rem', display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between', minHeight: '68px',
                    flexShrink: 0, gap: '1rem', flexWrap: 'wrap',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{
                            width: 40, height: 40,
                            background: 'linear-gradient(135deg, var(--primary-500), var(--accent-500))',
                            borderRadius: 'var(--radius-md)', display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                            boxShadow: '0 2px 8px rgba(59,130,246,0.25)',
                        }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="1" y="3" width="15" height="13" rx="2" />
                                <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                                <circle cx="5.5" cy="18.5" r="2.5" />
                                <circle cx="18.5" cy="18.5" r="2.5" />
                            </svg>
                        </div>
                        <div>
                            <h1 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--gray-900)', lineHeight: 1.2 }}>Vehicles</h1>
                            <p style={{ fontSize: '0.75rem', color: 'var(--gray-400)', fontWeight: 400 }}>
                                {stats.total} total &nbsp;·&nbsp;
                                {lastRefresh ? `Updated ${formatTimeAgo(lastRefresh)}` : 'Loading...'}
                            </p>
                        </div>
                    </div>

                    {/* Right: filters + search */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
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
                                    onClick={() => setStatusFilter(key)}
                                >
                                    {label} <span className="pill-count">{count}</span>
                                </button>
                            ))}
                        </div>

                        {/* Search */}
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            background: 'var(--gray-50)', border: '1px solid var(--gray-200)',
                            borderRadius: 'var(--radius-md)', padding: '0.5rem 0.875rem',
                        }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--gray-400)' }}>
                                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                            </svg>
                            <input
                                type="text" placeholder="Search vehicles..." value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                style={{
                                    border: 'none', outline: 'none', background: 'transparent',
                                    fontSize: '0.875rem', fontFamily: 'var(--font-sans)',
                                    color: 'var(--gray-700)', width: '180px',
                                }}
                            />
                        </div>
                    </div>
                </div>

                {/* ── Table area ── */}
                <div className="vehicles-table-wrapper">
                    {sorted.length === 0 ? (
                        <div style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center',
                            justifyContent: 'center', padding: '4rem 2rem', gap: '1rem',
                            background: 'white', borderRadius: 'var(--radius-xl)',
                            border: '1px solid var(--gray-200)',
                        }}>
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ color: 'var(--gray-300)' }}>
                                <rect x="1" y="3" width="15" height="13" rx="2" />
                                <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                                <circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" />
                            </svg>
                            <p style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--gray-500)', textAlign: 'center' }}>
                                {search || statusFilter !== 'all' ? 'No vehicles match your filters' : 'No vehicles found'}
                            </p>
                        </div>
                    ) : (
                        <div style={{
                            background: 'white', borderRadius: 'var(--radius-xl)',
                            border: '1px solid var(--gray-200)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden',
                        }}>
                            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
                                <thead>
                                    <tr style={{ background: 'var(--gray-50)' }}>
                                        {[
                                            { key: 'name', label: 'Vehicle' },
                                            { key: null, label: 'IMEI / ID' },
                                            { key: 'status', label: 'Status' },
                                            { key: null, label: 'Ignition' },
                                            { key: null, label: 'Motion' },
                                            { key: 'speed', label: 'Speed' },
                                            { key: 'lastUpdate', label: 'Last Update' },
                                            { key: null, label: 'Location' },
                                            { key: null, label: 'Actions' },
                                        ].map((col, i) => (
                                            <th key={i}
                                                onClick={() => col.key && handleSort(col.key)}
                                                style={{
                                                    padding: '0.75rem 1rem', textAlign: 'left',
                                                    fontSize: '0.6875rem', fontWeight: 600,
                                                    textTransform: 'uppercase', letterSpacing: '0.06em',
                                                    color: sortBy === col.key ? 'var(--primary-600)' : 'var(--gray-500)',
                                                    borderBottom: '1px solid var(--gray-200)',
                                                    cursor: col.key ? 'pointer' : 'default',
                                                    whiteSpace: 'nowrap', userSelect: 'none',
                                                    background: sortBy === col.key ? 'var(--primary-50)' : undefined,
                                                }}
                                            >
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}>
                                                    {col.label}
                                                    {col.key && <SortIcon col={col.key} />}
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
                                                    style={{
                                                        cursor: 'pointer',
                                                        background: isExpanded ? 'var(--primary-25, #f8fbff)' : 'white',
                                                        transition: 'background 0.15s',
                                                    }}
                                                    onClick={() => setExpandedRow(isExpanded ? null : v.id)}
                                                    onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = 'var(--gray-25, #fafafa)'; }}
                                                    onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = 'white'; }}
                                                >
                                                    {/* Vehicle name */}
                                                    <td style={{ padding: '0.875rem 1rem', borderBottom: isExpanded ? 'none' : '1px solid var(--gray-100)' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                                                            <div style={{
                                                                width: 32, height: 32, borderRadius: 'var(--radius-sm)',
                                                                background: meta.bg, display: 'flex', alignItems: 'center',
                                                                justifyContent: 'center', flexShrink: 0,
                                                            }}>
                                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={meta.dot} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                    <rect x="1" y="3" width="15" height="13" rx="2" />
                                                                    <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                                                                    <circle cx="5.5" cy="18.5" r="2.5" />
                                                                    <circle cx="18.5" cy="18.5" r="2.5" />
                                                                </svg>
                                                            </div>
                                                            <div>
                                                                <div style={{ fontWeight: 600, color: 'var(--gray-900)', fontSize: '0.875rem' }}>{v.name}</div>
                                                                {v.alarm && <AlarmBadge alarm={v.alarm} />}
                                                            </div>
                                                        </div>
                                                    </td>

                                                    {/* IMEI */}
                                                    <td style={{ padding: '0.875rem 1rem', borderBottom: isExpanded ? 'none' : '1px solid var(--gray-100)' }}>
                                                        <code style={{
                                                            fontSize: '0.8125rem', fontFamily: "'SF Mono', Consolas, monospace",
                                                            background: 'var(--gray-100)', padding: '0.1875rem 0.5rem',
                                                            borderRadius: 'var(--radius-sm)', color: 'var(--gray-600)',
                                                        }}>
                                                            {v.uniqueId || '—'}
                                                        </code>
                                                    </td>

                                                    {/* Status */}
                                                    <td style={{ padding: '0.875rem 1rem', borderBottom: isExpanded ? 'none' : '1px solid var(--gray-100)' }}>
                                                        <span style={{
                                                            display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
                                                            padding: '0.25rem 0.75rem', borderRadius: 'var(--radius-full)',
                                                            fontSize: '0.75rem', fontWeight: 600,
                                                            background: meta.bg, color: meta.text, border: `1px solid ${meta.border}`,
                                                        }}>
                                                            <span style={{
                                                                width: 6, height: 6, borderRadius: '50%', background: meta.dot, flexShrink: 0,
                                                                boxShadow: v.status === 'online' ? `0 0 6px ${meta.dot}` : 'none',
                                                                animation: v.status === 'online' ? 'pulse-green 2s infinite' : 'none',
                                                            }} />
                                                            {meta.label}
                                                        </span>
                                                    </td>

                                                    {/* Ignition */}
                                                    <td style={{ padding: '0.875rem 1rem', borderBottom: isExpanded ? 'none' : '1px solid var(--gray-100)' }}>
                                                        {v.ignition !== null ? (
                                                            <IgnitionBadge ignition={v.ignition} />
                                                        ) : (
                                                            <span style={{ color: 'var(--gray-300)', fontSize: '0.875rem' }}>—</span>
                                                        )}
                                                    </td>

                                                    {/* Motion */}
                                                    <td style={{ padding: '0.875rem 1rem', borderBottom: isExpanded ? 'none' : '1px solid var(--gray-100)' }}>
                                                        {v.motion !== null ? (
                                                            <MotionBadge motion={v.motion} />
                                                        ) : (
                                                            <span style={{ color: 'var(--gray-300)', fontSize: '0.875rem' }}>—</span>
                                                        )}
                                                    </td>

                                                    {/* Speed */}
                                                    <td style={{ padding: '0.875rem 1rem', borderBottom: isExpanded ? 'none' : '1px solid var(--gray-100)', fontWeight: 500, color: 'var(--gray-800)', fontSize: '0.875rem' }}>
                                                        {v.position ? (
                                                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--primary-500)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                                                                </svg>
                                                                {Math.round(v.position.speed * 1.852)} km/h
                                                            </span>
                                                        ) : <span style={{ color: 'var(--gray-300)' }}>—</span>}
                                                    </td>

                                                    {/* Last Update */}
                                                    <td style={{ padding: '0.875rem 1rem', borderBottom: isExpanded ? 'none' : '1px solid var(--gray-100)' }}>
                                                        <div style={{ fontSize: '0.8125rem', color: 'var(--gray-600)' }}>{formatTimeAgo(v.lastUpdate)}</div>
                                                        <div style={{ fontSize: '0.7rem', color: 'var(--gray-400)', marginTop: '0.1rem' }}>{formatDate(v.lastUpdate)}</div>
                                                    </td>

                                                    {/* Location */}
                                                    <td style={{ padding: '0.875rem 1rem', borderBottom: isExpanded ? 'none' : '1px solid var(--gray-100)' }}>
                                                        {v.position ? (
                                                            <span style={{ fontSize: '0.8125rem', color: 'var(--gray-500)', fontFamily: 'monospace' }}>
                                                                {v.position.latitude.toFixed(4)}, {v.position.longitude.toFixed(4)}
                                                            </span>
                                                        ) : <span style={{ color: 'var(--gray-300)', fontSize: '0.875rem' }}>No GPS</span>}
                                                    </td>

                                                    {/* Actions */}
                                                    <td style={{ padding: '0.875rem 1rem', borderBottom: isExpanded ? 'none' : '1px solid var(--gray-100)' }}>
                                                        <div style={{ display: 'flex', gap: '0.375rem' }}>
                                                            <button
                                                                title="View on map"
                                                                onClick={(e) => { e.stopPropagation(); router.push('/dashboard'); }}
                                                                style={{
                                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                    width: 32, height: 32, background: 'var(--gray-50)',
                                                                    border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-sm)',
                                                                    cursor: 'pointer', color: 'var(--gray-500)', transition: 'all 0.15s',
                                                                }}
                                                                onMouseEnter={e => { e.currentTarget.style.background = 'var(--primary-50)'; e.currentTarget.style.borderColor = 'var(--primary-200)'; e.currentTarget.style.color = 'var(--primary-600)'; }}
                                                                onMouseLeave={e => { e.currentTarget.style.background = 'var(--gray-50)'; e.currentTarget.style.borderColor = 'var(--gray-200)'; e.currentTarget.style.color = 'var(--gray-500)'; }}
                                                            >
                                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                    <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
                                                                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                                                                </svg>
                                                            </button>
                                                            <button
                                                                title="View history"
                                                                onClick={(e) => { e.stopPropagation(); router.push('/history'); }}
                                                                style={{
                                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                    width: 32, height: 32, background: 'var(--gray-50)',
                                                                    border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-sm)',
                                                                    cursor: 'pointer', color: 'var(--gray-500)', transition: 'all 0.15s',
                                                                }}
                                                                onMouseEnter={e => { e.currentTarget.style.background = 'var(--primary-50)'; e.currentTarget.style.borderColor = 'var(--primary-200)'; e.currentTarget.style.color = 'var(--primary-600)'; }}
                                                                onMouseLeave={e => { e.currentTarget.style.background = 'var(--gray-50)'; e.currentTarget.style.borderColor = 'var(--gray-200)'; e.currentTarget.style.color = 'var(--gray-500)'; }}
                                                            >
                                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                                                                </svg>
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>

                                                {/* ── Expanded detail row ── */}
                                                {isExpanded && (
                                                    <tr key={`${v.id}-expanded`}>
                                                        <td colSpan={9} style={{ padding: 0, borderBottom: '1px solid var(--gray-200)' }}>
                                                            <div style={{
                                                                background: 'var(--primary-50)',
                                                                borderTop: '1px solid var(--primary-100)',
                                                                padding: '1.25rem 1.5rem',
                                                            }}>
                                                                {/* Section label */}
                                                                <div style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--primary-500)', marginBottom: '1rem' }}>
                                                                    Full device details
                                                                </div>

                                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '1rem' }}>

                                                                    {/* ── GPS ── */}
                                                                    <DetailBlock label="Altitude" value={v.position ? `${Math.round(v.position.altitude || 0)} m` : '—'} />
                                                                    <DetailBlock label="Course" value={v.position ? `${Math.round(v.position.course || 0)}°` : '—'} />
                                                                    <DetailBlock label="GPS Fix" value={v.position ? (v.position.valid !== false ? 'Valid' : 'No fix') : '—'} accent={v.position?.valid !== false ? 'var(--success-600)' : 'var(--danger-600)'} />
                                                                    <DetailBlock label="Satellites" value={v.sat !== null ? `${v.sat} sats` : '—'} />
                                                                    <DetailBlock label="Protocol" value={v.position?.protocol || '—'} />
                                                                    <DetailBlock label="Fix Time" value={v.position ? formatDate(v.position.fixTime) : '—'} />

                                                                    {/* ── Engine & power ── */}
                                                                    <DetailBlock label="Ignition" value={v.ignition !== null ? (v.ignition ? 'On' : 'Off') : '—'} accent={v.ignition ? 'var(--success-600)' : undefined} />
                                                                    <DetailBlock label="Motion" value={v.motion !== null ? (v.motion ? 'Moving' : 'Parked') : '—'} />
                                                                    <DetailBlock label="Battery" value={<BatteryBar level={v.batteryLevel} />} />
                                                                    <DetailBlock label="Charging" value={v.charge !== null ? (v.charge ? 'Yes' : 'No') : '—'} accent={v.charge ? 'var(--success-600)' : undefined} />
                                                                    <DetailBlock label="RPM" value={v.rpm !== null ? `${v.rpm} rpm` : '—'} />

                                                                    {/* ── Trip counters ── */}
                                                                    <DetailBlock label="Odometer" value={formatOdometer(v.odometer)} />
                                                                    <DetailBlock label="Engine Hours" value={formatHours(v.hours)} />
                                                                    <DetailBlock label="Fuel" value={v.fuel !== null ? `${v.fuel}%` : '—'} />
                                                                    <DetailBlock label="Temperature" value={v.temperature !== null ? `${v.temperature}°C` : '—'} />

                                                                    {/* ── Device info ── */}
                                                                    <DetailBlock label="Phone" value={v.phone || '—'} />
                                                                    <DetailBlock label="Model" value={v.model || '—'} />
                                                                    <DetailBlock label="Contact" value={v.contact || '—'} />
                                                                    <DetailBlock label="Category" value={v.category || '—'} />

                                                                    {/* ── Alarm ── */}
                                                                    {v.alarm && (
                                                                        <div style={{ gridColumn: '1 / -1' }}>
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
                            <div style={{
                                padding: '0.75rem 1rem', background: 'var(--gray-50)',
                                borderTop: '1px solid var(--gray-100)', fontSize: '0.75rem',
                                color: 'var(--gray-400)', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            }}>
                                <span>Showing {sorted.length} of {vehicles.length} vehicles</span>
                                <span>Click a row to expand full details</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ── Tiny helper component for expanded row cells ─────────────────────────────
function DetailBlock({ label, value, accent }) {
    return (
        <div>
            <div style={{
                fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase',
                letterSpacing: '0.06em', color: 'var(--primary-400)', marginBottom: '0.25rem',
            }}>
                {label}
            </div>
            <div style={{ fontSize: '0.875rem', fontWeight: 500, color: accent || 'var(--gray-700)' }}>
                {value}
            </div>
        </div>
    );
}