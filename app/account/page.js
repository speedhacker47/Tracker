'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import NavBar from '@/components/NavBar';
import { apiFetch } from '@/lib/api';
import { onAuthStateChanged, signOut, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { auth } from '@/lib/firebase';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleString('en-IN', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true,
    });
}

function InfoRow({ label, value, mono }) {
    return (
        <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0.875rem 1.25rem',
            borderBottom: '1px solid var(--gray-100)',
        }}>
            <span style={{ fontSize: '0.875rem', color: 'var(--gray-500)', fontWeight: 500 }}>{label}</span>
            <span style={{
                fontSize: '0.875rem', color: 'var(--gray-900)', fontWeight: 600,
                fontFamily: mono ? "'SF Mono', 'Consolas', monospace" : 'inherit',
                background: mono ? 'var(--gray-50)' : 'transparent',
                padding: mono ? '0.125rem 0.5rem' : 0,
                borderRadius: mono ? 'var(--radius-sm)' : 0,
                border: mono ? '1px solid var(--gray-200)' : 'none',
            }}>{value}</span>
        </div>
    );
}

function SectionCard({ title, icon, children }) {
    return (
        <div style={{
            background: 'white', border: '1px solid var(--gray-200)',
            borderRadius: 'var(--radius-xl)', overflow: 'hidden',
            boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
        }}>
            <div style={{
                padding: '1rem 1.25rem', borderBottom: '1px solid var(--gray-100)',
                display: 'flex', alignItems: 'center', gap: '0.625rem',
                background: 'var(--gray-50)',
            }}>
                <span style={{ color: 'var(--gray-500)' }}>{icon}</span>
                <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--gray-700)' }}>{title}</span>
            </div>
            {children}
        </div>
    );
}

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_COLORS = {
    online: { bg: '#dcfce7', color: '#15803d', dot: '#16a34a' },
    idle: { bg: '#fef3c7', color: '#b45309', dot: '#d97706' },
    offline: { bg: '#fee2e2', color: '#b91c1c', dot: '#ef4444' },
};

function StatusBadge({ status }) {
    const s = STATUS_COLORS[status] || STATUS_COLORS.offline;
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
            padding: '0.175rem 0.625rem', borderRadius: 'var(--radius-full)',
            background: s.bg, color: s.color, fontSize: '0.75rem', fontWeight: 700,
        }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot }} />
            {status.charAt(0).toUpperCase() + status.slice(1)}
        </span>
    );
}

// ── Change password modal ─────────────────────────────────────────────────────

function ChangePasswordModal({ onClose }) {
    const [current, setCurrent] = useState('');
    const [next, setNext] = useState('');
    const [confirm, setConfirm] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const handleChange = async () => {
        setError('');
        if (!current || !next || !confirm) { setError('All fields are required'); return; }
        if (next.length < 6) { setError('New password must be at least 6 characters'); return; }
        if (next !== confirm) { setError('Passwords do not match'); return; }

        setLoading(true);
        try {
            const user = auth.currentUser;
            if (!user || !user.email) {
                setError('Password change is only available for email accounts');
                setLoading(false);
                return;
            }
            // Re-authenticate first
            const credential = EmailAuthProvider.credential(user.email, current);
            await reauthenticateWithCredential(user, credential);
            await updatePassword(user, next);
            setSuccess(true);
        } catch (err) {
            if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
                setError('Current password is incorrect');
            } else if (err.code === 'auth/weak-password') {
                setError('New password is too weak');
            } else {
                setError('Failed to change password. Please try again.');
            }
        } finally {
            setLoading(false);
        }
    };

    const inputStyle = {
        width: '100%', height: 38, padding: '0 0.75rem', fontSize: '0.875rem',
        border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)',
        background: 'white', color: 'var(--gray-800)', fontFamily: 'var(--font-sans)',
        boxSizing: 'border-box',
    };
    const labelStyle = { display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--gray-600)', marginBottom: '0.375rem' };

    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: '1rem',
        }}>
            <div style={{
                background: 'white', borderRadius: 'var(--radius-2xl)',
                width: '100%', maxWidth: 420,
                boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
            }}>
                {/* Header */}
                <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--gray-100)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                        <div style={{ width: 32, height: 32, borderRadius: 'var(--radius-md)', background: '#ede9fe', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                            </svg>
                        </div>
                        <span style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--gray-900)' }}>Change Password</span>
                    </div>
                    <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid var(--gray-200)', background: 'var(--gray-50)', cursor: 'pointer', color: 'var(--gray-400)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                {/* Body */}
                <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                    {success ? (
                        <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
                            <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.875rem' }}>
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                                </svg>
                            </div>
                            <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--gray-900)', marginBottom: '0.375rem' }}>Password Changed!</div>
                            <div style={{ fontSize: '0.875rem', color: 'var(--gray-500)' }}>Your password has been updated successfully.</div>
                            <button onClick={onClose} style={{ marginTop: '1.25rem', height: 36, padding: '0 1.5rem', fontSize: '0.875rem', fontWeight: 600, fontFamily: 'var(--font-sans)', border: 'none', borderRadius: 'var(--radius-md)', background: '#16a34a', color: 'white', cursor: 'pointer' }}>Done</button>
                        </div>
                    ) : (
                        <>
                            {error && (
                                <div style={{ padding: '0.625rem 0.875rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--radius-md)', color: '#b91c1c', fontSize: '0.8125rem', fontWeight: 500 }}>
                                    ⚠ {error}
                                </div>
                            )}
                            <div>
                                <label style={labelStyle}>Current Password</label>
                                <input type="password" style={inputStyle} placeholder="Enter current password" value={current} onChange={e => setCurrent(e.target.value)} />
                            </div>
                            <div>
                                <label style={labelStyle}>New Password</label>
                                <input type="password" style={inputStyle} placeholder="Min. 6 characters" value={next} onChange={e => setNext(e.target.value)} />
                            </div>
                            <div>
                                <label style={labelStyle}>Confirm New Password</label>
                                <input type="password" style={inputStyle} placeholder="Repeat new password" value={confirm} onChange={e => setConfirm(e.target.value)} />
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                {!success && (
                    <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--gray-100)', display: 'flex', gap: '0.625rem', justifyContent: 'flex-end' }}>
                        <button onClick={onClose} style={{ height: 36, padding: '0 1rem', fontSize: '0.875rem', fontWeight: 600, fontFamily: 'var(--font-sans)', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', background: 'white', color: 'var(--gray-600)', cursor: 'pointer' }}>Cancel</button>
                        <button onClick={handleChange} disabled={loading} style={{ height: 36, padding: '0 1.25rem', fontSize: '0.875rem', fontWeight: 600, fontFamily: 'var(--font-sans)', border: 'none', borderRadius: 'var(--radius-md)', background: loading ? 'var(--gray-200)' : '#7c3aed', color: 'white', cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                            {loading ? <><div className="map-loading-spinner" style={{ width: 13, height: 13, borderWidth: 2 }} />Updating…</> : 'Update Password'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AccountPage() {
    const router = useRouter();

    const [user, setUser] = useState(null);
    const [devices, setDevices] = useState([]);
    const [positions, setPositions] = useState([]);
    const [devicesLoading, setDevicesLoading] = useState(true);
    const [showChangePassword, setShowChangePassword] = useState(false);
    const [loggingOut, setLoggingOut] = useState(false);

    // Load current user
    useEffect(() => {
        const unsub = onAuthStateChanged(auth, u => {
            if (!u) { router.push('/login'); return; }
            setUser(u);
        });
        return () => unsub();
    }, [router]);

    // Load user's devices + current positions
    useEffect(() => {
        if (!user) return;
        const load = async () => {
            try {
                const [devRes, posRes] = await Promise.all([
                    apiFetch('/api/devices'),
                    apiFetch('/api/positions'),
                ]);
                if (devRes.ok) setDevices(await devRes.json());
                if (posRes.ok) setPositions(await posRes.json());
            } catch (e) {
                console.error(e);
            } finally {
                setDevicesLoading(false);
            }
        };
        load();
    }, [user]);

    const handleLogout = async () => {
        setLoggingOut(true);
        try {
            await signOut(auth);
            router.push('/login');
        } catch (e) {
            setLoggingOut(false);
        }
    };

    // Compute vehicle status from positions
    function getStatus(device) {
        const pos = positions.find(p => p.deviceId === device.id);
        const s = (device.status || '').toLowerCase();
        if (s === 'online') {
            if (pos && pos.speed > 0) return 'online';
            if (pos?.fixTime && (Date.now() - new Date(pos.fixTime)) / 1000 < 300) return 'online';
            return 'idle';
        }
        if (s === 'unknown') return 'idle';
        return 'offline';
    }

    // Login method
    const loginMethod = user?.providerData?.[0]?.providerId;
    const isEmailUser = loginMethod === 'password';
    const isPhoneUser = loginMethod === 'phone';

    // Stats
    const onlineCount = devices.filter(d => getStatus(d) === 'online').length;
    const offlineCount = devices.filter(d => getStatus(d) === 'offline').length;
    const idleCount = devices.filter(d => getStatus(d) === 'idle').length;

    return (
        <div className="dashboard-shell">
            <NavBar />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--gray-50)' }}>

                {/* ── Header ── */}
                <div style={{
                    background: 'white', borderBottom: '1px solid var(--gray-200)',
                    padding: '0 1.75rem', minHeight: 64, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: '1rem',
                }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                        <h1 style={{ fontSize: '1.125rem', fontWeight: 400, color: 'var(--gray-800)', margin: 0 }}>Account</h1>
                        <span style={{ fontSize: '0.8125rem', color: 'var(--gray-500)' }}>Profile & device management</span>
                    </div>

                    {/* Logout button */}
                    <button onClick={handleLogout} disabled={loggingOut}
                        style={{
                            height: 34, padding: '0 1rem', fontSize: '0.8125rem', fontWeight: 600,
                            fontFamily: 'var(--font-sans)', border: '1px solid #fecaca',
                            borderRadius: 'var(--radius-md)',
                            background: loggingOut ? 'var(--gray-50)' : '#fef2f2',
                            color: '#b91c1c', cursor: loggingOut ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', gap: '0.375rem',
                        }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                            <polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
                        </svg>
                        {loggingOut ? 'Logging out…' : 'Log Out'}
                    </button>
                </div>

                {/* ── Body ── */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem 1.75rem' }}>
                    <div style={{ maxWidth: 860, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

                        {/* ── Profile avatar + name row ── */}
                        <div style={{
                            background: 'white', border: '1px solid var(--gray-200)',
                            borderRadius: 'var(--radius-xl)', padding: '1.5rem',
                            boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                            display: 'flex', alignItems: 'center', gap: '1.25rem',
                        }}>
                            {/* Avatar */}
                            <div style={{
                                width: 56, height: 56, borderRadius: '50%',
                                background: 'var(--primary-50)',
                                border: '2px solid var(--primary-100)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                flexShrink: 0,
                            }}>
                                <span style={{ fontSize: '1.375rem', fontWeight: 500, color: 'var(--primary-600)' }}>
                                    {user?.displayName
                                        ? user.displayName.charAt(0).toUpperCase()
                                        : user?.phoneNumber
                                            ? '📱'
                                            : user?.email?.charAt(0).toUpperCase() || '?'}
                                </span>
                            </div>

                            {/* Info */}
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '1rem', fontWeight: 400, color: 'var(--gray-800)', lineHeight: 1.2, marginBottom: '0.25rem' }}>
                                    {user?.displayName || user?.phoneNumber || user?.email || 'TrackPro User'}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                    <span style={{
                                        padding: '0.1875rem 0.625rem', borderRadius: 'var(--radius-full)',
                                        background: isPhoneUser ? '#dbeafe' : '#ede9fe',
                                        color: isPhoneUser ? '#1d4ed8' : '#7c3aed',
                                        fontSize: '0.75rem', fontWeight: 700,
                                    }}>
                                        {isPhoneUser ? '📱 Phone Account' : isEmailUser ? '✉️ Email Account' : '🔐 Authenticated'}
                                    </span>
                                    <span style={{
                                        padding: '0.1875rem 0.625rem', borderRadius: 'var(--radius-full)',
                                        background: '#dcfce7', color: '#15803d',
                                        fontSize: '0.75rem', fontWeight: 700,
                                    }}>✓ Verified</span>
                                </div>
                            </div>

                            {/* Fleet quick stats */}
                            <div style={{ display: 'flex', gap: '1rem', flexShrink: 0 }}>
                                {[
                                    { label: 'Online', value: onlineCount, color: '#16a34a', bg: '#dcfce7' },
                                    { label: 'Idle', value: idleCount, color: '#d97706', bg: '#fef3c7' },
                                    { label: 'Offline', value: offlineCount, color: '#dc2626', bg: '#fee2e2' },
                                ].map(s => (
                                    <div key={s.label} style={{ textAlign: 'center' }}>
                                        <div style={{
                                            fontSize: '1.5rem', fontWeight: 800, color: s.color,
                                            lineHeight: 1, letterSpacing: '-0.025em',
                                        }}>{devicesLoading ? '—' : s.value}</div>
                                        <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: s.color, opacity: 0.75, marginTop: '0.125rem' }}>{s.label}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Two-column layout */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>

                            {/* ── Account Info ── */}
                            <SectionCard title="Account Information"
                                icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>}>
                                <div>
                                    <InfoRow label="User ID" value={user?.uid || '—'} mono />
                                    <InfoRow label="Phone" value={user?.phoneNumber || '—'} />
                                    <InfoRow label="Email" value={user?.email || '—'} />
                                    <InfoRow label="Login Method" value={isPhoneUser ? 'Phone OTP' : isEmailUser ? 'Email & Password' : 'Unknown'} />
                                    <InfoRow label="Account Created" value={user?.metadata?.creationTime ? fmtDate(user.metadata.creationTime) : '—'} />
                                    <div style={{ padding: '0.875rem 1.25rem' }}>
                                        <InfoRow label="Last Sign In" value={user?.metadata?.lastSignInTime ? fmtDate(user.metadata.lastSignInTime) : '—'} />
                                    </div>
                                </div>
                            </SectionCard>

                            {/* ── Security ── */}
                            <SectionCard title="Security"
                                icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>}>
                                <div style={{ padding: '1.25rem' }}>

                                    {/* Change password (email users only) */}
                                    {isEmailUser ? (
                                        <div style={{ marginBottom: '1rem' }}>
                                            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--gray-700)', marginBottom: '0.375rem' }}>Password</div>
                                            <div style={{ fontSize: '0.8125rem', color: 'var(--gray-500)', marginBottom: '0.75rem' }}>Update your account password. You'll need to enter your current password to confirm.</div>
                                            <button onClick={() => setShowChangePassword(true)}
                                                style={{
                                                    height: 34, padding: '0 1rem', fontSize: '0.8125rem', fontWeight: 600,
                                                    fontFamily: 'var(--font-sans)', border: '1px solid #ddd6fe',
                                                    borderRadius: 'var(--radius-md)', background: '#ede9fe',
                                                    color: '#7c3aed', cursor: 'pointer',
                                                    display: 'flex', alignItems: 'center', gap: '0.375rem',
                                                }}>
                                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                                </svg>
                                                Change Password
                                            </button>
                                        </div>
                                    ) : (
                                        <div style={{ marginBottom: '1rem' }}>
                                            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--gray-700)', marginBottom: '0.375rem' }}>Authentication</div>
                                            <div style={{ padding: '0.75rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 'var(--radius-md)', fontSize: '0.8125rem', color: '#15803d', fontWeight: 500 }}>
                                                ✓ Your account uses Phone OTP — no password needed. Each login requires a fresh OTP via SMS.
                                            </div>
                                        </div>
                                    )}

                                    <div style={{ borderTop: '1px solid var(--gray-100)', paddingTop: '1rem', marginTop: '0.5rem' }}>
                                        <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--gray-700)', marginBottom: '0.375rem' }}>Session</div>
                                        <div style={{ fontSize: '0.8125rem', color: 'var(--gray-500)', marginBottom: '0.75rem' }}>Sign out of TrackPro on this device.</div>
                                        <button onClick={handleLogout} disabled={loggingOut}
                                            style={{
                                                height: 34, padding: '0 1rem', fontSize: '0.8125rem', fontWeight: 600,
                                                fontFamily: 'var(--font-sans)', border: '1px solid #fecaca',
                                                borderRadius: 'var(--radius-md)', background: '#fef2f2',
                                                color: '#b91c1c', cursor: loggingOut ? 'not-allowed' : 'pointer',
                                                display: 'flex', alignItems: 'center', gap: '0.375rem',
                                            }}>
                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                                                <polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
                                            </svg>
                                            {loggingOut ? 'Logging out…' : 'Log Out'}
                                        </button>
                                    </div>
                                </div>
                            </SectionCard>
                        </div>

                        {/* ── My Devices ── */}
                        <SectionCard title={`My Devices (${devices.length})`}
                            icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13" rx="2" /><polygon points="16 8 20 8 23 11 23 16 16 16 16 8" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></svg>}>
                            {devicesLoading ? (
                                <div style={{ padding: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' }}>
                                    <div className="map-loading-spinner" style={{ width: 20, height: 20 }} />
                                    <span style={{ fontSize: '0.875rem', color: 'var(--gray-400)' }}>Loading devices…</span>
                                </div>
                            ) : devices.length === 0 ? (
                                <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--gray-400)', fontSize: '0.875rem' }}>
                                    No devices assigned to your account.
                                </div>
                            ) : (
                                <div>
                                    {/* Table header */}
                                    <div style={{
                                        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr',
                                        padding: '0.625rem 1.25rem',
                                        background: 'var(--gray-50)', borderBottom: '1px solid var(--gray-100)',
                                        gap: '1rem',
                                    }}>
                                        {['Vehicle Name', 'Plate / IMEI', 'Traccar ID', 'Status', 'Last Update'].map(h => (
                                            <span key={h} style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--gray-400)' }}>{h}</span>
                                        ))}
                                    </div>

                                    {/* Rows */}
                                    {devices.map((device, i) => {
                                        const status = getStatus(device);
                                        const pos = positions.find(p => p.deviceId === device.id);
                                        return (
                                            <div key={device.id} style={{
                                                display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr',
                                                padding: '0.875rem 1.25rem', gap: '1rem',
                                                alignItems: 'center',
                                                borderBottom: i < devices.length - 1 ? '1px solid var(--gray-100)' : 'none',
                                                background: i % 2 === 1 ? '#fcfcfd' : 'white',
                                            }}>
                                                {/* Name */}
                                                <div>
                                                    <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--gray-900)' }}>{device.name}</div>
                                                </div>

                                                {/* Plate */}
                                                <div style={{
                                                    fontSize: '0.8125rem', fontFamily: "'SF Mono', 'Consolas', monospace",
                                                    color: 'var(--gray-600)', background: 'var(--gray-50)',
                                                    padding: '0.1875rem 0.5rem', borderRadius: 'var(--radius-sm)',
                                                    border: '1px solid var(--gray-200)', width: 'fit-content',
                                                }}>
                                                    {device.vehicleNumber || device.uniqueId}
                                                </div>

                                                {/* Traccar ID */}
                                                <div style={{ fontSize: '0.8125rem', color: 'var(--gray-500)', fontFamily: 'monospace' }}>#{device.id}</div>

                                                {/* Status */}
                                                <StatusBadge status={status} />

                                                {/* Last update */}
                                                <div style={{ fontSize: '0.8125rem', color: 'var(--gray-500)' }}>
                                                    {pos?.fixTime ? fmtDate(pos.fixTime) : device.lastUpdate ? fmtDate(device.lastUpdate) : '—'}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </SectionCard>

                        {/* ── App info ── */}
                        <div style={{
                            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.875rem',
                        }}>
                            {[
                                { label: 'Platform', value: 'TrackPro Fleet' },
                                { label: 'Version', value: '1.0.0' },
                                { label: 'Support', value: 'support@trackpro.in' },
                            ].map(item => (
                                <div key={item.label} style={{
                                    background: 'white', border: '1px solid var(--gray-200)',
                                    borderRadius: 'var(--radius-lg)', padding: '0.875rem 1rem',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                                }}>
                                    <div style={{ fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--gray-400)', marginBottom: '0.25rem' }}>{item.label}</div>
                                    <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--gray-700)' }}>{item.value}</div>
                                </div>
                            ))}
                        </div>

                    </div>
                </div>
            </div>

            {/* Change password modal */}
            {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}
        </div>
    );
}