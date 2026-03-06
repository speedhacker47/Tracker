'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';
import NavBar from '@/components/NavBar';

export default function VehiclesPage() {
    const router = useRouter();
    const [devices, setDevices] = useState([]);
    const [positions, setPositions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');

    // Get vehicle status from Traccar device status
    const getVehicleStatus = (device, position) => {
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
    };

    useEffect(() => {
        const fetchData = async () => {
            const token = Cookies.get('trackpro_token');
            if (!token) { router.push('/login'); return; }

            try {
                const headers = { Authorization: `Bearer ${token}` };
                const [devRes, posRes] = await Promise.all([
                    fetch('/api/devices', { headers }),
                    fetch('/api/positions', { headers }),
                ]);

                if (devRes.status === 401) { router.push('/login'); return; }

                if (devRes.ok && posRes.ok) {
                    setDevices(await devRes.json());
                    setPositions(await posRes.json());
                }
            } catch (err) {
                console.error('Error:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [router]);

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
            position,
        };
    });

    // Filter
    const filtered = vehicles.filter((v) => {
        const q = search.toLowerCase();
        const matchesSearch =
            v.name.toLowerCase().includes(q) ||
            v.uniqueId.toLowerCase().includes(q);
        const matchesStatus = statusFilter === 'all' || v.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    // Stats
    const stats = vehicles.reduce(
        (acc, v) => { acc[v.status]++; acc.total++; return acc; },
        { online: 0, idle: 0, offline: 0, total: 0 }
    );

    const formatTimeAgo = (dateStr) => {
        if (!dateStr) return '—';
        const diff = (new Date() - new Date(dateStr)) / 1000;
        if (diff < 60) return 'Just now';
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        return `${Math.floor(diff / 86400)}d ago`;
    };

    const statusLabel = { online: 'Online', idle: 'Idle', offline: 'Offline' };

    if (loading) {
        return (
            <div className="app-layout">
                <NavBar />
                <div className="page-loader" style={{ minHeight: 'calc(100vh - 56px)' }}>
                    <div className="page-loader-content">
                        <div className="map-loading-spinner" />
                        <p style={{ color: 'var(--gray-400)', fontSize: '0.875rem' }}>Loading vehicles...</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="app-layout">
            <NavBar />
            <div className="vehicles-page">
                {/* Header */}
                <div className="vehicles-header">
                    <div className="vehicles-header-left">
                        <h1 className="vehicles-title">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="1" y="3" width="15" height="13" rx="2" />
                                <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                                <circle cx="5.5" cy="18.5" r="2.5" />
                                <circle cx="18.5" cy="18.5" r="2.5" />
                            </svg>
                            Vehicles
                        </h1>
                        <span className="vehicles-count">{stats.total} total</span>
                    </div>
                    <div className="vehicles-header-right">
                        {/* Status filter pills */}
                        <div className="status-filter-pills">
                            {[
                                { key: 'all', label: 'All', count: stats.total },
                                { key: 'online', label: 'Online', count: stats.online },
                                { key: 'idle', label: 'Idle', count: stats.idle },
                                { key: 'offline', label: 'Offline', count: stats.offline },
                            ].map((f) => (
                                <button
                                    key={f.key}
                                    className={`status-filter-pill ${statusFilter === f.key ? 'active' : ''} ${f.key !== 'all' ? `pill-${f.key}` : ''}`}
                                    onClick={() => setStatusFilter(f.key)}
                                >
                                    {f.label} <span className="pill-count">{f.count}</span>
                                </button>
                            ))}
                        </div>

                        {/* Search */}
                        <div className="search-input-wrapper" style={{ width: '260px' }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="11" cy="11" r="8" />
                                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                            </svg>
                            <input
                                type="text"
                                className="search-input"
                                placeholder="Search vehicles..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                    </div>
                </div>

                {/* Table */}
                <div className="vehicles-table-wrapper">
                    <table className="vehicles-table">
                        <thead>
                            <tr>
                                <th>Vehicle</th>
                                <th>IMEI / ID</th>
                                <th>Status</th>
                                <th>Speed</th>
                                <th>Last Update</th>
                                <th>Coordinates</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 ? (
                                <tr>
                                    <td colSpan="7" style={{ textAlign: 'center', padding: '3rem', color: 'var(--gray-400)' }}>
                                        {search || statusFilter !== 'all' ? 'No vehicles match your filters' : 'No vehicles found'}
                                    </td>
                                </tr>
                            ) : (
                                filtered.map((v) => (
                                    <tr key={v.id} className="vehicles-row">
                                        <td>
                                            <div className="vehicle-cell-name">
                                                <div className={`vehicle-cell-icon vehicle-icon-${v.status}`}>
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <rect x="1" y="3" width="15" height="13" rx="2" />
                                                        <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                                                        <circle cx="5.5" cy="18.5" r="2.5" />
                                                        <circle cx="18.5" cy="18.5" r="2.5" />
                                                    </svg>
                                                </div>
                                                <span className="vehicle-cell-text">{v.name}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <code className="vehicle-imei">{v.uniqueId}</code>
                                        </td>
                                        <td>
                                            <span className={`table-status-badge badge-${v.status}`}>
                                                <span className={`status-dot status-dot-${v.status}`} style={{ width: 6, height: 6 }} />
                                                {statusLabel[v.status]}
                                            </span>
                                        </td>
                                        <td>
                                            {v.position ? (
                                                <span style={{ fontWeight: 500 }}>
                                                    {Math.round(v.position.speed * 1.852)} km/h
                                                </span>
                                            ) : '—'}
                                        </td>
                                        <td>
                                            <span className="vehicle-time-cell">{formatTimeAgo(v.lastUpdate)}</span>
                                        </td>
                                        <td>
                                            {v.position ? (
                                                <span style={{ fontSize: '0.8125rem', color: 'var(--gray-500)' }}>
                                                    {v.position.latitude.toFixed(4)}, {v.position.longitude.toFixed(4)}
                                                </span>
                                            ) : '—'}
                                        </td>
                                        <td>
                                            <div className="vehicle-actions">
                                                <button
                                                    className="vehicle-action-btn"
                                                    title="View on map"
                                                    onClick={() => router.push('/dashboard')}
                                                >
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z" />
                                                        <path d="M8 2v16" /><path d="M16 6v16" />
                                                    </svg>
                                                </button>
                                                <button
                                                    className="vehicle-action-btn"
                                                    title="View history"
                                                    onClick={() => router.push('/history')}
                                                >
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                                                    </svg>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
