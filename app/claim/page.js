'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { apiFetch } from '@/lib/api';
import NavBar from '@/components/NavBar';

export default function ClaimPage() {
    const router = useRouter();
    const [user, setUser] = useState(null);
    const [authLoading, setAuthLoading] = useState(true);

    const [imei, setImei] = useState('');
    const [vehicleName, setVehicleName] = useState('');
    const [vehicleNumber, setVehicleNumber] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(null);

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, u => {
            if (!u) { router.push('/register'); return; }
            setUser(u);
            setAuthLoading(false);
        });
        return () => unsub();
    }, [router]);

    const handleClaim = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess(null);

        if (!imei.trim()) { setError('IMEI is required'); return; }
        if (!/^\d{8,20}$/.test(imei.trim())) { setError('IMEI must be 8-20 digits'); return; }

        setLoading(true);
        try {
            const res = await apiFetch('/api/claim', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imei: imei.trim(), vehicleName: vehicleName.trim(), vehicleNumber: vehicleNumber.trim() }),
            });

            const data = await res.json();
            if (res.ok) {
                setSuccess(data);
                setImei('');
                setVehicleName('');
                setVehicleNumber('');
            } else {
                setError(data.error || 'Failed to claim device');
            }
        } catch (err) {
            setError('Connection error. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const inp = {
        width: '100%', height: 46, padding: '0 0.875rem', fontSize: '0.9375rem',
        fontFamily: 'inherit', border: '1.5px solid var(--gray-200)', borderRadius: 10,
        background: 'var(--gray-50)', color: 'var(--gray-800)', outline: 'none',
        boxSizing: 'border-box', transition: 'border-color 0.15s',
    };
    const label = { display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--gray-600)', marginBottom: '0.375rem' };

    if (authLoading) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div className="map-loading-spinner" style={{ width: 32, height: 32 }} />
            </div>
        );
    }

    return (
        <div className="dashboard-shell">
            <NavBar />
            <div style={{ flex: 1, background: 'var(--gray-50)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

                {/* Header */}
                <div style={{ background: 'white', borderBottom: '1px solid var(--gray-200)', padding: '0 1.75rem', minHeight: 64, display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                        <h1 style={{ fontSize: '1.125rem', fontWeight: 400, color: 'var(--gray-800)', margin: 0 }}>Add Device</h1>
                        <span style={{ fontSize: '0.8125rem', color: 'var(--gray-500)' }}>Register your GPS tracker</span>
                    </div>
                </div>

                {/* Body */}
                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '2rem 1rem' }}>
                    <div style={{ width: '100%', maxWidth: 520, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

                        {/* Info card */}
                        <div style={{ background: '#dbeafe', border: '1px solid #bfdbfe', borderRadius: 14, padding: '1rem 1.25rem', display: 'flex', gap: '0.75rem' }}>
                            <div style={{ fontSize: '1.25rem', flexShrink: 0 }}>ℹ️</div>
                            <div>
                                <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#1e40af', marginBottom: '0.25rem' }}>Where to find your IMEI?</div>
                                <div style={{ fontSize: '0.8125rem', color: '#1d4ed8', lineHeight: 1.5 }}>
                                    The IMEI number is printed on the label of your GPS device box, or on the device itself. It's a 15-digit number.
                                </div>
                            </div>
                        </div>

                        {/* Success state */}
                        {success && (
                            <div style={{ background: 'white', border: '1px solid #bbf7d0', borderRadius: 14, padding: '1.5rem', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                                <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                                    </svg>
                                </div>
                                <div style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--gray-900)', marginBottom: '0.375rem' }}>Device Added! 🎉</div>
                                <div style={{ fontSize: '0.875rem', color: 'var(--gray-500)', marginBottom: '1.25rem' }}>{success.message}</div>
                                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                                    <button onClick={() => router.push('/dashboard')} style={{ height: 40, padding: '0 1.25rem', background: 'var(--primary-500)', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '0.875rem', fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer' }}>
                                        Go to Dashboard
                                    </button>
                                    <button onClick={() => setSuccess(null)} style={{ height: 40, padding: '0 1.25rem', background: 'white', color: 'var(--gray-700)', border: '1px solid var(--gray-300)', borderRadius: 'var(--radius-sm)', fontSize: '0.875rem', fontWeight: 400, fontFamily: 'inherit', cursor: 'pointer' }}>
                                        Add Another
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Claim form */}
                        {!success && (
                            <div style={{ background: 'white', border: '1px solid var(--gray-200)', borderRadius: 14, padding: '1.75rem', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                                <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--gray-900)', marginBottom: '1.5rem' }}>Enter Device Details</h2>

                                {error && (
                                    <div style={{ padding: '0.75rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#b91c1c', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
                                        ⚠ {error}
                                    </div>
                                )}

                                <form onSubmit={handleClaim} style={{ display: 'flex', flexDirection: 'column', gap: '1.125rem' }}>
                                    <div>
                                        <label style={label}>
                                            IMEI Number <span style={{ color: '#ef4444' }}>*</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={imei}
                                            onChange={e => setImei(e.target.value.replace(/\D/g, ''))}
                                            placeholder="e.g. 867440064734387"
                                            maxLength={20}
                                            style={inp}
                                            required
                                        />
                                        <div style={{ fontSize: '0.75rem', color: 'var(--gray-400)', marginTop: '0.25rem' }}>{imei.length}/15 digits</div>
                                    </div>

                                    <div>
                                        <label style={label}>Vehicle Name <span style={{ color: 'var(--gray-400)', fontWeight: 400 }}>(optional)</span></label>
                                        <input type="text" value={vehicleName} onChange={e => setVehicleName(e.target.value)} placeholder="e.g. Delivery Van 1" style={inp} />
                                    </div>

                                    <div>
                                        <label style={label}>Vehicle Number / Plate <span style={{ color: 'var(--gray-400)', fontWeight: 400 }}>(optional)</span></label>
                                        <input type="text" value={vehicleNumber} onChange={e => setVehicleNumber(e.target.value.toUpperCase())} placeholder="e.g. MH01AB1234" style={inp} />
                                    </div>

                                    <button type="submit" disabled={loading} style={{
                                        height: 42, background: loading ? 'var(--gray-200)' : 'var(--primary-500)',
                                        color: loading ? 'var(--gray-500)' : 'white', border: 'none', borderRadius: 'var(--radius-sm)',
                                        fontSize: '0.875rem', fontWeight: 500, fontFamily: 'inherit',
                                        cursor: loading ? 'not-allowed' : 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                                    }}>
                                        {loading ? (
                                            <><div className="map-loading-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />Claiming device…</>
                                        ) : (
                                            <>
                                                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                    <rect x="1" y="3" width="15" height="13" rx="2" /><polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                                                    <circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" />
                                                </svg>
                                                Add Device
                                            </>
                                        )}
                                    </button>
                                </form>
                            </div>
                        )}

                        {/* My devices link */}
                        <div style={{ textAlign: 'center', fontSize: '0.875rem', color: 'var(--gray-400)' }}>
                            Already added devices?{' '}
                            <a href="/dashboard" style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}>Go to Dashboard →</a>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}