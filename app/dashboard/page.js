'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';
import dynamic from 'next/dynamic';
import NavBar from '@/components/NavBar';

// Dynamically import Map with no SSR (Leaflet breaks on server)
const MapComponent = dynamic(() => import('@/components/Map'), {
    ssr: false,
    loading: () => (
        <div className="map-loading">
            <div className="map-loading-spinner" />
            <span>Loading map...</span>
        </div>
    ),
});

const REFRESH_INTERVAL = 10000; // 10 seconds

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

    // Get user from cookie
    const getUserFromCookie = () => {
        try {
            const userCookie = Cookies.get('trackpro_user');
            return userCookie ? JSON.parse(userCookie) : null;
        } catch {
            return null;
        }
    };

    const user = getUserFromCookie();

    // Get vehicle status using Traccar's built-in device status
    // Traccar tracks online/offline via protocol heartbeats (more reliable than fixTime)
    const getVehicleStatus = useCallback((device, position) => {
        // Primary: use Traccar's device.status field
        const traccarStatus = (device.status || '').toLowerCase();

        if (traccarStatus === 'online') {
            // Device is online — check if moving or idle
            if (position && position.speed > 0) {
                return 'online'; // moving
            }
            // Online but speed=0 — check how long it's been stationary
            if (position && position.fixTime) {
                const diff = (new Date() - new Date(position.fixTime)) / 1000;
                if (diff < 300) return 'online'; // recent fix, just stopped
            }
            return 'idle'; // online but not moving
        }

        if (traccarStatus === 'unknown') return 'idle';

        return 'offline';
    }, []);

    // Merge devices and positions into vehicle objects
    const mergeVehicleData = useCallback((devices, positionList) => {
        return devices.map((device) => {
            const position = positionList.find((p) => p.deviceId === device.id) || null;
            const status = getVehicleStatus(device, position);

            return {
                id: device.id,
                name: device.name || `Device ${device.id}`,
                uniqueId: device.uniqueId,
                status,
                lastUpdate: device.lastUpdate || null,
                position: position
                    ? {
                        latitude: position.latitude,
                        longitude: position.longitude,
                        speed: position.speed || 0,
                        course: position.course || 0,
                        fixTime: position.fixTime,
                        serverTime: position.serverTime || null,
                        address: position.address || null,
                    }
                    : null,
            };
        });
    }, [getVehicleStatus]);

    // Fetch data from our API routes
    const fetchData = useCallback(async (isInitial = false) => {
        try {
            if (!isInitial) setRefreshing(true);

            const token = Cookies.get('trackpro_token');
            if (!token) {
                router.push('/login');
                return;
            }

            const headers = { Authorization: `Bearer ${token}` };

            const [devicesRes, positionsRes] = await Promise.all([
                fetch('/api/devices', { headers }),
                fetch('/api/positions', { headers }),
            ]);

            if (devicesRes.status === 401 || positionsRes.status === 401) {
                Cookies.remove('trackpro_token');
                Cookies.remove('trackpro_user');
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

    // Initial fetch + polling
    useEffect(() => {
        fetchData(true);

        intervalRef.current = setInterval(() => {
            fetchData(false);
        }, REFRESH_INTERVAL);

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [fetchData]);

    // Logout
    const handleLogout = () => {
        Cookies.remove('trackpro_token');
        Cookies.remove('trackpro_user');
        router.push('/login');
    };

    // Filter vehicles by search
    const filteredVehicles = vehicles.filter((v) => {
        const q = search.toLowerCase();
        return (
            v.name.toLowerCase().includes(q) ||
            (v.uniqueId && v.uniqueId.toLowerCase().includes(q))
        );
    });

    // Sort: online first, then idle, then offline
    const sortedVehicles = [...filteredVehicles].sort((a, b) => {
        const order = { online: 0, idle: 1, offline: 2 };
        return (order[a.status] || 2) - (order[b.status] || 2);
    });

    // Stats
    const stats = vehicles.reduce(
        (acc, v) => {
            acc[v.status] = (acc[v.status] || 0) + 1;
            acc.total++;
            return acc;
        },
        { online: 0, idle: 0, offline: 0, total: 0 }
    );

    // Focus on vehicle
    const handleVehicleClick = (vehicle) => {
        setSelectedVehicle(vehicle.id === selectedVehicle ? null : vehicle.id);
    };

    // Format relative time
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
            <div className="app-layout">
                <NavBar />
                <div className="page-loader" style={{ minHeight: 'calc(100vh - 56px)' }}>
                    <div className="page-loader-content">
                        <div className="map-loading-spinner" />
                        <p style={{ color: 'var(--gray-400)', fontSize: '0.875rem' }}>Loading dashboard...</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="app-layout">
            <NavBar />
            <div className="dashboard-layout">
                {/* ===== Sidebar ===== */}
                <aside className="sidebar">
                    <div className="sidebar-header">
                        {/* Stats */}
                        <div className="stats-row">
                            <div className="stat-badge stat-badge-online">
                                <span className="stat-badge-count">{stats.online}</span>
                                Online
                            </div>
                            <div className="stat-badge stat-badge-idle">
                                <span className="stat-badge-count">{stats.idle}</span>
                                Idle
                            </div>
                            <div className="stat-badge stat-badge-offline">
                                <span className="stat-badge-count">{stats.offline}</span>
                                Offline
                            </div>
                            <div className="stat-badge stat-badge-total">
                                <span className="stat-badge-count">{stats.total}</span>
                                Total
                            </div>
                        </div>
                    </div>

                    {/* Search */}
                    <div className="search-box">
                        <div className="search-input-wrapper">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="11" cy="11" r="8" />
                                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                            </svg>
                            <input
                                id="vehicle-search"
                                type="text"
                                className="search-input"
                                placeholder="Search vehicles..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Vehicle List */}
                    <div className="vehicle-list">
                        {sortedVehicles.length === 0 ? (
                            <div className="empty-state">
                                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="1" y="3" width="15" height="13" rx="2" />
                                    <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                                    <circle cx="5.5" cy="18.5" r="2.5" />
                                    <circle cx="18.5" cy="18.5" r="2.5" />
                                </svg>
                                <p>{search ? 'No vehicles match your search' : 'No vehicles found'}</p>
                            </div>
                        ) : (
                            sortedVehicles.map((vehicle) => (
                                <div
                                    key={vehicle.id}
                                    id={`vehicle-${vehicle.id}`}
                                    className={`vehicle-card ${selectedVehicle === vehicle.id ? 'active' : ''}`}
                                    onClick={() => handleVehicleClick(vehicle)}
                                >
                                    <div className={`vehicle-icon vehicle-icon-${vehicle.status}`}>
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <rect x="1" y="3" width="15" height="13" rx="2" />
                                            <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                                            <circle cx="5.5" cy="18.5" r="2.5" />
                                            <circle cx="18.5" cy="18.5" r="2.5" />
                                        </svg>
                                    </div>
                                    <div className="vehicle-info">
                                        <div className="vehicle-name">{vehicle.name}</div>
                                        <div className="vehicle-number">{vehicle.uniqueId}</div>
                                        <div className="vehicle-meta">
                                            {vehicle.position && (
                                                <span className="vehicle-speed">
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                                                    </svg>
                                                    {Math.round(vehicle.position.speed * 1.852)} km/h
                                                </span>
                                            )}
                                            <span className="vehicle-time">
                                                {vehicle.position ? formatTimeAgo(vehicle.position.fixTime) : 'No data'}
                                            </span>
                                        </div>
                                    </div>
                                    <div className={`status-dot status-dot-${vehicle.status}`} />
                                </div>
                            ))
                        )}
                    </div>
                </aside>

                {/* ===== Map Area ===== */}
                <main className="map-container">
                    {/* Refresh indicator */}
                    <div className={`refresh-indicator ${refreshing ? 'refreshing' : ''}`}>
                        <div className={`refresh-dot ${refreshing ? 'refreshing' : ''}`} />
                        {refreshing ? 'Updating...' : lastUpdate ? `Last: ${lastUpdate.toLocaleTimeString()}` : 'Loading...'}
                    </div>

                    {/* Map */}
                    <MapComponent
                        vehicles={sortedVehicles}
                        selectedVehicle={selectedVehicle}
                        onVehicleSelect={setSelectedVehicle}
                    />
                </main>

                {/* Error toast */}
                {error && (
                    <div className="error-toast">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                            <line x1="12" y1="9" x2="12" y2="13" />
                            <line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                        {error}
                    </div>
                )}
            </div>
        </div>
    );
}
