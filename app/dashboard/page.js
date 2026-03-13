'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import NavBar from '@/components/NavBar';
import { apiFetch } from '@/lib/api';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';

const MapComponent = dynamic(() => import('@/components/Map'), {
    ssr: false,
    loading: () => (
        <div className="map-loading">
            <div className="map-loading-spinner" />
            <span>Loading map...</span>
        </div>
    ),
});

const REFRESH_INTERVAL = 10000;

function IgnitionBadge({ ignition }) {
    if (ignition === null || ignition === undefined) return null;
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.2rem',
            padding: '0.1rem 0.4rem', borderRadius: '999px', fontSize: '0.65rem', fontWeight: 700,
            background: ignition ? '#dcfce7' : '#f3f4f6', color: ignition ? '#16a34a' : '#9ca3af',
        }}>
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
            {ignition ? 'IGN ON' : 'IGN OFF'}
        </span>
    );
}

function BatteryBadge({ level }) {
    if (level === null || level === undefined) return null;
    const pct = Math.round(level);
    const color = pct > 60 ? '#16a34a' : pct > 20 ? '#d97706' : '#dc2626';
    const bg = pct > 60 ? '#dcfce7' : pct > 20 ? '#fef3c7' : '#fee2e2';
    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', padding: '0.1rem 0.4rem', borderRadius: '999px', fontSize: '0.65rem', fontWeight: 700, background: bg, color }}>
            🔋 {pct}%
        </span>
    );
}

function AlarmBadge({ alarm }) {
    if (!alarm) return null;
    const labels = { sos: 'SOS', powerCut: 'PWR CUT', lowBattery: 'LOW BAT', vibration: 'VIBRATION', overspeed: 'OVERSPD' };
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.2rem',
            padding: '0.1rem 0.4rem', borderRadius: '999px', fontSize: '0.65rem', fontWeight: 700,
            background: '#fee2e2', color: '#b91c1c', animation: 'alarm-pulse 1.5s ease-in-out infinite',
        }}>⚠ {labels[alarm] || alarm}</span>
    );
}

function shortAddress(addr) {
    if (!addr) return null;
    const parts = addr.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length <= 2) return parts.join(', ');
    return parts.slice(0, 2).join(', ');
}

export default function DashboardPage() {
    const router = useRouter();
    const [vehicles, setVehicles] = useState([]);
    const [positions, setPositions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [selectedVehicle, setSelectedVehicle] = useState(null);
    const [lastUpdate, setLastUpdate] = useState(null);
    const intervalRef = useRef(null);

    const getVehicleStatus = useCallback((device, position) => {
        const s = (device.status || '').toLowerCase();
        if (s === 'online') {
            if (position?.speed > 0) return 'online';
            if (position?.fixTime && (new Date() - new Date(position.fixTime)) / 1000 < 300) return 'online';
            return 'idle';
        }
        if (s === 'unknown') return 'idle';
        return 'offline';
    }, []);

    const mergeVehicleData = useCallback((devices, positionList) => {
        return devices.map((device) => {
            const position = positionList.find((p) => p.deviceId === device.id) || null;
            const attrs = position?.attributes || {};
            return {
                id: device.id,
                name: device.name || `Device ${device.id}`,
                uniqueId: device.uniqueId,
                status: getVehicleStatus(device, position),
                lastUpdate: device.lastUpdate || null,
                position: position ? {
                    latitude: position.latitude,
                    longitude: position.longitude,
                    speed: position.speed || 0,
                    course: position.course || 0,
                    fixTime: position.fixTime,
                    serverTime: position.serverTime || null,
                    address: position.address || null,
                } : null,
                attrs: {
                    ignition: attrs.ignition ?? null,
                    motion: attrs.motion ?? null,
                    batteryLevel: attrs.batteryLevel ?? null,
                    battery: attrs.battery ?? null,
                    charge: attrs.charge ?? null,
                    alarm: attrs.alarm ?? null,
                    sat: attrs.sat ?? null,
                    odometer: attrs.odometer ?? null,
                    hours: attrs.hours ?? null,
                },
            };
        });
    }, [getVehicleStatus]);

    const fetchData = useCallback(async (isInitial = false) => {
        try {
            if (!isInitial) setRefreshing(true);
            const user = await new Promise((resolve) => {
                const unsubscribe = onAuthStateChanged(auth, (u) => { unsubscribe(); resolve(u); });
            });
            if (!user) { router.push('/login'); return; }
            const [devicesRes, positionsRes] = await Promise.all([
                apiFetch('/api/devices'),
                apiFetch('/api/positions'),
            ]);
            if (devicesRes.status === 401 || positionsRes.status === 401) { router.push('/login'); return; }
            const devicesData = await devicesRes.json();
            const positionsData = await positionsRes.json();
            if (devicesRes.ok && positionsRes.ok) {
                setVehicles(mergeVehicleData(devicesData, positionsData));
                setPositions(positionsData);
                setLastUpdate(new Date());
                setError('');
            } else { setError('Failed to fetch vehicle data'); }
        } catch (err) {
            console.error('Fetch error:', err);
            setError('Connection error. Retrying...');
        } finally { setLoading(false); setRefreshing(false); }
    }, [router, mergeVehicleData]);

    useEffect(() => {
        fetchData(true);
        intervalRef.current = setInterval(() => fetchData(false), REFRESH_INTERVAL);
        return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, [fetchData]);

    const filteredVehicles = vehicles.filter((v) => {
        const q = search.toLowerCase();
        return v.name.toLowerCase().includes(q) || (v.uniqueId && v.uniqueId.toLowerCase().includes(q));
    });

    const sortedVehicles = [...filteredVehicles].sort((a, b) => {
        const order = { online: 0, idle: 1, offline: 2 };
        return (order[a.status] || 2) - (order[b.status] || 2);
    });

    const stats = vehicles.reduce(
        (acc, v) => { acc[v.status] = (acc[v.status] || 0) + 1; acc.total++; return acc; },
        { online: 0, idle: 0, offline: 0, total: 0 }
    );

    const handleVehicleClick = (vehicle) => setSelectedVehicle(vehicle.id === selectedVehicle ? null : vehicle.id);

    const formatTimeAgo = (dateStr) => {
        if (!dateStr) return '—';
        const diff = (new Date() - new Date(dateStr)) / 1000;
        if (diff < 60) return 'Just now';
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        return `${Math.floor(diff / 86400)}d ago`;
    };

    if (loading) {
        return (
            <div className="dashboard-shell">
                <NavBar />
                <div className="dashboard-map-area">
                    <div className="map-loading">
                        <div className="map-loading-spinner" />
                        <p style={{ color: 'var(--gray-400)', fontSize: '0.875rem' }}>Loading dashboard...</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="dashboard-shell">
            <NavBar />

            <div className="dashboard-map-area">
                <MapComponent
                    vehicles={sortedVehicles}
                    selectedVehicle={selectedVehicle}
                    onVehicleSelect={setSelectedVehicle}
                />

                {/* ===== Floating Left Panels ===== */}
                <div className="dashboard-float-left">

                    {/* Stats card */}
                    <div className="float-stats-card">
                        {[
                            { dot: 'var(--success-500)', count: stats.online, color: 'var(--success-600)', label: 'Online' },
                            { dot: 'var(--warning-500)', count: stats.idle, color: 'var(--warning-600)', label: 'Idle' },
                            { dot: 'var(--gray-400)', count: stats.offline, color: 'var(--gray-600)', label: 'Offline' },
                            { dot: 'var(--primary-500)', count: stats.total, color: 'var(--primary-600)', label: 'Total' },
                        ].map((s, i) => (
                            <>
                                {i > 0 && <div key={`div-${i}`} className="float-stat-divider" />}
                                <div key={s.label} className="float-stat">
                                    <span className="float-stat-dot" style={{ background: s.dot }} />
                                    <span className="float-stat-count" style={{ color: s.color }}>{s.count}</span>
                                    <span className="float-stat-label">{s.label}</span>
                                </div>
                            </>
                        ))}
                    </div>

                    {/* Vehicle list card */}
                    <div className="float-vehicles-card">
                        <div className="float-search-row">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--gray-400)', flexShrink: 0 }}>
                                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                            </svg>
                            <input
                                type="text"
                                className="float-search-input"
                                placeholder="Search vehicles..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>

                        <div className="float-list-header">
                            <span>All Vehicles ({vehicles.length})</span>
                        </div>

                        <div className="float-vehicle-list">
                            {sortedVehicles.length === 0 ? (
                                <div className="empty-state" style={{ padding: '2rem 1rem' }}>
                                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                        <rect x="1" y="3" width="15" height="13" rx="2" />
                                        <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                                        <circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" />
                                    </svg>
                                    <p>{search ? 'No matches' : 'No vehicles'}</p>
                                </div>
                            ) : (
                                sortedVehicles.map((vehicle) => {
                                    const addr = shortAddress(vehicle.position?.address);
                                    return (
                                        <div
                                            key={vehicle.id}
                                            id={`vehicle-${vehicle.id}`}
                                            className={`float-vehicle-row ${selectedVehicle === vehicle.id ? 'active' : ''}`}
                                            onClick={() => handleVehicleClick(vehicle)}
                                        >
                                            <div className={`vehicle-icon vehicle-icon-${vehicle.status}`}>
                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <rect x="1" y="3" width="15" height="13" rx="2" />
                                                    <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                                                    <circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" />
                                                </svg>
                                            </div>

                                            <div className="vehicle-info" style={{ flex: 1, minWidth: 0 }}>
                                                <div className="float-vehicle-name">{vehicle.name}</div>

                                                {/* ── Address line ── */}
                                                {addr ? (
                                                    <div style={{
                                                        fontSize: '0.6875rem', color: 'var(--gray-400)',
                                                        marginTop: '0.1rem',
                                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                        display: 'flex', alignItems: 'center', gap: '0.2rem',
                                                    }}>
                                                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                                                            <path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z" />
                                                            <circle cx="12" cy="10" r="3" />
                                                        </svg>
                                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{addr}</span>
                                                    </div>
                                                ) : (
                                                    !vehicle.position && (
                                                        <div style={{ fontSize: '0.6875rem', color: 'var(--gray-300)', marginTop: '0.1rem' }}>No GPS data</div>
                                                    )
                                                )}

                                                {/* Speed + time */}
                                                <div className="vehicle-meta">
                                                    {vehicle.position && (
                                                        <span className="vehicle-speed">
                                                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                                                            </svg>
                                                            {Math.round(vehicle.position.speed * 1.852)} km/h
                                                        </span>
                                                    )}
                                                    <span className="vehicle-time">
                                                        {vehicle.position ? formatTimeAgo(vehicle.position.fixTime) : 'No data'}
                                                    </span>
                                                </div>

                                                {/* Badges */}
                                                {(vehicle.attrs.ignition !== null || vehicle.attrs.batteryLevel !== null || vehicle.attrs.alarm) && (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.3rem', flexWrap: 'wrap' }}>
                                                        <IgnitionBadge ignition={vehicle.attrs.ignition} />
                                                        <BatteryBadge level={vehicle.attrs.batteryLevel} />
                                                        <AlarmBadge alarm={vehicle.attrs.alarm} />
                                                    </div>
                                                )}
                                            </div>

                                            <div className="float-vehicle-status">
                                                <span className={`float-status-dot float-status-${vehicle.status}`} />
                                                <span className={`float-status-label float-status-label-${vehicle.status}`}>
                                                    {vehicle.status.charAt(0).toUpperCase() + vehicle.status.slice(1)}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>

                {/* Sync indicator */}
                <div className={`refresh-indicator ${refreshing ? 'refreshing' : ''}`}>
                    <div className={`refresh-dot ${refreshing ? 'refreshing' : ''}`} />
                    {refreshing ? 'Updating...' : lastUpdate ? `Updated ${formatTimeAgo(lastUpdate)}` : 'Live'}
                </div>

                {error && (
                    <div className="error-toast">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                        {error}
                    </div>
                )}
            </div>
        </div>
    );
}