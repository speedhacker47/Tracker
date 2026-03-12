'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Cookies from 'js-cookie';
import {
    RecaptchaVerifier,
    signInWithPhoneNumber,
    signInWithEmailAndPassword,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';

export default function LoginPage() {
    return (
        <Suspense fallback={
            <div className="login-page">
                <div className="login-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '200px' }}>
                    <div className="spinner" />
                </div>
            </div>
        }>
            <LoginContent />
        </Suspense>
    );
}

function LoginContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const redirect = searchParams.get('redirect') || '/dashboard';

    // Toggle: 'phone' or 'email'
    const [mode, setMode] = useState('phone');

    // Phone OTP state
    const [phone, setPhone] = useState('');
    const [otp, setOtp] = useState('');
    const [otpSent, setOtpSent] = useState(false);
    const [confirmationResult, setConfirmationResult] = useState(null);
    const recaptchaRef = useRef(null);
    const recaptchaVerifierRef = useRef(null);

    // Email state
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    // Shared state
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    // Initialize reCAPTCHA on mount (for phone auth)
    useEffect(() => {
        // Only initialize if phone mode and not already initialized
        if (mode === 'phone' && !recaptchaVerifierRef.current && recaptchaRef.current) {
            try {
                recaptchaVerifierRef.current = new RecaptchaVerifier(auth, recaptchaRef.current, {
                    size: 'invisible',
                    callback: () => { /* reCAPTCHA solved */ },
                    'expired-callback': () => {
                        setError('reCAPTCHA expired. Please try again.');
                    },
                });
            } catch (err) {
                console.error('reCAPTCHA init error:', err);
            }
        }
    }, [mode]);

    // Store token and redirect
    const handleAuthSuccess = async (user) => {
        try {
            await user.getIdToken(); // ensure token is ready
            router.push(redirect);
        } catch (err) {
            setError('Failed to get authentication token. Please try again.');
        }
    };

    // ── Phone OTP: Send Code ──
    const handleSendOtp = async (e) => {
        e.preventDefault();
        setError('');

        const phoneNumber = phone.trim().startsWith('+') ? phone.trim() : `+91${phone.trim()}`;

        if (phoneNumber.length < 10) {
            setError('Please enter a valid phone number.');
            return;
        }

        setLoading(true);
        try {
            if (!recaptchaVerifierRef.current) {
                recaptchaVerifierRef.current = new RecaptchaVerifier(auth, recaptchaRef.current, {
                    size: 'invisible',
                });
            }
            const result = await signInWithPhoneNumber(auth, phoneNumber, recaptchaVerifierRef.current);
            setConfirmationResult(result);
            setOtpSent(true);
        } catch (err) {
            console.error('OTP send error:', err);
            if (err.code === 'auth/too-many-requests') {
                setError('Too many attempts. Please try again later.');
            } else if (err.code === 'auth/invalid-phone-number') {
                setError('Invalid phone number format.');
            } else {
                setError('Failed to send OTP. Please try again.');
            }
            // Reset reCAPTCHA on error
            recaptchaVerifierRef.current = null;
        } finally {
            setLoading(false);
        }
    };

    // ── Phone OTP: Verify Code ──
    const handleVerifyOtp = async (e) => {
        e.preventDefault();
        setError('');

        if (otp.trim().length !== 6) {
            setError('Please enter the 6-digit OTP.');
            return;
        }

        setLoading(true);
        try {
            const result = await confirmationResult.confirm(otp.trim());
            await handleAuthSuccess(result.user);
        } catch (err) {
            console.error('OTP verify error:', err);
            if (err.code === 'auth/invalid-verification-code') {
                setError('Invalid OTP. Please check and try again.');
            } else if (err.code === 'auth/code-expired') {
                setError('OTP expired. Please request a new one.');
            } else {
                setError('Verification failed. Please try again.');
            }
            setLoading(false);
        }
    };

    // ── Email: Sign In ──
    const handleEmailLogin = async (e) => {
        e.preventDefault();
        setError('');

        if (!email.trim() || !password.trim()) {
            setError('Please enter both email and password.');
            return;
        }

        setLoading(true);
        try {
            const result = await signInWithEmailAndPassword(auth, email.trim(), password);
            await handleAuthSuccess(result.user);
        } catch (err) {
            console.error('Email login error:', err);
            if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
                setError('Invalid email or password.');
            } else if (err.code === 'auth/too-many-requests') {
                setError('Too many attempts. Please try again later.');
            } else {
                setError('Login failed. Please try again.');
            }
            setLoading(false);
        }
    };

    // Reset state when switching modes
    const switchMode = (newMode) => {
        setMode(newMode);
        setError('');
        setOtpSent(false);
        setOtp('');
        setLoading(false);
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

                {/* Mode toggle */}
                <div style={{
                    display: 'flex',
                    gap: '0.25rem',
                    padding: '0.25rem',
                    background: 'var(--gray-100)',
                    borderRadius: 'var(--radius-lg)',
                    marginBottom: '1.5rem',
                }}>
                    <button
                        type="button"
                        onClick={() => switchMode('phone')}
                        style={{
                            flex: 1,
                            padding: '0.5rem 0.75rem',
                            fontSize: '0.8125rem',
                            fontWeight: 600,
                            fontFamily: 'var(--font-sans)',
                            border: 'none',
                            borderRadius: 'var(--radius-md)',
                            cursor: 'pointer',
                            transition: 'all var(--transition-fast)',
                            background: mode === 'phone' ? 'white' : 'transparent',
                            color: mode === 'phone' ? 'var(--primary-600)' : 'var(--gray-500)',
                            boxShadow: mode === 'phone' ? 'var(--shadow-sm)' : 'none',
                        }}
                    >
                        📱 Phone OTP
                    </button>
                    <button
                        type="button"
                        onClick={() => switchMode('email')}
                        style={{
                            flex: 1,
                            padding: '0.5rem 0.75rem',
                            fontSize: '0.8125rem',
                            fontWeight: 600,
                            fontFamily: 'var(--font-sans)',
                            border: 'none',
                            borderRadius: 'var(--radius-md)',
                            cursor: 'pointer',
                            transition: 'all var(--transition-fast)',
                            background: mode === 'email' ? 'white' : 'transparent',
                            color: mode === 'email' ? 'var(--primary-600)' : 'var(--gray-500)',
                            boxShadow: mode === 'email' ? 'var(--shadow-sm)' : 'none',
                        }}
                    >
                        ✉️ Email
                    </button>
                </div>

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

                {/* ══════ PHONE OTP MODE ══════ */}
                {mode === 'phone' && !otpSent && (
                    <form onSubmit={handleSendOtp}>
                        <div className="form-group">
                            <label htmlFor="login-phone" className="form-label">Phone Number</label>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <div style={{
                                    padding: '0.75rem 0.75rem',
                                    fontSize: '0.9375rem',
                                    fontFamily: 'var(--font-sans)',
                                    color: 'var(--gray-500)',
                                    background: 'var(--gray-100)',
                                    border: '1.5px solid var(--gray-200)',
                                    borderRadius: 'var(--radius-lg)',
                                    fontWeight: 500,
                                    display: 'flex',
                                    alignItems: 'center',
                                    whiteSpace: 'nowrap',
                                }}>
                                    🇮🇳 +91
                                </div>
                                <input
                                    id="login-phone"
                                    type="tel"
                                    className="form-input"
                                    placeholder="9876543210"
                                    value={phone}
                                    onChange={(e) => { setPhone(e.target.value.replace(/\D/g, '')); setError(''); }}
                                    maxLength={10}
                                    autoComplete="tel"
                                    autoFocus
                                />
                            </div>
                        </div>

                        <button
                            id="login-send-otp"
                            type="submit"
                            className="btn-primary"
                            disabled={loading || phone.length < 10}
                            style={{ marginTop: '0.5rem' }}
                        >
                            {loading ? (
                                <>
                                    <div className="spinner" />
                                    Sending OTP...
                                </>
                            ) : (
                                <>
                                    Send OTP
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M5 12h14" />
                                        <path d="M12 5l7 7-7 7" />
                                    </svg>
                                </>
                            )}
                        </button>
                    </form>
                )}

                {mode === 'phone' && otpSent && (
                    <form onSubmit={handleVerifyOtp}>
                        <div style={{
                            padding: '0.75rem 1rem',
                            marginBottom: '1.25rem',
                            background: 'var(--success-50)',
                            border: '1px solid var(--success-100)',
                            borderRadius: 'var(--radius-lg)',
                            color: 'var(--success-600)',
                            fontSize: '0.8125rem',
                            fontWeight: '500',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                        }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                <polyline points="22 4 12 14.01 9 11.01" />
                            </svg>
                            OTP sent to +91{phone}
                        </div>

                        <div className="form-group">
                            <label htmlFor="login-otp" className="form-label">Enter OTP</label>
                            <input
                                id="login-otp"
                                type="text"
                                className="form-input"
                                placeholder="Enter 6-digit OTP"
                                value={otp}
                                onChange={(e) => { setOtp(e.target.value.replace(/\D/g, '')); setError(''); }}
                                maxLength={6}
                                autoComplete="one-time-code"
                                autoFocus
                                style={{ letterSpacing: '0.3em', textAlign: 'center', fontSize: '1.25rem', fontWeight: 600 }}
                            />
                        </div>

                        <button
                            id="login-verify-otp"
                            type="submit"
                            className="btn-primary"
                            disabled={loading || otp.length !== 6}
                            style={{ marginTop: '0.5rem' }}
                        >
                            {loading ? (
                                <>
                                    <div className="spinner" />
                                    Verifying...
                                </>
                            ) : (
                                <>
                                    Verify & Sign In
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M5 12h14" />
                                        <path d="M12 5l7 7-7 7" />
                                    </svg>
                                </>
                            )}
                        </button>

                        <button
                            type="button"
                            onClick={() => { setOtpSent(false); setOtp(''); setError(''); recaptchaVerifierRef.current = null; }}
                            style={{
                                width: '100%',
                                padding: '0.625rem',
                                marginTop: '0.75rem',
                                fontSize: '0.8125rem',
                                fontWeight: 500,
                                fontFamily: 'var(--font-sans)',
                                color: 'var(--gray-500)',
                                background: 'transparent',
                                border: '1.5px solid var(--gray-200)',
                                borderRadius: 'var(--radius-lg)',
                                cursor: 'pointer',
                                transition: 'all var(--transition-fast)',
                            }}
                        >
                            ← Change number
                        </button>
                    </form>
                )}

                {/* ══════ EMAIL MODE ══════ */}
                {mode === 'email' && (
                    <form onSubmit={handleEmailLogin}>
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
                )}

                {/* Invisible reCAPTCHA container */}
                <div ref={recaptchaRef} id="recaptcha-container" />

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
