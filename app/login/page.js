'use client';

import { useState, Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signInWithEmailAndPassword, onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';

function LoginContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const redirect = searchParams.get('redirect') || '/dashboard';

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, u => { if (u) router.push(redirect); });
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
            setError('Invalid email or password. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const inputStyle = {
        width: '100%', height: '48px', padding: '0 14px', fontSize: '1rem',
        border: '1px solid var(--gray-400)', borderRadius: '4px', background: 'white',
        color: 'var(--gray-900)', outline: 'none', transition: 'border 0.2s', fontFamily: 'var(--font-sans)',
        boxSizing: 'border-box'
    };

    return (
        <div style={{ minHeight: '100vh', background: 'var(--gray-50)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
            <div style={{ width: '100%', maxWidth: '450px', background: 'white', border: '1px solid var(--gray-300)', borderRadius: '8px', padding: '48px 40px', textAlign: 'center' }}>

                {/* Logo & Title */}
                <div style={{ display: 'flex', justifyContent: 'center', color: 'var(--primary-500)', marginBottom: '16px' }}>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M12 2v4" /><path d="M12 18v4" />
                        <path d="M4.93 4.93l2.83 2.83" /><path d="M16.24 16.24l2.83 2.83" />
                        <path d="M2 12h4" /><path d="M18 12h4" />
                        <path d="M4.93 19.07l2.83-2.83" /><path d="M16.24 7.76l2.83-2.83" />
                    </svg>
                </div>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 400, color: 'var(--gray-900)', margin: '0 0 8px 0' }}>Sign in</h1>
                <p style={{ fontSize: '1rem', color: 'var(--gray-700)', margin: '0 0 32px 0' }}>to continue to TrackPro</p>

                {error && (
                    <div style={{ padding: '12px', background: 'var(--danger-50)', color: 'var(--danger-600)', borderRadius: '4px', fontSize: '0.875rem', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px', textAlign: 'left' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                        {error}
                    </div>
                )}

                <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '24px', textAlign: 'left' }}>
                    <div>
                        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email or phone" style={inputStyle} onFocus={e => { e.target.style.border = '2px solid var(--primary-500)'; e.target.style.padding = '0 13px'; }} onBlur={e => { e.target.style.border = '1px solid var(--gray-400)'; e.target.style.padding = '0 14px'; }} required />
                    </div>
                    <div>
                        <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" style={inputStyle} onFocus={e => { e.target.style.border = '2px solid var(--primary-500)'; e.target.style.padding = '0 13px'; }} onBlur={e => { e.target.style.border = '1px solid var(--gray-400)'; e.target.style.padding = '0 14px'; }} required />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
                        <a href="/register" style={{ color: 'var(--primary-500)', fontSize: '0.875rem', fontWeight: 500, textDecoration: 'none' }}>Create account</a>
                        <button type="submit" disabled={loading} style={{ height: '36px', padding: '0 24px', background: 'var(--primary-500)', color: 'white', border: 'none', borderRadius: '4px', fontSize: '0.875rem', fontWeight: 500, cursor: loading ? 'not-allowed' : 'pointer', transition: 'background 0.2s' }} onMouseOver={e => { if (!loading) e.currentTarget.style.background = 'var(--primary-600)'; }} onMouseOut={e => { if (!loading) e.currentTarget.style.background = 'var(--primary-500)'; }}>
                            {loading ? 'Signing in...' : 'Next'}
                        </button>
                    </div>
                </form>
            </div>
            <div style={{ position: 'absolute', bottom: '24px', fontSize: '0.75rem', color: 'var(--gray-500)' }}>
                English (United States)
            </div>
        </div>
    );
}

export default function LoginPage() {
    return (
        <Suspense fallback={<div style={{ minHeight: '100vh', background: 'var(--gray-50)' }}></div>}>
            <LoginContent />
        </Suspense>
    );
}