'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import NavBar from '@/components/NavBar';
import { apiFetch } from '@/lib/api';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';

function fmtDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
}
function fmtDuration(ms) {
    if (!ms && ms !== 0) return '—';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function fmtDistance(meters) { return meters == null ? '—' : `${(meters / 1000).toFixed(1)} km`; }
function fmtSpeed(knots) { return knots == null ? '—' : `${Math.round(knots * 1.852)} km/h`; }

function StatCard({ label, value }) {
    return (
        <div style={{ background: 'white', border: '1px solid var(--gray-300)', borderRadius: '8px', padding: '16px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--gray-600)', marginBottom: '8px' }}>{label}</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 400, color: 'var(--gray-900)' }}>{value}</div>
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

    const [trips, setTrips] = useState([]);
    const [stops, setStops] = useState([]);
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const today = new Date();
        const str = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        setDateFrom(str); setDateTo(str);

        const load = async () => {
            const user = await new Promise(res => onAuthStateChanged(auth, u => res(u)));
            if (!user) { router.push('/login'); return; }
            try {
                const res = await apiFetch('/api/devices');
                if (res.ok) { const d = await res.json(); setDevices(d); if (d.length > 0) setSelectedDevice(String(d[0].id)); }
            } catch (e) { console.error(e); }
        };
        load();
    }, [router]);

    const runReport = useCallback(async () => {
        if (!selectedDevice || !dateFrom || !dateTo) return;
        setLoading(true); setTrips([]); setStops([]); setSummary(null);
        const qs = new URLSearchParams({ deviceId: selectedDevice, from: new Date(`${dateFrom}T00:00:00`).toISOString(), to: new Date(`${dateTo}T23:59:59`).toISOString() }).toString();
        try {
            const [tRes, sRes, sumRes] = await Promise.all([apiFetch(`/api/reports/trips?${qs}`), apiFetch(`/api/reports/stops?${qs}`), apiFetch(`/api/reports/summary?${qs}`)]);
            if (tRes.ok) setTrips(await tRes.json());
            if (sRes.ok) setStops(await sRes.json());
            if (sumRes.ok) { const d = await sumRes.json(); setSummary(Array.isArray(d) ? d[0] : d); }
        } catch (e) { console.error(e); } finally { setLoading(false); }
    }, [selectedDevice, dateFrom, dateTo]);

    const inputStyle = { height: '36px', padding: '0 12px', fontSize: '0.875rem', border: '1px solid var(--gray-300)', borderRadius: '4px', background: 'white', outline: 'none' };

    return (
        <div className="dashboard-shell">
            <NavBar />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--gray-50)', overflow: 'hidden' }}>
                <div style={{ background: 'white', borderBottom: '1px solid var(--gray-300)', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h1 style={{ fontSize: '1.25rem', fontWeight: 400, color: 'var(--gray-800)', margin: 0 }}>Reports</h1>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <select value={selectedDevice} onChange={e => setSelectedDevice(e.target.value)} style={inputStyle}>
                            <option value="">Select vehicle</option>
                            {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={inputStyle} />
                        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={inputStyle} />
                        <button onClick={runReport} disabled={loading} style={{ padding: '0 16px', background: 'var(--primary-500)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>{loading ? 'Running...' : 'Run Report'}</button>
                    </div>
                </div>

                <div style={{ display: 'flex', padding: '0 24px', borderBottom: '1px solid var(--gray-300)', background: 'white' }}>
                    {['summary', 'trips', 'stops'].map(tab => (
                        <button key={tab} onClick={() => setActiveTab(tab)} style={{ padding: '16px 24px', background: 'transparent', border: 'none', borderBottom: activeTab === tab ? '2px solid var(--primary-500)' : '2px solid transparent', color: activeTab === tab ? 'var(--primary-600)' : 'var(--gray-600)', fontWeight: 500, cursor: 'pointer', textTransform: 'capitalize' }}>{tab}</button>
                    ))}
                </div>

                <div style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
                    {!summary && !loading && <div style={{ textAlign: 'center', marginTop: '48px', color: 'var(--gray-500)' }}>Select criteria and run report.</div>}

                    {activeTab === 'summary' && summary && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
                            <StatCard label="Total Distance" value={fmtDistance(summary.distance)} />
                            <StatCard label="Average Speed" value={fmtSpeed(summary.averageSpeed)} />
                            <StatCard label="Max Speed" value={fmtSpeed(summary.maxSpeed)} />
                            <StatCard label="Engine Hours" value={fmtDuration(summary.engineHours)} />
                            <StatCard label="Fuel Consumed" value={summary.fuelConsumed ? `${summary.fuelConsumed.toFixed(2)} L` : '—'} />
                        </div>
                    )}

                    {activeTab === 'trips' && trips.length > 0 && (
                        <div style={{ background: 'white', border: '1px solid var(--gray-300)', borderRadius: '8px', overflow: 'hidden' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                <thead><tr style={{ borderBottom: '1px solid var(--gray-300)', background: 'var(--gray-50)' }}><th style={{ padding: '12px 16px', fontSize: '0.75rem', color: 'var(--gray-600)' }}>Start</th><th style={{ padding: '12px 16px', fontSize: '0.75rem', color: 'var(--gray-600)' }}>End</th><th style={{ padding: '12px 16px', fontSize: '0.75rem', color: 'var(--gray-600)' }}>Distance</th><th style={{ padding: '12px 16px', fontSize: '0.75rem', color: 'var(--gray-600)' }}>Duration</th></tr></thead>
                                <tbody>{trips.map((t, i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid var(--gray-200)' }}><td style={{ padding: '12px 16px', fontSize: '0.875rem' }}>{fmtDate(t.startTime)}<br /><span style={{ color: 'var(--gray-500)', fontSize: '0.75rem' }}>{t.startAddress}</span></td><td style={{ padding: '12px 16px', fontSize: '0.875rem' }}>{fmtDate(t.endTime)}<br /><span style={{ color: 'var(--gray-500)', fontSize: '0.75rem' }}>{t.endAddress}</span></td><td style={{ padding: '12px 16px', fontSize: '0.875rem' }}>{fmtDistance(t.distance)}</td><td style={{ padding: '12px 16px', fontSize: '0.875rem' }}>{fmtDuration(t.duration)}</td></tr>
                                ))}</tbody>
                            </table>
                        </div>
                    )}

                    {activeTab === 'stops' && stops.length > 0 && (
                        <div style={{ background: 'white', border: '1px solid var(--gray-300)', borderRadius: '8px', overflow: 'hidden' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                <thead><tr style={{ borderBottom: '1px solid var(--gray-300)', background: 'var(--gray-50)' }}><th style={{ padding: '12px 16px', fontSize: '0.75rem', color: 'var(--gray-600)' }}>Location</th><th style={{ padding: '12px 16px', fontSize: '0.75rem', color: 'var(--gray-600)' }}>Arrived</th><th style={{ padding: '12px 16px', fontSize: '0.75rem', color: 'var(--gray-600)' }}>Departed</th><th style={{ padding: '12px 16px', fontSize: '0.75rem', color: 'var(--gray-600)' }}>Duration</th></tr></thead>
                                <tbody>{stops.map((s, i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid var(--gray-200)' }}><td style={{ padding: '12px 16px', fontSize: '0.875rem' }}>{s.address || `${s.latitude}, ${s.longitude}`}</td><td style={{ padding: '12px 16px', fontSize: '0.875rem' }}>{fmtDate(s.startTime)}</td><td style={{ padding: '12px 16px', fontSize: '0.875rem' }}>{fmtDate(s.endTime)}</td><td style={{ padding: '12px 16px', fontSize: '0.875rem' }}>{fmtDuration(s.duration)}</td></tr>
                                ))}</tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}