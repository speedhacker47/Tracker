'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import NavBar from '@/components/NavBar';
import { apiFetch } from '@/lib/api';
import { auth } from '@/lib/firebase';

const REFRESH_INTERVAL = 30000;

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
    online: { label: 'Online', dotColor: 'var(--success-500)', bg: 'var(--success-50)', color: 'var(--success-600)' },
    idle: { label: 'Idle', dotColor: 'var(--warning-500)', bg: 'var(--warning-50)', color: 'var(--warning-600)' },
    offline: { label: 'Offline', dotColor: 'var(--gray-400)', bg: 'var(--gray-100)', color: 'var(--gray-700)' },
};

function SortIcon({ col, sortBy, sortDir }) {
    if (sortBy !== col) return <span style={{ color: 'var(--gray-300)', fontSize: '1rem', marginLeft: '4px' }}>↓</span>;
    return <span style={{ color: 'var(--primary-500)', fontSize: '1rem', marginLeft: '4px' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>;
}

function StatusPill({ active }) {
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
            padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 500,
            background: active ? 'var(--primary-50)' : 'transparent',
            color: active ? 'var(--primary-600)' : 'var(--gray-600)',
            border: `1px solid ${active ? 'var(--primary-200)' : 'var(--gray-300)'}`
        }}>
            {active ? 'Active' : 'Inactive'}
        </span>
    );
}

function DetailBlock({ label, value, accent }) {
    return (
        <div style={{ padding: '8px 0', borderBottom: '1px solid var(--gray-100)' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--gray-500)', marginBottom: '2px' }}>{label}</div>
            <div style={{ fontSize: '0.875rem', fontWeight: 400, color: accent || 'var(--gray-800)' }}>{value}</div>
        </div>
    );
}

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
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--gray-50)' }}>
                    <div className="map-loading-spinner" style={{ width: 36, height: 36, borderTopColor: 'var(--primary-500)' }} />
                </div>
            </div>
        );
    }

    return (
        <div className="dashboard-shell">
            <NavBar />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--gray-50)' }}>

                {/* ── Material Header ── */}
                <div style={{ background: 'white', borderBottom: '1px solid var(--gray-300)', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                        <h1 style={{ fontSize: '1.25rem', fontWeight: 400, color: 'var(--gray-800)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            Vehicles
                            <span style={{ fontSize: '0.875rem', color: 'var(--gray-500)', background: 'var(--gray-100)', padding: '2px 8px', borderRadius: '12px' }}>{vehicles.length}</span>
                        </h1>
                        <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)', marginTop: '4px' }}>
                            {lastRefresh ? `Last synced: ${formatTimeAgo(lastRefresh)}` : ''}
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        {/* Material Search Bar */}
                        <div style={{ display: 'flex', alignItems: 'center', background: 'var(--gray-100)', borderRadius: '8px', padding: '6px 16px', border: '1px solid transparent', transition: 'background 0.2s, border 0.2s' }}
                            onFocus={(e) => { e.currentTarget.style.background = 'white'; e.currentTarget.style.border = '1px solid var(--primary-500)'; e.currentTarget.style.boxShadow = '0 1px 2px 0 rgba(60,64,67,0.3)'; }}
                            onBlur={(e) => { e.currentTarget.style.background = 'var(--gray-100)'; e.currentTarget.style.border = '1px solid transparent'; e.currentTarget.style.boxShadow = 'none'; }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--gray-600)" strokeWidth="2">
                                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                            </svg>
                            <input type="text" placeholder="Search devices..." value={search} onChange={(e) => setSearch(e.target.value)}
                                style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: '0.875rem', color: 'var(--gray-800)', width: '220px', marginLeft: '8px' }} />
                        </div>

                        {/* Add Device Button (Google Blue) */}
                        <button onClick={() => router.push('/claim')}
                            style={{
                                height: '36px', padding: '0 20px', display: 'flex', alignItems: 'center', gap: '8px',
                                fontSize: '0.875rem', fontWeight: 500, fontFamily: 'var(--font-sans)',
                                background: 'var(--primary-500)', color: 'white',
                                border: 'none', borderRadius: '4px', cursor: 'pointer',
                                transition: 'background 0.2s, box-shadow 0.2s'
                            }}
                            onMouseOver={e => { e.currentTarget.style.background = 'var(--primary-600)'; e.currentTarget.style.boxShadow = 'var(--shadow-xs)'; }}
                            onMouseOut={e => { e.currentTarget.style.background = 'var(--primary-500)'; e.currentTarget.style.boxShadow = 'none'; }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                            </svg>
                            Add Device
                        </button>

                        {/* Refresh Icon Button */}
                        <button onClick={fetchData} title="Refresh"
                            style={{ height: '36px', width: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', borderRadius: '50%', cursor: 'pointer', color: 'var(--gray-600)', transition: 'background 0.2s' }}
                            onMouseOver={e => e.currentTarget.style.background = 'var(--gray-200)'} onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
                                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* ── Filter Tabs (Google Style) ── */}
                <div style={{ padding: '0 24px', background: 'white', borderBottom: '1px solid var(--gray-300)', display: 'flex', gap: '24px' }}>
                    {[
                        { key: 'all', label: 'All vehicles', count: stats.total },
                        { key: 'online', label: 'Online', count: stats.online },
                        { key: 'idle', label: 'Idle', count: stats.idle },
                        { key: 'offline', label: 'Offline', count: stats.offline },
                    ].map(({ key, label, count }) => (
                        <button key={key} onClick={() => setStatusFilter(key)}
                            style={{
                                padding: '12px 0', fontSize: '0.875rem', fontWeight: 500, color: statusFilter === key ? 'var(--primary-600)' : 'var(--gray-600)',
                                background: 'transparent', border: 'none', borderBottom: statusFilter === key ? '3px solid var(--primary-500)' : '3px solid transparent',
                                cursor: 'pointer', transition: 'color 0.2s', display: 'flex', alignItems: 'center', gap: '6px'
                            }}>
                            {label} <span style={{ background: statusFilter === key ? 'var(--primary-50)' : 'var(--gray-100)', color: statusFilter === key ? 'var(--primary-700)' : 'var(--gray-600)', padding: '2px 6px', borderRadius: '12px', fontSize: '0.75rem' }}>{count}</span>
                        </button>
                    ))}
                </div>

                {/* ── Table Area ── */}
                <div style={{ flex: 1, padding: '24px', overflow: 'auto' }}>
                    <div style={{ background: 'white', borderRadius: '8px', border: '1px solid var(--gray-300)', overflow: 'hidden', boxShadow: '0 1px 2px 0 rgba(60,64,67,0.1)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--gray-300)' }}>
                                    {[
                                        { key: 'name', label: 'Vehicle Name' },
                                        { key: null, label: 'Identifier' },
                                        { key: 'status', label: 'Status' },
                                        { key: 'speed', label: 'Speed' },
                                        { key: 'lastUpdate', label: 'Last Activity' },
                                        { key: null, label: 'Actions' },
                                    ].map((col, i) => (
                                        <th key={i} onClick={() => col.key && handleSort(col.key)}
                                            style={{
                                                padding: '12px 16px', fontSize: '0.75rem', fontWeight: 500,
                                                color: 'var(--gray-600)', cursor: col.key ? 'pointer' : 'default',
                                                userSelect: 'none', background: 'white'
                                            }}>
                                            <span style={{ display: 'flex', alignItems: 'center' }}>
                                                {col.label}
                                                {col.key && <SortIcon col={col.key} sortBy={sortBy} sortDir={sortDir} />}
                                            </span>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {sorted.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} style={{ padding: '48px', textAlign: 'center', color: 'var(--gray-500)' }}>
                                            No vehicles found matching your criteria.
                                        </td>
                                    </tr>
                                ) : sorted.map((v) => {
                                    const meta = STATUS_META[v.status] || STATUS_META.offline;
                                    const isExpanded = expandedRow === v.id;
                                    return (
                                        <React.Fragment key={v.id}>
                                            <tr
                                                style={{ cursor: 'pointer', background: isExpanded ? 'var(--primary-50)' : 'white', transition: 'background 0.2s', borderBottom: '1px solid var(--gray-200)' }}
                                                onClick={() => setExpandedRow(isExpanded ? null : v.id)}
                                                onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = 'var(--gray-50)'; }}
                                                onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = 'white'; }}
                                            >
                                                <td style={{ padding: '12px 16px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: meta.dotColor }} />
                                                        <div style={{ fontWeight: 500, color: 'var(--gray-900)', fontSize: '0.875rem' }}>{v.name}</div>
                                                    </div>
                                                </td>
                                                <td style={{ padding: '12px 16px' }}>
                                                    <div style={{ fontSize: '0.875rem', color: 'var(--gray-800)' }}>{v.vehicleNumber || '—'}</div>
                                                    <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>{v.imei}</div>
                                                </td>
                                                <td style={{ padding: '12px 16px' }}>
                                                    <span style={{ padding: '4px 8px', borderRadius: '4px', background: meta.bg, color: meta.color, fontSize: '0.75rem', fontWeight: 500 }}>
                                                        {meta.label}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '12px 16px', fontSize: '0.875rem', color: v.position?.speed > 0 ? 'var(--gray-900)' : 'var(--gray-500)' }}>
                                                    {v.position ? `${Math.round(v.position.speed * 1.852)} km/h` : '—'}
                                                </td>
                                                <td style={{ padding: '12px 16px', fontSize: '0.875rem', color: 'var(--gray-600)' }}>
                                                    {v.position?.fixTime ? formatTimeAgo(v.position.fixTime) : formatDate(v.lastUpdate)}
                                                </td>
                                                <td style={{ padding: '12px 16px' }}>
                                                    <div style={{ display: 'flex', gap: '8px' }}>
                                                        {['dashboard', 'history', `vehicles/${v.id}`].map((path, idx) => {
                                                            const icons = [
                                                                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" key={1} />,
                                                                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" key={2} />,
                                                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" key={3} />
                                                            ];
                                                            const titles = ['Map', 'History', 'Details'];
                                                            return (
                                                                <button key={idx} title={titles[idx]} onClick={e => { e.stopPropagation(); router.push(`/${path}`); }}
                                                                    style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', borderRadius: '50%', cursor: 'pointer', color: 'var(--gray-600)', transition: 'background 0.2s' }}
                                                                    onMouseOver={e => { e.currentTarget.style.background = 'var(--gray-200)'; e.currentTarget.style.color = 'var(--primary-600)'; }} onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--gray-600)'; }}>
                                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                        {icons[idx]}
                                                                    </svg>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </td>
                                            </tr>

                                            {/* ── Expanded Google Style Panel ── */}
                                            {isExpanded && (
                                                <tr style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--gray-300)' }}>
                                                    <td colSpan={6} style={{ padding: '24px' }}>
                                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '24px' }}>
                                                            <div>
                                                                <div style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--gray-900)', marginBottom: '12px' }}>Identity</div>
                                                                <DetailBlock label="Vehicle Name" value={v.name} />
                                                                <DetailBlock label="License Plate" value={v.vehicleNumber || '—'} />
                                                                <DetailBlock label="IMEI / Tracker ID" value={v.imei} />
                                                            </div>
                                                            <div>
                                                                <div style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--gray-900)', marginBottom: '12px' }}>Location Data</div>
                                                                <DetailBlock label="Status" value={meta.label} accent={meta.color} />
                                                                <DetailBlock label="Speed" value={v.position ? `${Math.round(v.position.speed * 1.852)} km/h` : '—'} />
                                                                <DetailBlock label="Last Fix Time" value={v.position ? formatDate(v.position.fixTime) : '—'} />
                                                            </div>
                                                            <div>
                                                                <div style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--gray-900)', marginBottom: '12px' }}>Sensors & Status</div>
                                                                <DetailBlock label="Ignition" value={<StatusPill active={v.ignition} />} />
                                                                <DetailBlock label="Motion" value={<StatusPill active={v.motion} />} />
                                                                <DetailBlock label="Battery" value={v.batteryLevel ? `${Math.round(v.batteryLevel)}%` : '—'} />
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
                    </div>
                </div>
            </div>
        </div>
    );
}