'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { apiFetch } from '@/lib/api';
import NavBar from '@/components/NavBar';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtDateTime(d) {
    if (!d) return '—';
    return new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true });
}
function timeAgo(d) {
    if (!d) return '—';
    const diff = (new Date() - new Date(d)) / 1000;
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color, icon }) {
    return (
        <div style={{ background: 'white', border: '1px solid var(--gray-200)', borderRadius: 14, padding: '1.125rem 1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.625rem' }}>
                <div style={{ width: 36, height: 36, borderRadius: 9, background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.125rem' }}>{icon}</div>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--gray-400)' }}>{label}</span>
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--gray-900)', lineHeight: 1, letterSpacing: '-0.03em' }}>{value}</div>
            {sub && <div style={{ fontSize: '0.75rem', color: 'var(--gray-400)', marginTop: '0.375rem' }}>{sub}</div>}
        </div>
    );
}

// ── Status badge ──────────────────────────────────────────────────────────────

function DeviceStatusBadge({ status }) {
    const c = { active: { bg: '#dcfce7', color: '#15803d' }, unclaimed: { bg: '#dbeafe', color: '#1d4ed8' }, suspended: { bg: '#fef3c7', color: '#b45309' }, decommissioned: { bg: '#fee2e2', color: '#b91c1c' } }[status] || { bg: '#f3f4f6', color: '#6b7280' };
    return <span style={{ padding: '0.2rem 0.625rem', borderRadius: '999px', background: c.bg, color: c.color, fontSize: '0.75rem', fontWeight: 700 }}>{status}</span>;
}

// ── Add devices modal ─────────────────────────────────────────────────────────

function AddDevicesModal({ onClose, onSuccess }) {
    const [text, setText] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');

    const handleSubmit = async () => {
        setError('');
        const lines = text.trim().split('\n').filter(l => l.trim());
        if (lines.length === 0) { setError('Enter at least one device'); return; }

        const devices = [];
        for (const line of lines) {
            const parts = line.split(',').map(p => p.trim());
            const [imei, traccarId, simNumber, deviceModel] = parts;
            if (!imei || !traccarId) { setError(`Invalid line: "${line}" — format is IMEI,TraccarID`); return; }
            devices.push({ imei, traccarId: parseInt(traccarId), simNumber, deviceModel });
        }

        setLoading(true);
        try {
            const res = await apiFetch('/api/admin/devices', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ devices }),
            });
            const data = await res.json();
            if (res.ok) { setResult(data); onSuccess(); }
            else setError(data.error || 'Failed to add devices');
        } catch (_) { setError('Connection error'); }
        finally { setLoading(false); }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
            <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 560, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
                <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--gray-100)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--gray-900)' }}>Bulk Add Devices</span>
                    <button onClick={onClose} style={{ width: 28, height: 28, border: '1px solid var(--gray-200)', borderRadius: '50%', background: 'var(--gray-50)', cursor: 'pointer', color: 'var(--gray-400)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                </div>
                <div style={{ padding: '1.25rem 1.5rem' }}>
                    {result ? (
                        <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>✅</div>
                            <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>Done! {result.inserted} devices added</div>
                            {result.skipped > 0 && <div style={{ color: 'var(--gray-500)', fontSize: '0.875rem' }}>{result.skipped} skipped (duplicates)</div>}
                            {result.errors?.length > 0 && <div style={{ color: '#b91c1c', fontSize: '0.8125rem', marginTop: '0.5rem' }}>{result.errors.length} errors</div>}
                            <button onClick={onClose} style={{ marginTop: '1rem', height: 38, padding: '0 1.5rem', background: '#16a34a', color: 'white', border: 'none', borderRadius: 8, fontSize: '0.875rem', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>Done</button>
                        </div>
                    ) : (
                        <>
                            <div style={{ fontSize: '0.8125rem', color: 'var(--gray-500)', marginBottom: '0.75rem' }}>
                                One device per line. Format: <code style={{ background: 'var(--gray-100)', padding: '0.1rem 0.375rem', borderRadius: 4 }}>IMEI,TraccarID,SIM,Model</code><br />
                                Only IMEI and TraccarID are required.
                            </div>
                            {error && <div style={{ padding: '0.625rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#b91c1c', fontSize: '0.8125rem', marginBottom: '0.75rem' }}>⚠ {error}</div>}
                            <textarea
                                value={text}
                                onChange={e => setText(e.target.value)}
                                placeholder={'867440064734387,1,9876543210,GT06\n867440064734388,2,,Concox'}
                                rows={8}
                                style={{ width: '100%', padding: '0.75rem', fontSize: '0.8125rem', fontFamily: 'monospace', border: '1.5px solid var(--gray-200)', borderRadius: 8, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
                            />
                            <div style={{ display: 'flex', gap: '0.625rem', marginTop: '1rem', justifyContent: 'flex-end' }}>
                                <button onClick={onClose} style={{ height: 38, padding: '0 1rem', border: '1px solid var(--gray-200)', borderRadius: 8, background: 'white', color: 'var(--gray-600)', fontSize: '0.875rem', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>Cancel</button>
                                <button onClick={handleSubmit} disabled={loading} style={{ height: 38, padding: '0 1.25rem', background: loading ? 'var(--gray-200)' : 'linear-gradient(135deg, #1e3a5f, #2563eb)', color: loading ? 'var(--gray-400)' : 'white', border: 'none', borderRadius: 8, fontSize: '0.875rem', fontWeight: 700, fontFamily: 'inherit', cursor: loading ? 'not-allowed' : 'pointer' }}>
                                    {loading ? 'Adding…' : 'Add Devices'}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdminPage() {
    const router = useRouter();
    const [authReady, setAuthReady] = useState(false);

    const [stats, setStats] = useState(null);
    const [users, setUsers] = useState([]);
    const [devices, setDevices] = useState([]);
    const [usersTotal, setUsersTotal] = useState(0);
    const [devicesTotal, setDevicesTotal] = useState(0);

    const [activeTab, setActiveTab] = useState('overview');
    const [usersSearch, setUsersSearch] = useState('');
    const [devicesSearch, setDevicesSearch] = useState('');
    const [devicesFilter, setDevicesFilter] = useState('all');
    const [showAddDevices, setShowAddDevices] = useState(false);
    const [loading, setLoading] = useState(true);

    // Check admin access
    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async u => {
            if (!u) { router.push('/login'); return; }
            // Quick check — the API will enforce properly
            setAuthReady(true);
        });
        return () => unsub();
    }, [router]);

    const fetchStats = useCallback(async () => {
        try {
            const res = await apiFetch('/api/admin/stats');
            if (res.status === 403) { router.push('/dashboard'); return; }
            if (res.ok) setStats(await res.json());
        } catch (_) { }
    }, [router]);

    const fetchUsers = useCallback(async (search = '') => {
        try {
            const res = await apiFetch(`/api/admin/users?search=${encodeURIComponent(search)}&limit=50`);
            if (res.ok) {
                const data = await res.json();
                setUsers(data.users);
                setUsersTotal(data.total);
            }
        } catch (_) { }
    }, []);

    const fetchDevices = useCallback(async (search = '', status = 'all') => {
        try {
            const res = await apiFetch(`/api/admin/devices?search=${encodeURIComponent(search)}&status=${status}&limit=50`);
            if (res.ok) {
                const data = await res.json();
                setDevices(data.devices);
                setDevicesTotal(data.total);
            }
        } catch (_) { }
    }, []);

    useEffect(() => {
        if (!authReady) return;
        const loadAll = async () => {
            setLoading(true);
            await Promise.all([fetchStats(), fetchUsers(), fetchDevices()]);
            setLoading(false);
        };
        loadAll();
    }, [authReady, fetchStats, fetchUsers, fetchDevices]);

    // Search debounce
    useEffect(() => {
        const t = setTimeout(() => fetchUsers(usersSearch), 400);
        return () => clearTimeout(t);
    }, [usersSearch, fetchUsers]);

    useEffect(() => {
        const t = setTimeout(() => fetchDevices(devicesSearch, devicesFilter), 400);
        return () => clearTimeout(t);
    }, [devicesSearch, devicesFilter, fetchDevices]);

    const handleSuspendUser = async (uid, isSuspended) => {
        await apiFetch(`/api/admin/users/${uid}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_suspended: !isSuspended }),
        });
        fetchUsers(usersSearch);
    };

    const handleDeviceStatus = async (id, status) => {
        await apiFetch(`/api/admin/devices/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status }),
        });
        fetchDevices(devicesSearch, devicesFilter);
        fetchStats();
    };

    const tabStyle = (active) => ({
        padding: '0.625rem 1.125rem', fontSize: '0.875rem', fontWeight: active ? 700 : 500,
        color: active ? 'var(--primary-600)' : 'var(--gray-500)',
        borderBottom: active ? '2px solid var(--primary-500)' : '2px solid transparent',
        background: 'transparent', border: 'none',
        borderBottom: active ? '2px solid var(--primary-500)' : '2px solid transparent',
        cursor: 'pointer', fontFamily: 'inherit',
    });

    const searchInp = {
        height: 36, padding: '0 0.75rem 0 2.25rem', fontSize: '0.875rem', fontFamily: 'inherit',
        border: '1px solid var(--gray-200)', borderRadius: 8, background: 'white', color: 'var(--gray-700)',
        outline: 'none', width: 220,
    };

    if (!authReady || loading) {
        return (
            <div className="dashboard-shell">
                <NavBar />
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="map-loading-spinner" style={{ width: 32, height: 32 }} />
                </div>
            </div>
        );
    }

    return (
        <div className="dashboard-shell">
            <NavBar />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--gray-50)' }}>

                {/* Header */}
                <div style={{ background: 'white', borderBottom: '1px solid var(--gray-200)', padding: '0 1.5rem', minHeight: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
                        <div style={{ width: 38, height: 38, borderRadius: 'var(--radius-md)', background: 'linear-gradient(135deg, #1e3a5f, #7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ fontSize: '1.125rem' }}>🛡</span>
                        </div>
                        <div>
                            <h1 style={{ fontSize: '1.0625rem', fontWeight: 700, color: 'var(--gray-900)' }}>Master Admin</h1>
                            <p style={{ fontSize: '0.75rem', color: 'var(--gray-400)' }}>TrackPro fleet management</p>
                        </div>
                    </div>
                    <button onClick={() => { setShowAddDevices(true); }} style={{ height: 36, padding: '0 1rem', background: 'linear-gradient(135deg, #1e3a5f, #2563eb)', color: 'white', border: 'none', borderRadius: 8, fontSize: '0.8125rem', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                        <span style={{ fontSize: '1rem' }}>+</span> Add Devices
                    </button>
                </div>

                {/* Tabs */}
                <div style={{ background: 'white', borderBottom: '1px solid var(--gray-200)', padding: '0 1.5rem', display: 'flex', gap: 0, flexShrink: 0 }}>
                    {[{ key: 'overview', label: '📊 Overview' }, { key: 'users', label: `👥 Users (${usersTotal})` }, { key: 'devices', label: `📡 Devices (${devicesTotal})` }].map(t => (
                        <button key={t.key} style={tabStyle(activeTab === t.key)} onClick={() => setActiveTab(t.key)}>{t.label}</button>
                    ))}
                </div>

                {/* Body */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem' }}>

                    {/* ── OVERVIEW ── */}
                    {activeTab === 'overview' && stats && (
                        <div style={{ maxWidth: 1000, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.875rem' }}>
                                <StatCard label="Total Users" value={stats.users.total} icon="👥" color="#2563eb" sub={`+${stats.users.newToday} today · +${stats.users.newThisWeek} this week`} />
                                <StatCard label="Total Devices" value={stats.devices.total} icon="📡" color="#7c3aed" sub={`${stats.devices.active} active`} />
                                <StatCard label="Online Now" value={stats.devices.onlineNow} icon="🟢" color="#16a34a" sub="GPS active last 5min" />
                                <StatCard label="Unclaimed" value={stats.devices.unclaimed} icon="📦" color="#d97706" sub="Ready to be claimed" />
                                <StatCard label="Suspended" value={stats.devices.suspended} icon="⛔" color="#dc2626" sub="Inactive devices" />
                            </div>

                            {/* Recent users */}
                            <div style={{ background: 'white', border: '1px solid var(--gray-200)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                                <div style={{ padding: '0.875rem 1.125rem', background: 'var(--gray-50)', borderBottom: '1px solid var(--gray-100)', fontSize: '0.8125rem', fontWeight: 700, color: 'var(--gray-700)' }}>Recent Signups</div>
                                {users.slice(0, 8).map((u, i) => (
                                    <div key={u.firebase_uid} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem 1.125rem', borderBottom: i < 7 ? '1px solid var(--gray-100)' : 'none' }}>
                                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, #1e3a5f, #2563eb)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '0.8125rem', fontWeight: 700, flexShrink: 0 }}>
                                            {(u.name || u.phone || u.email || '?').charAt(0).toUpperCase()}
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--gray-900)' }}>{u.name || u.phone || u.email || u.firebase_uid.slice(0, 12) + '…'}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--gray-400)' }}>{u.phone || u.email || '—'} · {u.device_count} device{u.device_count !== 1 ? 's' : ''}</div>
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--gray-400)' }}>{fmtDate(u.created_at)}</div>
                                        {u.is_suspended && <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.5rem', background: '#fee2e2', color: '#b91c1c', borderRadius: '999px', fontWeight: 700 }}>SUSPENDED</span>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ── USERS ── */}
                    {activeTab === 'users' && (
                        <div style={{ maxWidth: 1000 }}>
                            {/* Search */}
                            <div style={{ marginBottom: '1rem', position: 'relative', display: 'inline-block' }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ position: 'absolute', left: '0.625rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-400)' }}>
                                    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                                </svg>
                                <input type="text" value={usersSearch} onChange={e => setUsersSearch(e.target.value)} placeholder="Search phone, email…" style={searchInp} />
                            </div>

                            <div style={{ background: 'white', border: '1px solid var(--gray-200)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                                {/* Header */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px 80px 100px 120px', padding: '0.625rem 1.125rem', background: 'var(--gray-50)', borderBottom: '1px solid var(--gray-100)', gap: '1rem' }}>
                                    {['User', 'Contact', 'Plan', 'Devices', 'Joined', 'Actions'].map(h => (
                                        <span key={h} style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--gray-400)' }}>{h}</span>
                                    ))}
                                </div>

                                {users.length === 0 ? (
                                    <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray-400)', fontSize: '0.875rem' }}>No users found</div>
                                ) : users.map((u, i) => (
                                    <div key={u.firebase_uid} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px 80px 100px 120px', padding: '0.875rem 1.125rem', gap: '1rem', alignItems: 'center', borderBottom: i < users.length - 1 ? '1px solid var(--gray-100)' : 'none', background: u.is_suspended ? '#fffbeb' : 'white' }}>
                                        <div>
                                            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--gray-900)' }}>{u.name || '—'}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--gray-400)', fontFamily: 'monospace' }}>{u.firebase_uid.slice(0, 14)}…</div>
                                        </div>
                                        <div style={{ fontSize: '0.8125rem', color: 'var(--gray-600)' }}>
                                            <div>{u.phone || '—'}</div>
                                            <div style={{ color: 'var(--gray-400)' }}>{u.email || '—'}</div>
                                        </div>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: '999px', background: u.plan === 'pro' ? '#ede9fe' : u.plan === 'basic' ? '#dbeafe' : '#f3f4f6', color: u.plan === 'pro' ? '#7c3aed' : u.plan === 'basic' ? '#1d4ed8' : '#6b7280' }}>
                                            {u.plan}
                                        </span>
                                        <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--gray-700)' }}>
                                            {u.device_count}/{u.max_devices}
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>{fmtDate(u.created_at)}</div>
                                        <div style={{ display: 'flex', gap: '0.375rem' }}>
                                            <button onClick={() => handleSuspendUser(u.firebase_uid, u.is_suspended)}
                                                style={{ height: 28, padding: '0 0.625rem', fontSize: '0.7rem', fontWeight: 600, fontFamily: 'inherit', border: '1px solid', borderRadius: 6, cursor: 'pointer', borderColor: u.is_suspended ? '#bbf7d0' : '#fecaca', background: u.is_suspended ? '#f0fdf4' : '#fef2f2', color: u.is_suspended ? '#15803d' : '#b91c1c' }}>
                                                {u.is_suspended ? 'Unsuspend' : 'Suspend'}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ── DEVICES ── */}
                    {activeTab === 'devices' && (
                        <div style={{ maxWidth: 1100 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                                {/* Search */}
                                <div style={{ position: 'relative' }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ position: 'absolute', left: '0.625rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-400)' }}>
                                        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                                    </svg>
                                    <input type="text" value={devicesSearch} onChange={e => setDevicesSearch(e.target.value)} placeholder="Search IMEI, vehicle…" style={searchInp} />
                                </div>
                                {/* Status filter */}
                                {['all', 'unclaimed', 'active', 'suspended'].map(s => (
                                    <button key={s} onClick={() => setDevicesFilter(s)}
                                        style={{ height: 36, padding: '0 0.875rem', fontSize: '0.8125rem', fontWeight: 600, fontFamily: 'inherit', border: '1px solid', borderRadius: 8, cursor: 'pointer', borderColor: devicesFilter === s ? 'var(--primary-300)' : 'var(--gray-200)', background: devicesFilter === s ? 'var(--primary-50)' : 'white', color: devicesFilter === s ? 'var(--primary-600)' : 'var(--gray-500)' }}>
                                        {s.charAt(0).toUpperCase() + s.slice(1)}
                                    </button>
                                ))}
                            </div>

                            <div style={{ background: 'white', border: '1px solid var(--gray-200)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 1fr 100px 120px', padding: '0.625rem 1.125rem', background: 'var(--gray-50)', borderBottom: '1px solid var(--gray-100)', gap: '1rem' }}>
                                    {['IMEI / Model', 'Traccar ID', 'Status', 'Owner', 'Claimed', 'Actions'].map(h => (
                                        <span key={h} style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--gray-400)' }}>{h}</span>
                                    ))}
                                </div>

                                {devices.length === 0 ? (
                                    <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray-400)', fontSize: '0.875rem' }}>No devices found</div>
                                ) : devices.map((d, i) => (
                                    <div key={d.id} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 1fr 100px 120px', padding: '0.875rem 1.125rem', gap: '1rem', alignItems: 'center', borderBottom: i < devices.length - 1 ? '1px solid var(--gray-100)' : 'none' }}>
                                        <div>
                                            <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--gray-900)', fontFamily: 'monospace' }}>{d.imei}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--gray-400)' }}>{d.device_model || '—'} {d.sim_number ? `· ${d.sim_number}` : ''}</div>
                                        </div>
                                        <div style={{ fontSize: '0.8125rem', fontFamily: 'monospace', color: 'var(--gray-600)' }}>#{d.traccar_id}</div>
                                        <DeviceStatusBadge status={d.status} />
                                        <div style={{ fontSize: '0.8125rem', color: 'var(--gray-600)' }}>
                                            {d.owner_uid ? (
                                                <>
                                                    <div>{d.vehicle_name || '—'}</div>
                                                    <div style={{ color: 'var(--gray-400)' }}>{d.owner_phone || d.owner_email || d.owner_uid?.slice(0, 12) + '…'}</div>
                                                </>
                                            ) : <span style={{ color: 'var(--gray-300)' }}>Unclaimed</span>}
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>{d.claimed_at ? fmtDate(d.claimed_at) : '—'}</div>
                                        <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                                            {d.status === 'active' && (
                                                <button onClick={() => handleDeviceStatus(d.id, 'suspended')}
                                                    style={{ height: 26, padding: '0 0.5rem', fontSize: '0.7rem', fontWeight: 600, fontFamily: 'inherit', border: '1px solid #fecaca', borderRadius: 5, cursor: 'pointer', background: '#fef2f2', color: '#b91c1c' }}>
                                                    Suspend
                                                </button>
                                            )}
                                            {d.status === 'suspended' && (
                                                <button onClick={() => handleDeviceStatus(d.id, 'active')}
                                                    style={{ height: 26, padding: '0 0.5rem', fontSize: '0.7rem', fontWeight: 600, fontFamily: 'inherit', border: '1px solid #bbf7d0', borderRadius: 5, cursor: 'pointer', background: '#f0fdf4', color: '#15803d' }}>
                                                    Restore
                                                </button>
                                            )}
                                            {d.status !== 'unclaimed' && (
                                                <button onClick={() => { if (confirm('Remove owner and mark unclaimed?')) handleDeviceStatus(d.id, 'unclaimed'); }}
                                                    style={{ height: 26, padding: '0 0.5rem', fontSize: '0.7rem', fontWeight: 600, fontFamily: 'inherit', border: '1px solid var(--gray-200)', borderRadius: 5, cursor: 'pointer', background: 'var(--gray-50)', color: 'var(--gray-600)' }}>
                                                    Unclaim
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {showAddDevices && (
                <AddDevicesModal
                    onClose={() => setShowAddDevices(false)}
                    onSuccess={() => { fetchDevices(devicesSearch, devicesFilter); fetchStats(); }}
                />
            )}
        </div>
    );
}