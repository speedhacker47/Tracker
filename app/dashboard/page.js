'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import NavBar from '@/components/NavBar';
import { apiFetch } from '@/lib/api';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, getFirebaseToken } from '@/lib/firebase';

const MapComponent = dynamic(() => import('@/components/Map'), {
    ssr: false,
    loading: () => (
        <div className="map-loading">
            <div className="map-loading-spinner" />
            <span>Loading map...</span>
        </div>
    ),
});

const REFRESH_INTERVAL = 10000; // polling interval in ms
const LS_KEY = 'trackpro_live_mode';

// ── Sub-components ────────────────────────────────────────────────────────────

function IgnitionBadge({ ignition }) {
    if (ignition === null || ignition === undefined) return null;
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.2rem',
            padding: '0.1rem 0.4rem', borderRadius: 'var(--radius-sm)', fontSize: '0.65rem', fontWeight: 500,
            background: ignition ? 'var(--success-50)' : 'var(--gray-100)',
            color: ignition ? 'var(--success-600)' : 'var(--gray-600)',
            border: `1px solid ${ignition ? 'var(--success-100)' : 'var(--gray-200)'}`,
        }}>
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
            {ignition ? 'IGN ON' : 'IGN OFF'}
        </span>
    );
}

function BatteryBadge({ level }) {
    if (level === null || level === undefined) return null;
    const pct = Math.round(level);
    const color = pct > 60 ? 'var(--success-600)' : pct > 20 ? 'var(--warning-600)' : 'var(--danger-600)';
    const bg = pct > 60 ? 'var(--success-50)' : pct > 20 ? 'var(--warning-50)' : 'var(--danger-50)';
    const border = pct > 60 ? 'var(--success-100)' : pct > 20 ? 'var(--warning-100)' : 'var(--danger-100)';
    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', padding: '0.1rem 0.4rem', borderRadius: 'var(--radius-sm)', fontSize: '0.65rem', fontWeight: 500, background: bg, color, border: `1px solid ${border}` }}>
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
            padding: '0.1rem 0.4rem', borderRadius: 'var(--radius-sm)', fontSize: '0.65rem', fontWeight: 500,
            background: 'var(--danger-50)', color: 'var(--danger-600)',
            border: '1px solid var(--danger-100)',
            animation: 'alarm-pulse 1.5s ease-in-out infinite',
        }}>⚠ {labels[alarm] || alarm}</span>
    );
}

function shortAddress(addr) {
    if (!addr) return null;
    const parts = addr.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length <= 2) return parts.join(', ');
    return parts.slice(0, 2).join(', ');
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function DashboardPage() {
    const router = useRouter();

    // ── Core vehicle state ────────────────────────────────────────────────
    const [vehicles, setVehicles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [selectedVehicle, setSelectedVehicle] = useState(null);

    // ── Live mode toggle ──────────────────────────────────────────────────
    // 'poll' = existing 10s polling (default), 'ws' = SSE WebSocket mode
    const [liveMode, setLiveMode] = useState(() => {
        if (typeof window === 'undefined') return 'poll';
        return localStorage.getItem(LS_KEY) || 'poll';
    });
    const [wsStatus, setWsStatus] = useState('disconnected'); // 'connected' | 'reconnecting' | 'error' | 'disconnected'

    // ── Status indicator state ────────────────────────────────────────────
    const [lastPollTime, setLastPollTime] = useState(null);   // Date when last poll completed
    const [pollAgeSeconds, setPollAgeSeconds] = useState(0);  // seconds since last poll

    // ── Refs ──────────────────────────────────────────────────────────────
    const intervalRef = useRef(null);           // polling setInterval handle
    const eventSourceRef = useRef(null);        // SSE EventSource instance
    const pollAgeTimerRef = useRef(null);       // setInterval for the "Polled Xs ago" counter
    const animatorRef = useRef(null);           // VehicleAnimator instance (browser only)
    const vehiclesBaseRef = useRef([]);         // latest vehicle base data (without animated positions)
    const toastTimerRef = useRef(null);

    // ── Lazy-load VehicleAnimator (browser only) ──────────────────────────
    useEffect(() => {
        // Dynamic import so it never runs on the server
        import('@/lib/vehicleAnimator').then(({ VehicleAnimator }) => {
            const animator = new VehicleAnimator((deviceId, animPos) => {
                // Called at 60fps with each device's current smooth position
                setVehicles(prev => {
                    const idx = prev.findIndex(v => v.id === deviceId);
                    if (idx === -1) return prev;

                    const updated = [...prev];
                    updated[idx] = {
                        ...updated[idx],
                        position: {
                            ...updated[idx].position,
                            latitude: animPos.lat,
                            longitude: animPos.lng,
                            // Store bearing so Map.js can rotate the marker SVG
                            bearing: animPos.bearing,
                        },
                    };
                    return updated;
                });
            });
            animatorRef.current = animator;
            animator.start();
        });

        return () => {
            if (animatorRef.current) {
                animatorRef.current.stop();
                animatorRef.current = null;
            }
        };
    }, []);

    // ── Vehicle data helpers (unchanged from original) ────────────────────

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

    /**
     * Feed newly polled/streamed vehicle positions into the animator.
     * The animator will call our setVehicles updateCallback at 60fps.
     */
    const feedPositionsToAnimator = useCallback((mergedVehicles) => {
        if (!animatorRef.current) {
            // Animator not ready yet — set directly (no smoothing for first load)
            setVehicles(mergedVehicles);
            return;
        }

        // Push base data so cards show latest metadata (name, status, badges, etc.)
        // We intentionally set state here to refresh non-position data.
        // The animator will then override the position values per-frame.
        setVehicles(mergedVehicles);
        vehiclesBaseRef.current = mergedVehicles;

        // Tell animator about each vehicle's new real position
        for (const v of mergedVehicles) {
            if (v.position) {
                animatorRef.current.onNewPosition(v.id, {
                    lat: v.position.latitude,
                    lng: v.position.longitude,
                    speed: v.position.speed,      // knots
                    course: v.position.course,    // degrees
                    timestamp: v.position.fixTime
                        ? new Date(v.position.fixTime).getTime()
                        : Date.now(),
                });
            }
        }
    }, []);

    // ── Polling fetch (unchanged logic, same as original) ─────────────────

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
                const merged = mergeVehicleData(devicesData, positionsData);
                feedPositionsToAnimator(merged);
                setLastPollTime(new Date());
                setPollAgeSeconds(0);
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
    }, [router, mergeVehicleData, feedPositionsToAnimator]);

    // ── Poll age counter ──────────────────────────────────────────────────
    useEffect(() => {
        if (pollAgeTimerRef.current) clearInterval(pollAgeTimerRef.current);

        if (liveMode === 'poll' && lastPollTime) {
            pollAgeTimerRef.current = setInterval(() => {
                setPollAgeSeconds(Math.floor((Date.now() - lastPollTime.getTime()) / 1000));
            }, 1000);
        }

        return () => {
            if (pollAgeTimerRef.current) clearInterval(pollAgeTimerRef.current);
        };
    }, [liveMode, lastPollTime]);

    // ── SSE WebSocket mode ────────────────────────────────────────────────

    const startSSE = useCallback(async () => {
        // Clean up any existing SSE connection
        if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
        }

        const token = await getFirebaseToken();
        if (!token) {
            console.error('[SSE] No Firebase token available');
            return;
        }

        const url = `/api/live?token=${encodeURIComponent(token)}`;
        const es = new EventSource(url);
        eventSourceRef.current = es;

        es.onmessage = (event) => {
            let msg;
            try { msg = JSON.parse(event.data); } catch { return; }

            if (msg.type === 'reconnecting') {
                setWsStatus('reconnecting');
                return;
            }
            if (msg.type === 'connected') {
                setWsStatus('connected');
                return;
            }
            if (msg.type === 'no_devices') {
                setWsStatus('connected'); // connected but no devices
                return;
            }
            if (msg.type === 'position') {
                // Feed into animator — it will call setVehicles at 60fps
                if (animatorRef.current) {
                    animatorRef.current.onNewPosition(msg.deviceId, {
                        lat: msg.lat,
                        lng: msg.lng,
                        speed: msg.speed,
                        course: msg.course,
                        timestamp: msg.fixTime ? new Date(msg.fixTime).getTime() : Date.now(),
                    });
                }

                // Also update non-position vehicle data (address, attributes, etc.)
                setVehicles(prev => {
                    const idx = prev.findIndex(v => v.id === msg.deviceId);
                    if (idx === -1) return prev;
                    const updated = [...prev];
                    updated[idx] = {
                        ...updated[idx],
                        position: {
                            ...updated[idx].position,
                            speed: msg.speed,
                            course: msg.course,
                            fixTime: msg.fixTime,
                            address: msg.address || updated[idx].position?.address,
                            serverTime: msg.serverTime,
                        },
                        attrs: {
                            ...updated[idx].attrs,
                            ...(msg.attributes?.ignition !== undefined ? { ignition: msg.attributes.ignition } : {}),
                            ...(msg.attributes?.batteryLevel !== undefined ? { batteryLevel: msg.attributes.batteryLevel } : {}),
                            ...(msg.attributes?.alarm !== undefined ? { alarm: msg.attributes.alarm } : {}),
                        },
                    };
                    return updated;
                });
            }
        };

        es.onerror = () => {
            console.error('[SSE] EventSource error — falling back to polling');
            es.close();
            eventSourceRef.current = null;
            setWsStatus('error');

            // Automatic fallback to polling
            setLiveMode('poll');
            localStorage.setItem(LS_KEY, 'poll');

            // Show error toast
            setError('WebSocket unavailable, switched to polling');
            if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
            toastTimerRef.current = setTimeout(() => setError(''), 5000);
        };
    }, []);

    const stopSSE = useCallback(() => {
        if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
        }
        setWsStatus('disconnected');
    }, []);

    // ── Mode orchestration ────────────────────────────────────────────────
    useEffect(() => {
        if (liveMode === 'poll') {
            // ── Polling mode ───────────────────────────────────────────────
            stopSSE();
            fetchData(true);
            intervalRef.current = setInterval(() => fetchData(false), REFRESH_INTERVAL);
            return () => {
                if (intervalRef.current) clearInterval(intervalRef.current);
            };
        } else {
            // ── WebSocket mode ─────────────────────────────────────────────
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
            setRefreshing(false);

            // Do one initial poll to get device list + base positions
            fetchData(true).then(() => {
                // Then switch to SSE stream
                startSSE();
            });

            return () => {
                stopSSE();
            };
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [liveMode]);

    // ── Toggle handler ────────────────────────────────────────────────────
    const handleToggleMode = useCallback(() => {
        const newMode = liveMode === 'poll' ? 'ws' : 'poll';
        setLiveMode(newMode);
        localStorage.setItem(LS_KEY, newMode);
    }, [liveMode]);

    // ── Derived state ─────────────────────────────────────────────────────

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

    // ── Status indicator text + dot color ─────────────────────────────────
    let statusDotColor = 'var(--success-500)';
    let statusDotAnim = 'none';
    let statusText = '';

    if (liveMode === 'poll') {
        if (refreshing) {
            statusDotColor = 'var(--warning-500)';
            statusDotAnim = 'alarm-pulse 0.8s ease-in-out infinite';
            statusText = 'Updating...';
        } else {
            statusText = lastPollTime
                ? (pollAgeSeconds < 5 ? 'Polled just now' : `Polled ${pollAgeSeconds}s ago`)
                : 'Polling 10s';
        }
    } else {
        // WebSocket mode
        if (wsStatus === 'connected') {
            statusDotColor = '#22c55e';
            statusDotAnim = 'alarm-pulse 2s ease-in-out infinite';
            statusText = 'Live';
        } else if (wsStatus === 'reconnecting') {
            statusDotColor = 'var(--warning-500)';
            statusDotAnim = 'alarm-pulse 0.8s ease-in-out infinite';
            statusText = 'Reconnecting...';
        } else {
            statusDotColor = 'var(--gray-400)';
            statusText = 'Connecting...';
        }
    }

    // ── Loading screen ────────────────────────────────────────────────────
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

    // ── Render ────────────────────────────────────────────────────────────
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
                            { color: 'var(--success-500)', count: stats.online, label: 'Online' },
                            { color: 'var(--warning-500)', count: stats.idle, label: 'Idle' },
                            { color: 'var(--gray-500)', count: stats.offline, label: 'Offline' },
                            { color: 'var(--primary-500)', count: stats.total, label: 'Total' },
                        ].map((s, i) => (
                            <>
                                {i > 0 && <div key={`div-${i}`} className="float-stat-divider" />}
                                <div key={s.label} className="float-stat">
                                    <span className="float-stat-count" style={{ color: s.color }}>{s.count}</span>
                                    <span className="float-stat-label">{s.label}</span>
                                </div>
                            </>
                        ))}
                    </div>

                    {/* Vehicle list card */}
                    <div className="float-vehicles-card">
                        <div className="float-search-row">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--gray-500)', flexShrink: 0 }}>
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

                                                {/* Address line */}
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
                                                        <div style={{ fontSize: '0.6875rem', color: 'var(--gray-500)', marginTop: '0.1rem' }}>No GPS data</div>
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

                {/* ===== Top-right controls: status indicator + mode toggle ===== */}
                <div style={{
                    position: 'absolute', top: '1rem', right: '1rem', zIndex: 1000,
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                }}>
                    {/* Mode toggle button */}
                    <button
                        onClick={handleToggleMode}
                        title={liveMode === 'poll' ? 'Switch to WebSocket live mode' : 'Switch to polling mode'}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                            padding: '0.3rem 0.75rem',
                            borderRadius: 'var(--radius-full)',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            letterSpacing: '0.02em',
                            transition: 'background 0.2s ease, color 0.2s ease, box-shadow 0.2s ease',
                            ...(liveMode === 'ws'
                                ? {
                                    background: 'linear-gradient(135deg, #16a34a, #15803d)',
                                    color: 'white',
                                    boxShadow: '0 0 0 2px #bbf7d0, 0 2px 8px rgba(22,163,74,0.3)',
                                }
                                : {
                                    background: 'var(--gray-100)',
                                    color: 'var(--gray-600)',
                                    boxShadow: 'none',
                                }),
                        }}
                    >
                        {liveMode === 'ws' ? (
                            <>
                                {/* Pulsing live dot */}
                                <span style={{
                                    width: 6, height: 6, borderRadius: '50%',
                                    background: '#86efac',
                                    display: 'inline-block',
                                    animation: 'alarm-pulse 1.5s ease-in-out infinite',
                                }} />
                                Live WebSocket
                            </>
                        ) : (
                            <>
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
                                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                                </svg>
                                Polling 10s
                            </>
                        )}
                    </button>

                    {/* Status indicator pill */}
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '0.375rem',
                        background: 'white', border: '1px solid var(--gray-200)',
                        borderRadius: 'var(--radius-full)', padding: '0.3rem 0.75rem',
                        boxShadow: 'var(--shadow-sm)', fontSize: '0.75rem', color: 'var(--gray-700)',
                    }}>
                        <span style={{
                            width: 7, height: 7, borderRadius: '50%',
                            background: statusDotColor,
                            display: 'inline-block',
                            animation: statusDotAnim,
                        }} />
                        {statusText}
                    </div>
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