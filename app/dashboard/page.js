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

// ── Small helper components ─────────────────────────────────────────────────

/** Ignition indicator: green key = on, gray = off, nothing if unknown */
function IgnitionBadge({ ignition }) {
    if (ignition === null || ignition === undefined) return null;
    const on = ignition === true || ignition === 'true';
    return (
        <span title={on ? 'Engine on' : 'Engine off'} style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.2rem',
            fontSize: '0.65rem', fontWeight: 600,
            color: on ? 'var(--success-600)' : 'var(--gray-400)',
        }}>
            {/* Key icon */}
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="7.5" cy="15.5" r="5.5" />
                <path d="M21 2l-9.6 9.6" />
                <path d="M15.5 7.5l3 3L22 7l-3-3" />
            </svg>
            {on ? 'ON' : 'OFF'}
        </span>
    );
}

/** Battery level bar — shows % with colour coding */
function BatteryBadge({ level }) {
    if (level === null || level === undefined) return null;
    const pct = Math.round(level);
    const color = pct > 60 ? 'var(--success-500)' : pct > 20 ? 'var(--warning-500)' : 'var(--danger-500)';
    return (
        <span title={`Battery ${pct}%`} style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
            fontSize: '0.65rem', fontWeight: 600, color,
        }}>
            <svg width="12" height="10" viewBox="0 0 24 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="3" width="18" height="12" rx="2" />
                <path d="M19 8h2a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-2" />
                <rect x="3" y="5" width={Math.max(1, Math.round(pct / 100 * 14))} height="8" rx="1" fill="currentColor" stroke="none" />
            </svg>
            {pct}%
        </span>
    );
}

/** Alarm badge — only shows when there is an active alarm */
function AlarmBadge({ alarm }) {
    if (!alarm) return null;
    const labels = {
        sos: 'SOS', panic: 'SOS', overspeed: 'Speed', geofenceEnter: 'Geo In',
        geofenceExit: 'Geo Out', powerCut: 'Power', lowBattery: 'Low Bat',
        vibration: 'Vibrate', accident: 'Accident',
    };
    const label = labels[alarm] || alarm;
    return (
        <span title={`Alarm: ${alarm}`} style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.2rem',
            fontSize: '0.65rem', fontWeight: 700,
            color: 'var(--danger-600)',
            background: 'var(--danger-50)',
            padding: '0.1rem 0.35rem',
            borderRadius: '4px',
            border: '1px solid var(--danger-200)',
            animation: 'alarm-pulse 1.5s ease-in-out infinite',
        }}>
            ⚠ {label}
        </span>
    );
}

// ── Main page ───────────────────────────────────────────────────────────────

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
    }, []);

    const mergeVehicleData = useCallback((devices, positionList) => {
        return devices.map((device) => {
            const position = positionList.find((p) => p.deviceId === device.id) || null;
            const status = getVehicleStatus(device, position);
            const attrs = position?.attributes || {};
            return {
                id: device.id,
                name: device.name || `Device ${device.id}`,
                uniqueId: device.uniqueId,
                status,
                lastUpdate: device.lastUpdate || null,
                // Device-level fields
                phone: device.phone || null,
                model: device.model || null,
                category: device.category || null,
                contact: device.contact || null,
                // Position
                position: position ? {
                    latitude: position.latitude,
                    longitude: position.longitude,
                    speed: position.speed || 0,
                    course: position.course || 0,
                    altitude: position.altitude || 0,
                    fixTime: position.fixTime,
                    serverTime: position.serverTime || null,
                    address: position.address || null,
                    valid: position.valid ?? true,
                    protocol: position.protocol || null,
                } : null,
                // Attributes from position (the key new data)
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
                    rpm: attrs.rpm ?? null,
                    fuel: attrs.fuel ?? null,
                    temperature: attrs.temperature ?? null,
                    input1: attrs.input1 ?? null,
                    input2: attrs.input2 ?? null,
                },
            };
        });
    }, [getVehicleStatus]);

    const fetchData = useCallback(async (isInitial = false) => {
        try {
            if (!isInitial) setRefreshing(true);

            const user = await new Promise((resolve) => {
                const unsubscribe = onAuthStateChanged(auth, (u) => {
                    unsubscribe();
                    resolve(u);
                });
            });

            if (!user) { router.push('/login'); return; }

            const [devicesRes, positionsRes] = await Promise.all([
                apiFetch('/api/devices'),
                apiFetch('/api/positions'),
            ]);

            if (devicesRes.status === 401 || positionsRes.status === 401) {
                router.push('/login');
                return;
            }

            const devicesData = await devicesRes.json();
            const positionsData = await positionsRes.json();

            if (devicesRes.ok && positionsRes.ok) {
                const merged = mergeVehicleData(devicesData, positionsData);
                setVehicles(merged);
                setPositions(positionsData);
                setLastUpdate(new Date());
                setError('');
            } else {
                setError('Failed to fetch vehicle data');
            }
        } catch (err) {
            console.error('Fetch error:', err);
            setError('Connection error. Retrying...');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
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

    const handleVehicleClick = (vehicle) => {
        setSelectedVehicle(vehicle.id === selectedVehicle ? null : vehicle.id);
    };

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
                        <div className="float-stat">
                            <span className="float-stat-dot" style={{ background: 'var(--success-500)' }} />
                            <span className="float-stat-count" style={{ color: 'var(--success-600)' }}>{stats.online}</span>
                            <span className="float-stat-label">Online</span>
                        </div>
                        <div className="float-stat-divider" />
                        <div className="float-stat">
                            <span className="float-stat-dot" style={{ background: 'var(--warning-500)' }} />
                            <span className="float-stat-count" style={{ color: 'var(--warning-600)' }}>{stats.idle}</span>
                            <span className="float-stat-label">Idle</span>
                        </div>
                        <div className="float-stat-divider" />
                        <div className="float-stat">
                            <span className="float-stat-dot" style={{ background: 'var(--gray-400)' }} />
                            <span className="float-stat-count" style={{ color: 'var(--gray-600)' }}>{stats.offline}</span>
                            <span className="float-stat-label">Offline</span>
                        </div>
                        <div className="float-stat-divider" />
                        <div className="float-stat">
                            <span className="float-stat-dot" style={{ background: 'var(--primary-500)' }} />
                            <span className="float-stat-count" style={{ color: 'var(--primary-600)' }}>{stats.total}</span>
                            <span className="float-stat-label">Total</span>
                        </div>
                    </div>

                    {/* Vehicle list card */}
                    <div className="float-vehicles-card">
                        {/* Search */}
                        <div className="float-search-row">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--gray-400)', flexShrink: 0 }}>
                                <circle cx="11" cy="11" r="8" />
                                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                            </svg>
                            <input
                                id="vehicle-search"
                                type="text"
                                className="float-search-input"
                                placeholder="Search vehicles..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>

                        {/* Header row */}
                        <div className="float-list-header">
                            <span>All Vehicles</span>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--gray-400)' }}>
                                <line x1="4" y1="6" x2="20" y2="6" /><line x1="8" y1="12" x2="16" y2="12" /><line x1="10" y1="18" x2="14" y2="18" />
                            </svg>
                        </div>

                        {/* List */}
                        <div className="float-vehicle-list">
                            {sortedVehicles.length === 0 ? (
                                <div className="empty-state" style={{ padding: '2rem 1rem' }}>
                                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                        <rect x="1" y="3" width="15" height="13" rx="2" />
                                        <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                                        <circle cx="5.5" cy="18.5" r="2.5" />
                                        <circle cx="18.5" cy="18.5" r="2.5" />
                                    </svg>
                                    <p>{search ? 'No matches' : 'No vehicles'}</p>
                                </div>
                            ) : (
                                sortedVehicles.map((vehicle) => (
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
                                                <circle cx="5.5" cy="18.5" r="2.5" />
                                                <circle cx="18.5" cy="18.5" r="2.5" />
                                            </svg>
                                        </div>

                                        <div className="vehicle-info" style={{ flex: 1, minWidth: 0 }}>
                                            <div className="float-vehicle-name">{vehicle.name}</div>

                                            {/* Speed + time row */}
                                            <div className="vehicle-meta">
                                                {vehicle.position && (
                                                    <span className="vehicle-speed">
                                                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                                                        </svg>
                                                        {Math.round(vehicle.position.speed * 1.852)} km/h
                                                    </span>
                                                )}
                                                <span className="vehicle-time">
                                                    {vehicle.position
                                                        ? formatTimeAgo(vehicle.position.fixTime)
                                                        : 'No data'}
                                                </span>
                                            </div>

                                            {/* ── Attribute badges row ── */}
                                            {(vehicle.attrs.ignition !== null ||
                                                vehicle.attrs.batteryLevel !== null ||
                                                vehicle.attrs.alarm) && (
                                                    <div style={{
                                                        display: 'flex', alignItems: 'center',
                                                        gap: '0.375rem', marginTop: '0.3rem',
                                                        flexWrap: 'wrap',
                                                    }}>
                                                        <IgnitionBadge ignition={vehicle.attrs.ignition} />
                                                        <BatteryBadge level={vehicle.attrs.batteryLevel} />
                                                        <AlarmBadge alarm={vehicle.attrs.alarm} />
                                                    </div>
                                                )}
                                        </div>

                                        {/* Status pill */}
                                        <div className="float-vehicle-status">
                                            <span className={`float-status-dot float-status-${vehicle.status}`} />
                                            <span className={`float-status-label float-status-label-${vehicle.status}`}>
                                                {vehicle.status.charAt(0).toUpperCase() + vehicle.status.slice(1)}
                                            </span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* Top-right sync indicator */}
                <div className={`refresh-indicator ${refreshing ? 'refreshing' : ''}`}>
                    <div className={`refresh-dot ${refreshing ? 'refreshing' : ''}`} />
                    {refreshing ? 'Updating...' : lastUpdate ? `Last sync: ${lastUpdate.toLocaleTimeString()}` : 'Loading...'}
                </div>

                {/* Error toast */}
                {error && (
                    <div className="error-toast">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                            <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                        {error}
                    </div>
                )}
            </div>
        </div>
    );
}