'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { useEffect } from 'react';

function LoginContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const redirect = searchParams.get('redirect') || '/dashboard';

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, u => {
            if (u) router.push(redirect);
        });
        return () => unsub();
    }, [router, redirect]);

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        if (!email.trim() || !password.trim()) { setError('Please enter both email and password.'); return; }
        setLoading(true);
        try {
            await signInWithEmailAndPassword(auth, email.trim(), password);
            router.push(redirect);
        } catch (err) {
            if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
                setError('Invalid email or password.');
            } else if (err.code === 'auth/too-many-requests') {
                setError('Too many attempts. Please try again later.');
            } else if (err.code === 'auth/invalid-email') {
                setError('Invalid email address.');
            } else {
                setError('Login failed. Please try again.');
            }
        } finally {
            setLoading(false);
        }
    };

    const inp = {
        width: '100%', height: 42, padding: '0 0.875rem', fontSize: '0.875rem',
        fontFamily: 'var(--font-sans)', border: '1px solid var(--gray-300)', borderRadius: 'var(--radius-sm)',
        background: 'white', color: 'var(--gray-800)', outline: 'none',
        boxSizing: 'border-box', transition: 'border-color 0.15s',
    };

    return (
        <div style={{
            minHeight: '100vh',
            background: 'var(--gray-50)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '2rem 1rem',
        }}>
            <div style={{ width: '100%', maxWidth: 420 }}>
                {/* Logo */}
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.625rem',
                        marginBottom: '0.75rem',
                    }}>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--primary-500)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="3" />
                            <path d="M12 2v4" /><path d="M12 18v4" />
                            <path d="M4.93 4.93l2.83 2.83" /><path d="M16.24 16.24l2.83 2.83" />
                            <path d="M2 12h4" /><path d="M18 12h4" />
                            <path d="M4.93 19.07l2.83-2.83" /><path d="M16.24 7.76l2.83-2.83" />
                        </svg>
                        <span style={{ fontSize: '1.25rem', fontWeight: 500, color: 'var(--gray-800)' }}>tracker</span>
                    </div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--gray-600)' }}>GPS Fleet Tracking</div>
                </div>

                {/* Card */}
                <div style={{
                    background: 'white', borderRadius: 'var(--radius-md)', padding: '2rem',
                    border: '1px solid var(--gray-200)', boxShadow: 'var(--shadow-sm)',
                }}>
                    <h2 style={{ fontSize: '1rem', fontWeight: 400, color: 'var(--gray-800)', marginBottom: '0.375rem' }}>
                        Sign in
                    </h2>
                    <p style={{ fontSize: '0.8125rem', color: 'var(--gray-600)', marginBottom: '1.5rem' }}>
                        Enter your credentials to continue
                    </p>

                    {error && (
                        <div style={{
                            padding: '0.625rem 0.875rem',
                            background: 'var(--danger-50)',
                            border: '1px solid var(--danger-100)',
                            borderRadius: 'var(--radius-sm)',
                            color: 'var(--danger-600)', fontSize: '0.8125rem', marginBottom: '1.25rem',
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                        }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                            </svg>
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 400, color: 'var(--gray-700)', marginBottom: '0.375rem' }}>
                                Email Address
                            </label>
                            <input
                                type="email" value={email} onChange={e => setEmail(e.target.value)}
                                placeholder="you@example.com" style={inp} required autoComplete="email"
                                onFocus={e => e.target.style.border = '2px solid var(--primary-500)'}
                                onBlur={e => e.target.style.border = '1px solid var(--gray-300)'}
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 400, color: 'var(--gray-700)', marginBottom: '0.375rem' }}>
                                Password
                            </label>
                            <div style={{ position: 'relative' }}>
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password} onChange={e => setPassword(e.target.value)}
                                    placeholder="Enter your password"
                                    style={{ ...inp, paddingRight: '2.75rem' }} required autoComplete="current-password"
                                    onFocus={e => e.target.style.border = '2px solid var(--primary-500)'}
                                    onBlur={e => e.target.style.border = '1px solid var(--gray-300)'}
                                />
                                <button
                                    type="button" onClick={() => setShowPassword(!showPassword)}
                                    style={{
                                        position: 'absolute', right: '0.75rem', top: '50%',
                                        transform: 'translateY(-50%)', background: 'none',
                                        border: 'none', cursor: 'pointer', color: 'var(--gray-500)', padding: 0,
                                    }}>
                                    {showPassword ? (
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                                            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                                            <line x1="1" y1="1" x2="23" y2="23" />
                                        </svg>
                                    ) : (
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                            <circle cx="12" cy="12" r="3" />
                                        </svg>
                                    )}
                                </button>
                            </div>
                        </div>

                        <button
                            type="submit" disabled={loading}
                            style={{
                                height: 42, marginTop: '0.25rem',
                                background: loading ? 'var(--gray-300)' : 'var(--primary-500)',
                                color: 'white', border: 'none', borderRadius: 'var(--radius-sm)',
                                fontSize: '0.875rem', fontWeight: 500, fontFamily: 'var(--font-sans)',
                                cursor: loading ? 'not-allowed' : 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                                transition: 'background var(--transition-fast)',
                            }}
                            onMouseEnter={e => { if (!loading) e.currentTarget.style.background = 'var(--primary-600)'; }}
                            onMouseLeave={e => { if (!loading) e.currentTarget.style.background = 'var(--primary-500)'; }}
                        >
                            {loading ? (
                                <><div style={{ width: 15, height: 15, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />Signing in…</>
                            ) : 'Sign In'}
                        </button>
                    </form>

                    <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid var(--gray-200)', textAlign: 'center', fontSize: '0.8125rem', color: 'var(--gray-600)' }}>
                        Don&apos;t have an account?{' '}
                        <a href="/register" style={{ color: 'var(--primary-500)', fontWeight: 500, textDecoration: 'none' }}>Register here</a>
                    </div>
                </div>

                <div style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.75rem', color: 'var(--gray-500)' }}>
                    © 2026 tracker. All rights reserved.
                </div>
            </div>
        </div>
    );
}

export default function LoginPage() {
    return (
        <Suspense fallback={
            <div style={{ minHeight: '100vh', background: 'var(--gray-50)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: 28, height: 28, border: '3px solid var(--gray-200)', borderTopColor: 'var(--primary-500)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
            </div>
        }>
            <LoginContent />
        </Suspense>
    );
}