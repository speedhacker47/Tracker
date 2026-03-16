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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: 'var(--gray-100)' }}>
            <div className="map-loading-spinner" style={{ width: 36, height: 36, borderTopColor: 'var(--primary-500)' }} />
        </div>
    ),
});

const REFRESH_INTERVAL = 10000;

function StatusPill({ active, label }) {
    if (active === null || active === undefined) return null;
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', padding: '2px 6px', borderRadius: '4px',
            fontSize: '0.65rem', fontWeight: 500, border: `1px solid ${active ? 'var(--success-500)' : 'var(--gray-300)'}`,
            color: active ? 'var(--success-600)' : 'var(--gray-600)', background: active ? 'var(--success-50)' : 'white',
        }}>
            {label}: {active ? 'ON' : 'OFF'}
        </span>
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
                    latitude: position.latitude, longitude: position.longitude,
                    speed: position.speed || 0, course: position.course || 0,
                    fixTime: position.fixTime, address: position.address || null,
                } : null,
                attrs: { ignition: attrs.ignition ?? null, batteryLevel: attrs.batteryLevel ?? null, alarm: attrs.alarm ?? null },
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
                apiFetch('/api/devices'), apiFetch('/api/positions'),
            ]);
            if (devicesRes.status === 401 || positionsRes.status === 401) { router.push('/login'); return; }
            if (devicesRes.ok && positionsRes.ok) {
                setVehicles(mergeVehicleData(await devicesRes.json(), await positionsRes.json()));
                setLastUpdate(new Date()); setError('');
            } else { setError('Failed to fetch vehicle data'); }
        } catch (err) { setError('Connection error. Retrying...'); }
        finally { setLoading(false); setRefreshing(false); }
    }, [router, mergeVehicleData]);

    useEffect(() => {
        fetchData(true);
        intervalRef.current = setInterval(() => fetchData(false), REFRESH_INTERVAL);
        return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, [fetchData]);

    const filteredVehicles = vehicles.filter((v) => v.name.toLowerCase().includes(search.toLowerCase()) || (v.uniqueId && v.uniqueId.toLowerCase().includes(search.toLowerCase())));
    const sortedVehicles = [...filteredVehicles].sort((a, b) => {
        const order = { online: 0, idle: 1, offline: 2 };
        return (order[a.status] || 2) - (order[b.status] || 2);
    });

    const stats = vehicles.reduce((acc, v) => { acc[v.status] = (acc[v.status] || 0) + 1; acc.total++; return acc; }, { online: 0, idle: 0, offline: 0, total: 0 });
    const formatTimeAgo = (dateStr) => {
        if (!dateStr) return '—';
        const diff = (new Date() - new Date(dateStr)) / 1000;
        if (diff < 60) return 'Just now';
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        return `${Math.floor(diff / 3600)}h ago`;
    };

    if (loading) return (
        <div className="dashboard-shell">
            <NavBar />
            <div className="dashboard-map-area" style={{ background: 'var(--gray-100)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div className="map-loading-spinner" style={{ width: 36, height: 36, borderTopColor: 'var(--primary-500)' }} />
            </div>
        </div>
    );

    const mapCardStyle = {
        background: 'white', borderRadius: '8px', border: '1px solid var(--gray-300)',
        boxShadow: '0 1px 2px 0 rgba(60,64,67,0.3), 0 2px 6px 2px rgba(60,64,67,0.15)', overflow: 'hidden'
    };

    return (
        <div className="dashboard-shell">
            <NavBar />
            <div className="dashboard-map-area">
                <MapComponent vehicles={sortedVehicles} selectedVehicle={selectedVehicle} onVehicleSelect={setSelectedVehicle} />

                {/* ===== Google Maps Style Floating Left Panels ===== */}
                <div style={{ position: 'absolute', top: '16px', left: '16px', width: '340px', zIndex: 1000, display: 'flex', flexDirection: 'column', gap: '16px' }}>

                    {/* Search and List Card */}
                    <div style={{ ...mapCardStyle, display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 120px)' }}>
                        <div style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--gray-200)' }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--gray-500)" strokeWidth="2">
                                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                            </svg>
                            <input type="text" placeholder="Search Google Maps" value={search} onChange={(e) => setSearch(e.target.value)}
                                style={{ flex: 1, border: 'none', outline: 'none', padding: '8px 12px', fontSize: '0.875rem', color: 'var(--gray-900)', fontFamily: 'var(--font-sans)' }} />
                        </div>

                        {/* Quick Stats Row */}
                        <div style={{ display: 'flex', padding: '12px 16px', borderBottom: '1px solid var(--gray-200)', background: 'var(--gray-50)', justifyContent: 'space-between' }}>
                            <div style={{ fontSize: '0.75rem', color: 'var(--success-600)', fontWeight: 500 }}>{stats.online} Online</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--warning-600)', fontWeight: 500 }}>{stats.idle} Idle</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--gray-600)', fontWeight: 500 }}>{stats.offline} Offline</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--primary-600)', fontWeight: 500 }}>{stats.total} Total</div>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto' }}>
                            {sortedVehicles.map((vehicle) => {
                                const addr = shortAddress(vehicle.position?.address);
                                const isSelected = selectedVehicle === vehicle.id;
                                const dotColor = vehicle.status === 'online' ? 'var(--success-500)' : vehicle.status === 'idle' ? 'var(--warning-500)' : 'var(--gray-400)';
                                return (
                                    <div key={vehicle.id} onClick={() => setSelectedVehicle(isSelected ? null : vehicle.id)}
                                        style={{
                                            display: 'flex', padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid var(--gray-100)',
                                            background: isSelected ? 'var(--primary-50)' : 'white', transition: 'background 0.2s'
                                        }}
                                        onMouseOver={e => { if (!isSelected) e.currentTarget.style.background = 'var(--gray-50)'; }}
                                        onMouseOut={e => { if (!isSelected) e.currentTarget.style.background = 'white'; }}>

                                        <div style={{ flex: 1 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                                <div style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor }} />
                                                <div style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--gray-900)' }}>{vehicle.name}</div>
                                            </div>

                                            {addr && <div style={{ fontSize: '0.75rem', color: 'var(--gray-600)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: '4px' }}>{addr}</div>}

                                            <div style={{ display: 'flex', gap: '12px', fontSize: '0.75rem', color: 'var(--gray-500)' }}>
                                                {vehicle.position && <span>{Math.round(vehicle.position.speed * 1.852)} km/h</span>}
                                                <span>{vehicle.position ? formatTimeAgo(vehicle.position.fixTime) : 'No data'}</span>
                                            </div>

                                            {vehicle.attrs.ignition !== null && (
                                                <div style={{ marginTop: '6px' }}><StatusPill active={vehicle.attrs.ignition} label="IGN" /></div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Floating Sync indicator */}
                <div style={{ position: 'absolute', top: '16px', right: '16px', zIndex: 1000, background: 'white', padding: '6px 12px', borderRadius: '16px', fontSize: '0.75rem', color: 'var(--gray-600)', boxShadow: '0 1px 2px 0 rgba(60,64,67,0.3)' }}>
                    {refreshing ? 'Updating...' : lastUpdate ? `Updated ${formatTimeAgo(lastUpdate)}` : 'Live'}
                </div>
            </div>
        </div>
    );
}