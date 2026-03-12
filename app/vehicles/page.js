'use client';

import React from 'react';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';
import NavBar from '@/components/NavBar';
import { apiFetch } from '@/lib/api';

const REFRESH_INTERVAL = 30000; // 30 seconds

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

const STATUS_META = {
    online: { label: 'Online', dot: '#22c55e', bg: '#f0fdf4', text: '#16a34a', border: '#dcfce7' },
    idle: { label: 'Idle', dot: '#f59e0b', bg: '#fffbeb', text: '#d97706', border: '#fef3c7' },
    offline: { label: 'Offline', dot: '#9ca3af', bg: '#f9fafb', text: '#6b7280', border: '#e5e7eb' },
};

export default function VehiclesPage() {
    const router = useRouter();
    const [devices, setDevices] = useState([]);
    const [positions, setPositions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [sortBy, setSortBy] = useState('status'); // 'status' | 'name' | 'speed' | 'lastUpdate'
    const [sortDir, setSortDir] = useState('asc');
    const [expandedRow, setExpandedRow] = useState(null);
    const [lastRefresh, setLastRefresh] = useState(null);

    const fetchData = useCallback(async () => {
        const token = Cookies.get('firebase_token');
        if (!token) { router.push('/login'); return; }

        try {
            const headers = {};
            const [devRes, posRes] = await Promise.all([
                apiFetch('/api/devices', { headers }),
                apiFetch('/api/positions', { headers }),
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

    // Merge devices + positions
    const vehicles = devices.map((device) => {
        const position = positions.find((p) => p.deviceId === device.id) || null;
        return {
            id: device.id,
            name: device.name || `Device ${device.id}`,
            uniqueId: device.uniqueId,
            status: getVehicleStatus(device, position),
            lastUpdate: device.lastUpdate,
            phone: device.phone,
            model: device.model,
            category: device.category,
            contact: device.contact,
            position,
        };
    });

    // Stats
    const stats = vehicles.reduce(
        (acc, v) => { acc[v.status] = (acc[v.status] || 0) + 1; acc.total++; return acc; },
        { online: 0, idle: 0, offline: 0, total: 0 }
    );

    // Filter
    const filtered = vehicles.filter((v) => {
        const q = search.toLowerCase();
        const matchesSearch =
            v.name.toLowerCase().includes(q) ||
            (v.uniqueId && v.uniqueId.toLowerCase().includes(q)) ||
            (v.phone && v.phone.toLowerCase().includes(q));
        const matchesStatus = statusFilter === 'all' || v.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    // Sort
    const sorted = [...filtered].sort((a, b) => {
        let aVal, bVal;
        if (sortBy === 'status') {
            const order = { online: 0, idle: 1, offline: 2 };
            aVal = order[a.status] ?? 2;
            bVal = order[b.status] ?? 2;
        } else if (sortBy === 'name') {
            aVal = a.name.toLowerCase();
            bVal = b.name.toLowerCase();
        } else if (sortBy === 'speed') {
            aVal = a.position?.speed || 0;
            bVal = b.position?.speed || 0;
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
                {sortDir === 'asc'
                    ? <path d="M7 15l5 5 5-5" />
                    : <path d="M7 9l5-5 5 5" />}
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
                    background: 'white',
                    borderBottom: '1px solid var(--gray-200)',
                    padding: '0 2rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    minHeight: '68px',
                    flexShrink: 0,
                    gap: '1rem',
                    flexWrap: 'wrap',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{
                            width: 40, height: 40,
                            background: 'linear-gradient(135deg, var(--primary-500), var(--accent-500))',
                            borderRadius: 'var(--radius-md)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
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

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                        {/* Status filter pills */}
                        <div style={{ display: 'flex', gap: '0.375rem' }}>
                            {[
                                { key: 'all', label: 'All', count: stats.total },
                                { key: 'online', label: 'Online', count: stats.online },
                                { key: 'idle', label: 'Idle', count: stats.idle },
                                { key: 'offline', label: 'Offline', count: stats.offline },
                            ].map((f) => {
                                const meta = f.key !== 'all' ? STATUS_META[f.key] : null;
                                const isActive = statusFilter === f.key;
                                return (
                                    <button
                                        key={f.key}
                                        onClick={() => setStatusFilter(f.key)}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '0.375rem',
                                            padding: '0.375rem 0.75rem',
                                            fontSize: '0.8125rem', fontWeight: 500,
                                            fontFamily: 'var(--font-sans)',
                                            border: `1px solid ${isActive && meta ? meta.border : (isActive ? 'var(--primary-200)' : 'var(--gray-200)')}`,
                                            borderRadius: 'var(--radius-full)',
                                            background: isActive && meta ? meta.bg : (isActive ? 'var(--primary-50)' : 'white'),
                                            color: isActive && meta ? meta.text : (isActive ? 'var(--primary-600)' : 'var(--gray-500)'),
                                            cursor: 'pointer',
                                            transition: 'all var(--transition-fast)',
                                        }}
                                    >
                                        {meta && isActive && (
                                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: meta.dot, display: 'inline-block', flexShrink: 0 }} />
                                        )}
                                        {f.label}
                                        <span style={{ fontWeight: 600, opacity: 0.75 }}>{f.count}</span>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Search */}
                        <div style={{ position: 'relative' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                                style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-400)', pointerEvents: 'none' }}>
                                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                            </svg>
                            <input
                                type="text"
                                placeholder="Search vehicles....."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                style={{
                                    padding: '0.5rem 0.875rem 0.5rem 2.25rem',
                                    fontSize: '0.875rem', fontFamily: 'var(--font-sans)',
                                    border: '1.5px solid var(--gray-200)',
                                    borderRadius: 'var(--radius-md)',
                                    outline: 'none', background: 'var(--gray-50)',
                                    color: 'var(--gray-800)', width: '220px',
                                    transition: 'all var(--transition-fast)',
                                }}
                                onFocus={e => { e.target.style.borderColor = 'var(--primary-300)'; e.target.style.background = 'white'; e.target.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.08)'; }}
                                onBlur={e => { e.target.style.borderColor = 'var(--gray-200)'; e.target.style.background = 'var(--gray-50)'; e.target.style.boxShadow = 'none'; }}
                            />
                        </div>

                        {/* Refresh button */}
                        <button
                            onClick={fetchData}
                            title="Refresh"
                            style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                width: 36, height: 36, borderRadius: 'var(--radius-md)',
                                border: '1.5px solid var(--gray-200)', background: 'white',
                                color: 'var(--gray-500)', cursor: 'pointer',
                                transition: 'all var(--transition-fast)',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary-300)'; e.currentTarget.style.color = 'var(--primary-600)'; e.currentTarget.style.background = 'var(--primary-50)'; }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--gray-200)'; e.currentTarget.style.color = 'var(--gray-500)'; e.currentTarget.style.background = 'white'; }}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M23 4v6h-6" /><path d="M1 20v-6h6" />
                                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* ── Stats Bar ── */}
                <div style={{
                    display: 'flex', gap: '1rem',
                    padding: '1rem 2rem',
                    background: 'white',
                    borderBottom: '1px solid var(--gray-100)',
                    flexShrink: 0,
                }}>
                    {[
                        { key: 'online', label: 'Online', icon: '●', value: stats.online },
                        { key: 'idle', label: 'Idle', icon: '●', value: stats.idle },
                        { key: 'offline', label: 'Offline', icon: '●', value: stats.offline },
                        { key: 'total', label: 'Total Fleet', icon: '▦', value: stats.total },
                    ].map(s => {
                        const meta = s.key !== 'total' ? STATUS_META[s.key] : null;
                        return (
                            <div key={s.key} style={{
                                display: 'flex', alignItems: 'center', gap: '0.75rem',
                                padding: '0.75rem 1rem',
                                background: meta ? meta.bg : 'var(--primary-50)',
                                border: `1px solid ${meta ? meta.border : 'var(--primary-100)'}`,
                                borderRadius: 'var(--radius-lg)',
                                minWidth: '110px',
                            }}>
                                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: meta ? meta.text : 'var(--primary-600)', lineHeight: 1 }}>{s.value}</div>
                                <div>
                                    <div style={{ fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: meta ? meta.text : 'var(--primary-600)', opacity: 0.85 }}>
                                        {s.label}
                                    </div>
                                    {meta && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.125rem' }}>
                                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: meta.dot, display: 'inline-block' }} />
                                            <span style={{ fontSize: '0.6875rem', color: meta.text, opacity: 0.7 }}>Live</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* ── Table ── */}
                <div style={{ flex: 1, overflow: 'auto', padding: '1.5rem 2rem' }}>
                    {sorted.length === 0 ? (
                        <div style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                            minHeight: '300px', color: 'var(--gray-400)',
                            background: 'white', borderRadius: 'var(--radius-xl)',
                            border: '1px solid var(--gray-200)', gap: '1rem',
                        }}>
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}>
                                <rect x="1" y="3" width="15" height="13" rx="2" />
                                <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                                <circle cx="5.5" cy="18.5" r="2.5" />
                                <circle cx="18.5" cy="18.5" r="2.5" />
                            </svg>
                            <div>
                                <p style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.25rem', textAlign: 'center' }}>
                                    {search || statusFilter !== 'all' ? 'No vehicles match your filters' : 'No vehicles found'}
                                </p>
                                <p style={{ fontSize: '0.8125rem', opacity: 0.7, textAlign: 'center' }}>
                                    {search ? `Try searching for something else` : 'Add devices in your Traccar dashboard'}
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div style={{
                            background: 'white',
                            borderRadius: 'var(--radius-xl)',
                            border: '1px solid var(--gray-200)',
                            boxShadow: 'var(--shadow-sm)',
                            overflow: 'hidden',
                        }}>
                            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
                                <thead>
                                    <tr style={{ background: 'var(--gray-50)' }}>
                                        {[
                                            { key: 'name', label: 'Vehicle' },
                                            { key: null, label: 'IMEI / ID' },
                                            { key: 'status', label: 'Status' },
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
                                                    background: sortBy === col.key ? 'var(--primary-50)' : 'transparent',
                                                }}
                                            >
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                                                    {col.label}
                                                    {col.key && <SortIcon col={col.key} />}
                                                </span>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {sorted.map((v, idx) => {
                                        const meta = STATUS_META[v.status];
                                        const isExpanded = expandedRow === v.id;
                                        return (
                                            <React.Fragment key={v.id}>
                                                <tr
                                                    onClick={() => setExpandedRow(isExpanded ? null : v.id)}
                                                    style={{
                                                        cursor: 'pointer',
                                                        background: isExpanded ? 'var(--primary-50)' : (idx % 2 === 0 ? 'white' : 'var(--gray-25)'),
                                                        transition: 'background var(--transition-fast)',
                                                        borderLeft: isExpanded ? '3px solid var(--primary-400)' : '3px solid transparent',
                                                    }}
                                                    onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = 'var(--gray-50)'; }}
                                                    onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = idx % 2 === 0 ? 'white' : 'var(--gray-25)'; }}
                                                >
                                                    {/* Vehicle */}
                                                    <td style={{ padding: '0.875rem 1rem', borderBottom: isExpanded ? 'none' : '1px solid var(--gray-100)' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                            <div style={{
                                                                width: 36, height: 36, borderRadius: 'var(--radius-md)',
                                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                background: meta.bg, border: `1px solid ${meta.border}`, flexShrink: 0,
                                                            }}>
                                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={meta.dot} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                    <rect x="1" y="3" width="15" height="13" rx="2" />
                                                                    <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                                                                    <circle cx="5.5" cy="18.5" r="2.5" />
                                                                    <circle cx="18.5" cy="18.5" r="2.5" />
                                                                </svg>
                                                            </div>
                                                            <div>
                                                                <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--gray-900)' }}>{v.name}</div>
                                                                {v.category && <div style={{ fontSize: '0.75rem', color: 'var(--gray-400)' }}>{v.category}</div>}
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
                                                            background: meta.bg, color: meta.text,
                                                            border: `1px solid ${meta.border}`,
                                                        }}>
                                                            <span style={{
                                                                width: 6, height: 6, borderRadius: '50%', background: meta.dot,
                                                                boxShadow: v.status === 'online' ? `0 0 6px ${meta.dot}` : 'none',
                                                                animation: v.status === 'online' ? 'pulse-green 2s infinite' : 'none',
                                                                flexShrink: 0,
                                                            }} />
                                                            {meta.label}
                                                        </span>
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
                                                    <td style={{ padding: '0.875rem 1rem', borderBottom: isExpanded ? 'none' : '1px solid var(--gray-100)' }}
                                                        onClick={e => e.stopPropagation()}
                                                    >
                                                        <div style={{ display: 'flex', gap: '0.375rem' }}>
                                                            <button
                                                                title="View on map"
                                                                onClick={() => router.push('/dashboard')}
                                                                style={{
                                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                    width: 32, height: 32, borderRadius: 'var(--radius-md)',
                                                                    border: '1px solid var(--gray-200)', background: 'white',
                                                                    color: 'var(--gray-500)', cursor: 'pointer',
                                                                    transition: 'all var(--transition-fast)',
                                                                }}
                                                                onMouseEnter={e => { e.currentTarget.style.background = 'var(--primary-50)'; e.currentTarget.style.borderColor = 'var(--primary-200)'; e.currentTarget.style.color = 'var(--primary-600)'; }}
                                                                onMouseLeave={e => { e.currentTarget.style.background = 'white'; e.currentTarget.style.borderColor = 'var(--gray-200)'; e.currentTarget.style.color = 'var(--gray-500)'; }}
                                                            >
                                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                    <path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z" />
                                                                    <path d="M8 2v16" /><path d="M16 6v16" />
                                                                </svg>
                                                            </button>
                                                            <button
                                                                title="View history"
                                                                onClick={() => router.push('/history')}
                                                                style={{
                                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                    width: 32, height: 32, borderRadius: 'var(--radius-md)',
                                                                    border: '1px solid var(--gray-200)', background: 'white',
                                                                    color: 'var(--gray-500)', cursor: 'pointer',
                                                                    transition: 'all var(--transition-fast)',
                                                                }}
                                                                onMouseEnter={e => { e.currentTarget.style.background = 'var(--success-50)'; e.currentTarget.style.borderColor = 'var(--success-100)'; e.currentTarget.style.color = 'var(--success-600)'; }}
                                                                onMouseLeave={e => { e.currentTarget.style.background = 'white'; e.currentTarget.style.borderColor = 'var(--gray-200)'; e.currentTarget.style.color = 'var(--gray-500)'; }}
                                                            >
                                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                                                                </svg>
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                                {/* Expanded detail row */}
                                                {isExpanded && (
                                                    <tr key={`${v.id}-expanded`}>
                                                        <td colSpan={7} style={{ padding: '0', borderBottom: '1px solid var(--gray-200)' }}>
                                                            <div style={{
                                                                background: 'var(--primary-50)',
                                                                borderTop: '1px solid var(--primary-100)',
                                                                padding: '1rem 2rem',
                                                                display: 'grid',
                                                                gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                                                                gap: '1rem',
                                                            }}>
                                                                {[
                                                                    { label: 'Phone', value: v.phone || '—' },
                                                                    { label: 'Model', value: v.model || '—' },
                                                                    { label: 'Contact', value: v.contact || '—' },
                                                                    { label: 'Altitude', value: v.position ? `${Math.round(v.position.altitude || 0)} m` : '—' },
                                                                    { label: 'Course', value: v.position ? `${Math.round(v.position.course || 0)}°` : '—' },
                                                                    { label: 'Fix Time', value: v.position ? formatDate(v.position.fixTime) : '—' },
                                                                ].map(item => (
                                                                    <div key={item.label}>
                                                                        <div style={{ fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--primary-400)', marginBottom: '0.25rem' }}>{item.label}</div>
                                                                        <div style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--gray-700)' }}>{item.value}</div>
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

                            {/* Table footer */}
                            <div style={{
                                padding: '0.75rem 1rem',
                                background: 'var(--gray-50)',
                                borderTop: '1px solid var(--gray-100)',
                                fontSize: '0.75rem', color: 'var(--gray-400)',
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            }}>
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
