'use client';

import { useState, Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';

function RegisterContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const redirect = searchParams.get('redirect') || '/claim';

    const [isNewAccount, setIsNewAccount] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, u => {
            if (u) router.push(redirect);
        });
        return () => unsub();
    }, [router, redirect]);

    const handleAuthSuccess = async (user) => {
        try {
            const token = await user.getIdToken();
            await fetch('/api/auth/register', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            });
        } catch (_) { }
        router.push(redirect);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        if (!email.trim() || !password.trim()) { setError('Fill in all fields'); return; }
        if (isNewAccount && password !== confirmPassword) { setError('Passwords do not match'); return; }
        if (isNewAccount && password.length < 6) { setError('Password must be at least 6 characters'); return; }

        setLoading(true);
        try {
            let result;
            if (isNewAccount) {
                result = await createUserWithEmailAndPassword(auth, email.trim(), password);
            } else {
                result = await signInWithEmailAndPassword(auth, email.trim(), password);
            }
            await handleAuthSuccess(result.user);
        } catch (err) {
            if (err.code === 'auth/email-already-in-use') setError('Account already exists. Sign in instead.');
            else if (err.code === 'auth/user-not-found') setError('No account found. Register instead.');
            else if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') setError('Incorrect password.');
            else if (err.code === 'auth/weak-password') setError('Password too weak. Use 6+ characters.');
            else if (err.code === 'auth/invalid-email') setError('Invalid email address.');
            else setError('Authentication failed. Please try again.');
            setLoading(false);
        }
    };

    const inp = {
        width: '100%', height: 46, padding: '0 0.875rem', fontSize: '0.9375rem',
        fontFamily: 'inherit', border: '1.5px solid #e2e8f0', borderRadius: 10,
        background: '#f8fafc', color: '#1e293b', outline: 'none',
        boxSizing: 'border-box', transition: 'border-color 0.15s',
    };

    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #1e40af 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '2rem 1rem',
        }}>
            <div style={{ width: '100%', maxWidth: 400 }}>
                {/* Logo */}
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <div style={{
                        width: 56, height: 56, borderRadius: 16,
                        background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem',
                    }}>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="3" />
                            <path d="M12 2v4" /><path d="M12 18v4" />
                            <path d="M4.93 4.93l2.83 2.83" /><path d="M16.24 16.24l2.83 2.83" />
                            <path d="M2 12h4" /><path d="M18 12h4" />
                            <path d="M4.93 19.07l2.83-2.83" /><path d="M16.24 7.76l2.83-2.83" />
                        </svg>
                    </div>
                    <div style={{ fontSize: '1.875rem', fontWeight: 800, color: 'white', letterSpacing: '-0.03em' }}>tracker</div>
                    <div style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.55)', marginTop: '0.375rem' }}>GPS Fleet Tracking</div>
                </div>

                <div style={{ background: 'white', borderRadius: 20, padding: '2rem', boxShadow: '0 25px 60px rgba(0,0,0,0.35)' }}>
                    {/* Toggle */}
                    <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 10, padding: 4, marginBottom: '1.5rem', gap: 4 }}>
                        {[{ val: true, label: 'Create Account' }, { val: false, label: 'Sign In' }].map(m => (
                            <button key={String(m.val)} onClick={() => { setIsNewAccount(m.val); setError(''); }}
                                style={{
                                    flex: 1, height: 36, fontSize: '0.8125rem', fontWeight: 600,
                                    fontFamily: 'inherit', border: 'none', borderRadius: 7, cursor: 'pointer',
                                    background: isNewAccount === m.val ? 'white' : 'transparent',
                                    color: isNewAccount === m.val ? '#1e3a5f' : '#94a3b8',
                                    boxShadow: isNewAccount === m.val ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                                    transition: 'all 0.15s',
                                }}>
                                {m.label}
                            </button>
                        ))}
                    </div>

                    {error && (
                        <div style={{ padding: '0.75rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#b91c1c', fontSize: '0.875rem', marginBottom: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                            </svg>
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#475569', marginBottom: '0.4rem' }}>Email Address</label>
                            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" style={inp} required autoComplete="email" />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#475569', marginBottom: '0.4rem' }}>Password</label>
                            <div style={{ position: 'relative' }}>
                                <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                                    placeholder={isNewAccount ? 'Min. 6 characters' : 'Your password'}
                                    style={{ ...inp, paddingRight: '2.75rem' }} required />
                                <button type="button" onClick={() => setShowPassword(!showPassword)}
                                    style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0 }}>
                                    {showPassword ? (
                                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="1" y1="1" x2="23" y2="23" /><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /></svg>
                                    ) : (
                                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                                    )}
                                </button>
                            </div>
                        </div>
                        {isNewAccount && (
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#475569', marginBottom: '0.4rem' }}>Confirm Password</label>
                                <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Repeat password" style={inp} required />
                            </div>
                        )}
                        <button type="submit" disabled={loading} style={{
                            height: 48, marginTop: '0.25rem',
                            background: loading ? '#93c5fd' : 'linear-gradient(135deg, #1e3a5f, #2563eb)',
                            color: 'white', border: 'none', borderRadius: 12,
                            fontSize: '0.9375rem', fontWeight: 700, fontFamily: 'inherit',
                            cursor: loading ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                            boxShadow: loading ? 'none' : '0 4px 12px rgba(37,99,235,0.35)',
                        }}>
                            {loading ? <><div className="map-loading-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />{isNewAccount ? 'Creating account…' : 'Signing in…'}</> : (isNewAccount ? 'Create Account →' : 'Sign In →')}
                        </button>
                    </form>

                    <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid #f1f5f9', textAlign: 'center', fontSize: '0.8125rem', color: '#94a3b8' }}>
                        Already have an account?{' '}
                        <a href="/login" style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}>Sign in here</a>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function RegisterPage() {
    return (
        <Suspense fallback={
            <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div className="map-loading-spinner" style={{ width: 32, height: 32 }} />
            </div>
        }>
            <RegisterContent />
        </Suspense>
    );
}