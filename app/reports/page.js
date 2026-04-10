'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import NavBar from '@/components/NavBar';
import { apiFetch } from '@/lib/api';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';

function fmtDate(value) {
    if (!value) return '-';
    return new Date(value).toLocaleString('en-IN', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
    });
}

function fmtMinutes(minutes) {
    if (minutes == null) return '-';
    if (minutes < 60) return `${minutes}m`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h ${m}m`;
}

function fmtDurationMs(ms) {
    if (ms == null) return '-';
    return fmtMinutes(Math.round(ms / 60000));
}

function fmtDistanceKm(value) {
    if (value == null) return '-';
    return `${Number(value).toFixed(1)} km`;
}

function fmtDistanceMeters(value) {
    if (value == null) return '-';
    return `${(value / 1000).toFixed(1)} km`;
}

function fmtSpeedKmh(value) {
    if (value == null) return '-';
    return `${Math.round(value)} km/h`;
}

function fmtSpeedKnots(value) {
    if (value == null) return '-';
    return `${Math.round(value * 1.852)} km/h`;
}

function fmtFuel(value) {
    if (value == null) return '-';
    return `${Number(value).toFixed(1)} L`;
}

function Card({ title, subtitle, children }) {
    return (
        <div style={{
            background: 'white',
            border: '1px solid var(--gray-200)',
            borderRadius: 'var(--radius-xl)',
            overflow: 'hidden',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}>
            {(title || subtitle) && (
                <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--gray-100)', background: 'var(--gray-50)' }}>
                    {title && <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--gray-800)' }}>{title}</div>}
                    {subtitle && <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)', marginTop: '0.2rem' }}>{subtitle}</div>}
                </div>
            )}
            {children}
        </div>
    );
}

function StatCard({ label, value, sub }) {
    return (
        <div style={{
            background: 'white',
            border: '1px solid var(--gray-200)',
            borderRadius: 'var(--radius-md)',
            padding: '1rem 1.1rem',
        }}>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--gray-800)' }}>{value}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--gray-600)', marginTop: '0.25rem' }}>{label}</div>
            {sub && <div style={{ fontSize: '0.72rem', color: 'var(--gray-500)', marginTop: '0.15rem' }}>{sub}</div>}
        </div>
    );
}

function Row({ label, value, last = false }) {
    return (
        <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: '1rem',
            padding: '0.85rem 1.25rem',
            borderBottom: last ? 'none' : '1px solid var(--gray-200)',
        }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--gray-600)' }}>{label}</span>
            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--gray-800)', textAlign: 'right' }}>{value}</span>
        </div>
    );
}

function EmptyState({ title, subtitle }) {
    return (
        <div style={{
            background: 'var(--gray-50)',
            border: '1px solid var(--gray-200)',
            borderRadius: 'var(--radius-md)',
            padding: '3rem 1.5rem',
            textAlign: 'center',
            color: 'var(--gray-500)',
        }}>
            <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--gray-600)' }}>{title}</div>
            {subtitle && <div style={{ fontSize: '0.82rem', marginTop: '0.4rem' }}>{subtitle}</div>}
        </div>
    );
}

export default function ReportsPage() {
    const router = useRouter();
    const [devices, setDevices] = useState([]);
    const [selectedDevice, setSelectedDevice] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [activeTab, setActiveTab] = useState('summary');
    const [devicesLoading, setDevicesLoading] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [warning, setWarning] = useState('');
    const [hasSearched, setHasSearched] = useState(false);
    const [report, setReport] = useState(null);

    useEffect(() => {
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        setDateFrom(`${yyyy}-${mm}-${dd}`);
        setDateTo(`${yyyy}-${mm}-${dd}`);
    }, []);

    useEffect(() => {
        const loadDevices = async () => {
            const user = await new Promise((resolve) => {
                const unsub = onAuthStateChanged(auth, (currentUser) => {
                    unsub();
                    resolve(currentUser);
                });
            });

            if (!user) {
                router.push('/login');
                return;
            }

            try {
                const res = await apiFetch('/api/devices');
                if (res.status === 401) {
                    router.push('/login');
                    return;
                }
                if (res.ok) {
                    const data = await res.json();
                    setDevices(data);
                    if (data.length > 0) setSelectedDevice(String(data[0].id));
                }
            } catch (fetchError) {
                console.error(fetchError);
            } finally {
                setDevicesLoading(false);
            }
        };

        loadDevices();
    }, [router]);

    const runReport = useCallback(async () => {
        if (!selectedDevice || !dateFrom || !dateTo) return;

        const start = new Date(`${dateFrom}T00:00:00`);
        const end = new Date(`${dateTo}T23:59:59`);
        setHasSearched(true);
        setError('');
        setWarning('');
        setReport(null);

        if (end < start) {
            setError('The end date must be after the start date.');
            return;
        }

        setLoading(true);
        try {
            const params = new URLSearchParams({
                deviceId: selectedDevice,
                from: start.toISOString(),
                to: end.toISOString(),
                includeEvents: 'true',
            });
            const res = await apiFetch(`/api/reports/detailed?${params.toString()}`);
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(data.error || 'Failed to generate report.');
                return;
            }
            setReport(data);
            if (data.partial) setWarning('Some sections could not be loaded, but the available report data is shown below.');
            else if (!data.hasAnyData) setWarning('No report data was found for the selected date range.');
        } catch {
            setError('Failed to load reports. Check your connection and try again.');
        } finally {
            setLoading(false);
        }
    }, [selectedDevice, dateFrom, dateTo]);

    const selectedVehicle = devices.find((device) => String(device.id) === selectedDevice);
    const summary = report?.summary || null;
    const trips = report?.sections?.trips || [];
    const stops = report?.sections?.stops || [];
    const events = report?.sections?.events || [];
    const sectionErrors = report?.errors || {};
    const tabs = [
        { key: 'summary', label: 'Summary' },
        { key: 'trips', label: `Trips (${trips.length})` },
        { key: 'stops', label: `Stops (${stops.length})` },
        { key: 'events', label: `Events (${events.length})` },
    ];

    return (
        <div className="dashboard-shell">
            <NavBar />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--gray-50)' }}>
                <div style={{
                    background: 'white',
                    borderBottom: '1px solid var(--gray-200)',
                    padding: '0 1.75rem',
                    minHeight: 64,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '1rem',
                    flexWrap: 'wrap',
                }}>
                    <div>
                        <h1 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--gray-800)', margin: 0 }}>Reports</h1>
                        <div style={{ fontSize: '0.8rem', color: 'var(--gray-500)', marginTop: '0.2rem' }}>Detailed report for the selected date range</div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexWrap: 'wrap' }}>
                        {devicesLoading ? (
                            <div style={{ width: 180, height: 36, background: 'var(--gray-100)', borderRadius: 'var(--radius-md)' }} />
                        ) : (
                            <select value={selectedDevice} onChange={(event) => setSelectedDevice(event.target.value)} style={{ height: 36, padding: '0 0.75rem', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', background: 'white' }}>
                                {devices.map((device) => <option key={device.id} value={String(device.id)}>{device.name}</option>)}
                            </select>
                        )}
                        <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} style={{ height: 36, padding: '0 0.625rem', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', background: 'white' }} />
                        <span style={{ fontSize: '0.8rem', color: 'var(--gray-400)' }}>to</span>
                        <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} style={{ height: 36, padding: '0 0.625rem', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', background: 'white' }} />
                        <button onClick={runReport} disabled={loading || !selectedDevice || devicesLoading} style={{ height: 36, padding: '0 1rem', border: 'none', borderRadius: 'var(--radius-sm)', background: loading ? 'var(--gray-200)' : 'var(--primary-500)', color: loading ? 'var(--gray-500)' : 'white', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer' }}>
                            {loading ? 'Generating...' : 'Generate Report'}
                        </button>
                    </div>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem 1.75rem' }}>
                    {error && <div style={{ marginBottom: '1rem', padding: '0.875rem 1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--radius-lg)', color: '#b91c1c', fontSize: '0.875rem', fontWeight: 500 }}>{error}</div>}
                    {warning && !error && <div style={{ marginBottom: '1rem', padding: '0.875rem 1rem', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 'var(--radius-lg)', color: '#92400e', fontSize: '0.875rem', fontWeight: 500 }}>{warning}</div>}

                    {!hasSearched && <EmptyState title="Select a vehicle and date range" subtitle="Then click Generate Report to load a detailed report." />}

                    {hasSearched && !loading && summary && (
                        <>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '0.875rem', marginBottom: '1.5rem' }}>
                                <StatCard label="Total Distance" value={fmtDistanceKm(summary.totalDistanceKm)} sub={`${summary.tripCount} trips`} />
                                <StatCard label="Drive Time" value={fmtMinutes(summary.totalDriveMinutes)} sub={`${summary.stopCount} stops`} />
                                <StatCard label="Max Speed" value={fmtSpeedKmh(summary.maxSpeedKmh)} sub={`Avg ${fmtSpeedKmh(summary.averageSpeedKmh)}`} />
                                <StatCard label="Stopped Time" value={fmtMinutes(summary.totalStoppedMinutes)} sub={`Longest ${fmtMinutes(summary.longestStopMinutes)}`} />
                                <StatCard label="Events" value={summary.eventCount} sub={`${summary.alarmCount} alarms`} />
                                <StatCard label="Fuel / Engine" value={fmtFuel(summary.fuelConsumed)} sub={fmtMinutes(summary.engineHoursMinutes)} />
                            </div>

                            <div style={{ display: 'flex', gap: 0, marginBottom: '1.25rem', borderBottom: '1px solid var(--gray-200)' }}>
                                {tabs.map((tab) => (
                                    <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{ padding: '8px 16px', fontSize: '0.8125rem', fontWeight: activeTab === tab.key ? 600 : 400, border: 'none', background: 'transparent', color: activeTab === tab.key ? 'var(--primary-500)' : 'var(--gray-700)', borderBottom: activeTab === tab.key ? '2px solid var(--primary-500)' : '2px solid transparent', cursor: 'pointer', marginBottom: -1 }}>
                                        {tab.label}
                                    </button>
                                ))}
                            </div>

                            {activeTab === 'summary' && (
                                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 620px) minmax(260px, 360px)', gap: '1rem', alignItems: 'start' }}>
                                    <Card title={`${selectedVehicle?.name || 'Vehicle'} report`} subtitle={`${dateFrom} to ${dateTo}`}>
                                        <Row label="Vehicle" value={selectedVehicle?.name || '-'} />
                                        <Row label="Date Range" value={`${dateFrom} to ${dateTo}`} />
                                        <Row label="Total Distance" value={fmtDistanceKm(summary.totalDistanceKm)} />
                                        <Row label="Total Trips" value={summary.tripCount} />
                                        <Row label="Total Stops" value={summary.stopCount} />
                                        <Row label="Drive Time" value={fmtMinutes(summary.totalDriveMinutes)} />
                                        <Row label="Stopped Time" value={fmtMinutes(summary.totalStoppedMinutes)} />
                                        <Row label="Average Trip Distance" value={fmtDistanceKm(summary.avgTripDistanceKm)} />
                                        <Row label="Average Stop Duration" value={fmtMinutes(summary.avgStopMinutes)} />
                                        <Row label="Longest Stop" value={fmtMinutes(summary.longestStopMinutes)} />
                                        <Row label="Maximum Speed" value={fmtSpeedKmh(summary.maxSpeedKmh)} />
                                        <Row label="Average Speed" value={fmtSpeedKmh(summary.averageSpeedKmh)} />
                                        <Row label="Engine Hours" value={fmtMinutes(summary.engineHoursMinutes)} />
                                        <Row label="Fuel Consumed" value={fmtFuel(summary.fuelConsumed)} last />
                                    </Card>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                        <Card title="Event Breakdown">
                                            <Row label="Total Events" value={summary.eventCount} />
                                            <Row label="Alarms" value={summary.alarmCount} />
                                            <Row label="Overspeed" value={summary.overspeedCount} />
                                            <Row label="Geofence Events" value={summary.geofenceCount} />
                                            <Row label="Ignition On" value={summary.ignitionOnCount} />
                                            <Row label="Ignition Off" value={summary.ignitionOffCount} last />
                                        </Card>

                                        <Card title="Section Status">
                                            {Object.keys(sectionErrors).length === 0 ? (
                                                <div style={{ padding: '1rem 1.25rem', fontSize: '0.82rem', color: '#15803d' }}>All report sections loaded successfully.</div>
                                            ) : (
                                                Object.entries(sectionErrors).map(([section, message], index, array) => (
                                                    <Row key={section} label={section} value={message} last={index === array.length - 1} />
                                                ))
                                            )}
                                        </Card>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'trips' && (
                                trips.length === 0 ? <EmptyState title="No trips recorded" subtitle="The vehicle may not have moved during this period." /> : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                                        {trips.map((trip, index) => (
                                            <Card key={index}>
                                                <div style={{ padding: '1rem 1.25rem', display: 'grid', gridTemplateColumns: '2.2rem minmax(0, 1fr) 0.8fr 0.8fr 0.8fr', gap: '1rem', alignItems: 'center' }}>
                                                    <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(135deg, #7c3aed, #a855f7)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700 }}>{index + 1}</div>
                                                    <div style={{ minWidth: 0 }}>
                                                        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--gray-700)' }}>{trip.startAddress || 'Unknown start'}</div>
                                                        <div style={{ fontSize: '0.82rem', color: 'var(--gray-500)', marginTop: '0.15rem' }}>{trip.endAddress || 'Unknown destination'}</div>
                                                        <div style={{ fontSize: '0.74rem', color: 'var(--gray-400)', marginTop: '0.35rem' }}>{fmtDate(trip.startTime)} to {fmtDate(trip.endTime)}</div>
                                                    </div>
                                                    <div style={{ textAlign: 'center' }}><div style={{ fontSize: '0.68rem', color: 'var(--gray-400)' }}>Distance</div><div style={{ fontWeight: 700, color: '#7c3aed' }}>{fmtDistanceMeters(trip.distance)}</div></div>
                                                    <div style={{ textAlign: 'center' }}><div style={{ fontSize: '0.68rem', color: 'var(--gray-400)' }}>Duration</div><div style={{ fontWeight: 700, color: 'var(--gray-800)' }}>{fmtDurationMs(trip.duration)}</div></div>
                                                    <div style={{ textAlign: 'center' }}><div style={{ fontSize: '0.68rem', color: 'var(--gray-400)' }}>Max Speed</div><div style={{ fontWeight: 700, color: '#2563eb' }}>{fmtSpeedKnots(trip.maxSpeed)}</div></div>
                                                </div>
                                            </Card>
                                        ))}
                                    </div>
                                )
                            )}

                            {activeTab === 'stops' && (
                                stops.length === 0 ? <EmptyState title="No stops recorded" subtitle="No parking or idle stop was found in this date range." /> : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                                        {stops.map((stop, index) => (
                                            <Card key={index}>
                                                <div style={{ padding: '1rem 1.25rem', display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) 0.8fr 0.8fr 0.5fr', gap: '1rem', alignItems: 'center' }}>
                                                    <div><div style={{ fontSize: '0.72rem', color: 'var(--gray-400)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Stop {index + 1}</div><div style={{ fontSize: '0.85rem', color: 'var(--gray-700)', fontWeight: 500 }}>{stop.address || `${stop.latitude?.toFixed(5)}, ${stop.longitude?.toFixed(5)}`}</div></div>
                                                    <div><div style={{ fontSize: '0.68rem', color: 'var(--gray-400)' }}>Arrived</div><div style={{ fontSize: '0.84rem', fontWeight: 500, color: 'var(--gray-700)' }}>{fmtDate(stop.startTime)}</div></div>
                                                    <div><div style={{ fontSize: '0.68rem', color: 'var(--gray-400)' }}>Departed</div><div style={{ fontSize: '0.84rem', fontWeight: 500, color: 'var(--gray-700)' }}>{fmtDate(stop.endTime)}</div></div>
                                                    <div style={{ textAlign: 'center' }}><div style={{ display: 'inline-block', padding: '0.35rem 0.75rem', borderRadius: 'var(--radius-full)', background: '#dcfce7', color: '#15803d', fontWeight: 700 }}>{fmtDurationMs(stop.duration)}</div></div>
                                                </div>
                                            </Card>
                                        ))}
                                    </div>
                                )
                            )}

                            {activeTab === 'events' && (
                                events.length === 0 ? <EmptyState title="No events recorded" subtitle="No alerts or device events were found for this period." /> : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                                        {events.map((event, index) => (
                                            <Card key={event.id || index}>
                                                <div style={{ padding: '0.9rem 1.25rem', display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                                                    <div style={{ minWidth: 0 }}>
                                                        <div style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--gray-800)' }}>{event.type === 'alarm' ? `Alarm${event.attributes?.alarm ? `: ${event.attributes.alarm}` : ''}` : event.type}</div>
                                                        <div style={{ fontSize: '0.74rem', color: 'var(--gray-500)', marginTop: '0.2rem' }}>{fmtDate(event.eventTime)}</div>
                                                        {event.attributes && Object.keys(event.attributes).length > 0 && (
                                                            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                                                                {Object.entries(event.attributes).slice(0, 6).map(([key, value]) => (
                                                                    <span key={key} style={{ padding: '0.15rem 0.45rem', background: 'var(--gray-50)', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-sm)', fontSize: '0.68rem', color: 'var(--gray-600)' }}>{key}: {String(value)}</span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div style={{ flexShrink: 0, fontSize: '0.74rem', color: 'var(--gray-400)' }}>#{events.length - index}</div>
                                                </div>
                                            </Card>
                                        ))}
                                    </div>
                                )
                            )}
                        </>
                    )}

                    {hasSearched && !loading && !summary && !error && <EmptyState title="No report available" subtitle="Try another vehicle or a wider date range." />}
                </div>
            </div>
        </div>
    );
}
