'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';
import { apiFetch } from '@/lib/api';

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!email.trim() || !password.trim()) {
            setError('Please enter both email and password.');
            return;
        }

        setLoading(true);

        try {
            const res = await apiFetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email.trim(), password }),
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.error || 'Login failed. Please try again.');
                setLoading(false);
                return;
            }

            // Store token and user info in cookies (7 day expiry)
            Cookies.set('trackpro_token', data.token, { expires: 7, sameSite: 'Lax' });
            Cookies.set('trackpro_user', JSON.stringify(data.user), { expires: 7, sameSite: 'Lax' });

            router.push('/dashboard');
        } catch (err) {
            setError('Network error. Please check your connection.');
            setLoading(false);
        }
    };

    return (
        <div className="login-page">
            <div className="login-card">
                {/* Logo */}
                <div className="login-logo">
                    <div className="login-logo-icon">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="3" />
                            <path d="M12 2v4" /><path d="M12 18v4" />
                            <path d="M4.93 4.93l2.83 2.83" /><path d="M16.24 16.24l2.83 2.83" />
                            <path d="M2 12h4" /><path d="M18 12h4" />
                            <path d="M4.93 19.07l2.83-2.83" /><path d="M16.24 7.76l2.83-2.83" />
                        </svg>
                    </div>
                    <span className="login-logo-text">TrackPro</span>
                </div>

                <p className="login-subtitle">Sign in to your vehicle tracking dashboard</p>

                {/* Error message */}
                {error && (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.75rem 1rem',
                        marginBottom: '1.25rem',
                        background: 'var(--danger-50)',
                        border: '1px solid var(--danger-100)',
                        borderRadius: 'var(--radius-lg)',
                        color: 'var(--danger-600)',
                        fontSize: '0.875rem',
                        fontWeight: '500',
                        animation: 'fadeInUp 0.2s ease-out',
                    }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="15" y1="9" x2="9" y2="15" />
                            <line x1="9" y1="9" x2="15" y2="15" />
                        </svg>
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit}>
                    {/* Email */}
                    <div className="form-group">
                        <label htmlFor="login-email" className="form-label">Email Address</label>
                        <input
                            id="login-email"
                            type="email"
                            className={`form-input ${error ? 'form-input-error' : ''}`}
                            placeholder="you@company.com"
                            value={email}
                            onChange={(e) => { setEmail(e.target.value); setError(''); }}
                            autoComplete="email"
                            autoFocus
                        />
                    </div>

                    {/* Password */}
                    <div className="form-group">
                        <label htmlFor="login-password" className="form-label">Password</label>
                        <div style={{ position: 'relative' }}>
                            <input
                                id="login-password"
                                type={showPassword ? 'text' : 'password'}
                                className={`form-input ${error ? 'form-input-error' : ''}`}
                                placeholder="Enter your password"
                                value={password}
                                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                                autoComplete="current-password"
                                style={{ paddingRight: '2.75rem' }}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                style={{
                                    position: 'absolute',
                                    right: '0.75rem',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: 'var(--gray-400)',
                                    display: 'flex',
                                    padding: '0.25rem',
                                }}
                                tabIndex={-1}
                                aria-label={showPassword ? 'Hide password' : 'Show password'}
                            >
                                {showPassword ? (
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                                        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                                        <line x1="1" y1="1" x2="23" y2="23" />
                                        <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                                    </svg>
                                ) : (
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                        <circle cx="12" cy="12" r="3" />
                                    </svg>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Submit */}
                    <button
                        id="login-submit"
                        type="submit"
                        className="btn-primary"
                        disabled={loading}
                        style={{ marginTop: '0.5rem' }}
                    >
                        {loading ? (
                            <>
                                <div className="spinner" />
                                Signing in...
                            </>
                        ) : (
                            <>
                                Sign In
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M5 12h14" />
                                    <path d="M12 5l7 7-7 7" />
                                </svg>
                            </>
                        )}
                    </button>
                </form>

                {/* Footer */}
                <div style={{
                    marginTop: '1.75rem',
                    paddingTop: '1.25rem',
                    borderTop: '1px solid var(--gray-100)',
                    textAlign: 'center',
                    fontSize: '0.8125rem',
                    color: 'var(--gray-400)',
                }}>
                    Powered by <span style={{ fontWeight: 600, color: 'var(--gray-500)' }}>TrackPro</span> · GPS Fleet Management
                </div>
            </div>
        </div>
    );
}
