'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
    RecaptchaVerifier, signInWithPhoneNumber,
    createUserWithEmailAndPassword, signInWithEmailAndPassword,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';

function RegisterContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const redirect = searchParams.get('redirect') || '/claim';

    const [mode, setMode] = useState('phone'); // 'phone' | 'email'
    const [step, setStep] = useState('form'); // 'form' | 'otp'

    // Phone
    const [phone, setPhone] = useState('');
    const [otp, setOtp] = useState('');
    const [confirmationResult, setConfirmationResult] = useState(null);
    const recaptchaRef = useRef(null);
    const recaptchaVerifierRef = useRef(null);

    // Email
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isNewAccount, setIsNewAccount] = useState(true);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Redirect if already logged in
    useEffect(() => {
        const unsub = onAuthStateChanged(auth, u => {
            if (u) router.push(redirect);
        });
        return () => unsub();
    }, [router, redirect]);

    const handleAuthSuccess = async (user) => {
        // Upsert user in our DB via a lightweight call
        try {
            const token = await user.getIdToken();
            await fetch('/api/auth/register', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            });
        } catch (_) { }
        router.push(redirect);
    };

    const handleSendOtp = async (e) => {
        e.preventDefault();
        setError('');
        const phoneNumber = phone.trim().startsWith('+') ? phone.trim() : `+91${phone.trim()}`;
        if (phoneNumber.length < 10) { setError('Enter a valid phone number'); return; }

        setLoading(true);
        try {
            if (!recaptchaVerifierRef.current) {
                recaptchaVerifierRef.current = new RecaptchaVerifier(auth, recaptchaRef.current, { size: 'invisible' });
            }
            const result = await signInWithPhoneNumber(auth, phoneNumber, recaptchaVerifierRef.current);
            setConfirmationResult(result);
            setStep('otp');
        } catch (err) {
            if (err.code === 'auth/too-many-requests') setError('Too many attempts. Please try later.');
            else if (err.code === 'auth/invalid-phone-number') setError('Invalid phone number format.');
            else setError('Failed to send OTP. Please try again.');
            recaptchaVerifierRef.current = null;
        } finally { setLoading(false); }
    };

    const handleVerifyOtp = async (e) => {
        e.preventDefault();
        setError('');
        if (otp.trim().length !== 6) { setError('Enter the 6-digit OTP'); return; }
        setLoading(true);
        try {
            const result = await confirmationResult.confirm(otp.trim());
            await handleAuthSuccess(result.user);
        } catch (err) {
            if (err.code === 'auth/invalid-verification-code') setError('Invalid OTP. Try again.');
            else if (err.code === 'auth/code-expired') setError('OTP expired. Request a new one.');
            else setError('Verification failed. Please try again.');
            setLoading(false);
        }
    };

    const handleEmail = async (e) => {
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
            if (err.code === 'auth/email-already-in-use') setError('Account exists. Sign in instead.');
            else if (err.code === 'auth/user-not-found') setError('No account found. Register instead.');
            else if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') setError('Incorrect password.');
            else if (err.code === 'auth/weak-password') setError('Password too weak. Use 6+ characters.');
            else setError('Authentication failed. Please try again.');
            setLoading(false);
        }
    };

    const inp = {
        width: '100%', height: 44, padding: '0 0.875rem', fontSize: '0.9375rem',
        fontFamily: 'inherit', border: '1.5px solid #e2e8f0', borderRadius: 10,
        background: '#f8fafc', color: '#1e293b', outline: 'none',
        boxSizing: 'border-box', transition: 'border-color 0.15s',
    };

    return (
        <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #1e40af 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem' }}>
            <div style={{ width: '100%', maxWidth: 420 }}>
                {/* Logo */}
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <div style={{ width: 52, height: 52, borderRadius: 14, background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.875rem' }}>
                        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="3" /><path d="M12 2v4" /><path d="M12 18v4" />
                            <path d="M4.93 4.93l2.83 2.83" /><path d="M16.24 16.24l2.83 2.83" />
                            <path d="M2 12h4" /><path d="M18 12h4" />
                            <path d="M4.93 19.07l2.83-2.83" /><path d="M16.24 7.76l2.83-2.83" />
                        </svg>
                    </div>
                    <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'white', letterSpacing: '-0.03em' }}>TrackPro</div>
                    <div style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.6)', marginTop: '0.25rem' }}>Create your account or sign in</div>
                </div>

                {/* Card */}
                <div style={{ background: 'white', borderRadius: 20, padding: '2rem', boxShadow: '0 25px 60px rgba(0,0,0,0.3)' }}>
                    {/* Mode toggle */}
                    <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 10, padding: 4, marginBottom: '1.5rem', gap: 4 }}>
                        {[{ key: 'phone', label: '📱 Phone OTP' }, { key: 'email', label: '✉️ Email' }].map(m => (
                            <button key={m.key} onClick={() => { setMode(m.key); setStep('form'); setError(''); }}
                                style={{
                                    flex: 1, height: 36, fontSize: '0.8125rem', fontWeight: 600,
                                    fontFamily: 'inherit', border: 'none', borderRadius: 7, cursor: 'pointer',
                                    background: mode === m.key ? 'white' : 'transparent',
                                    color: mode === m.key ? '#1e3a5f' : '#94a3b8',
                                    boxShadow: mode === m.key ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                                    transition: 'all 0.15s',
                                }}>
                                {m.label}
                            </button>
                        ))}
                    </div>

                    {error && (
                        <div style={{ padding: '0.75rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#b91c1c', fontSize: '0.875rem', marginBottom: '1rem' }}>
                            ⚠ {error}
                        </div>
                    )}

                    {/* ── Phone flow ── */}
                    {mode === 'phone' && step === 'form' && (
                        <form onSubmit={handleSendOtp} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#475569', marginBottom: '0.375rem' }}>Mobile Number</label>
                                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91 98765 43210" style={inp} required />
                                <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem' }}>India numbers auto-prefixed with +91</div>
                            </div>
                            <div ref={recaptchaRef} />
                            <button type="submit" disabled={loading} style={{ height: 46, background: loading ? '#93c5fd' : 'linear-gradient(135deg, #1e3a5f, #2563eb)', color: 'white', border: 'none', borderRadius: 10, fontSize: '0.9375rem', fontWeight: 700, fontFamily: 'inherit', cursor: loading ? 'not-allowed' : 'pointer' }}>
                                {loading ? 'Sending OTP…' : 'Send OTP →'}
                            </button>
                        </form>
                    )}

                    {mode === 'phone' && step === 'otp' && (
                        <form onSubmit={handleVerifyOtp} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div style={{ textAlign: 'center', padding: '0.5rem 0' }}>
                                <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#1e293b' }}>Enter OTP sent to</div>
                                <div style={{ fontSize: '0.875rem', color: '#2563eb', fontWeight: 700 }}>{phone.trim().startsWith('+') ? phone : `+91${phone}`}</div>
                            </div>
                            <input type="text" value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                placeholder="6-digit OTP" maxLength={6} style={{ ...inp, textAlign: 'center', fontSize: '1.5rem', letterSpacing: '0.3em', fontWeight: 700 }} required />
                            <button type="submit" disabled={loading} style={{ height: 46, background: loading ? '#93c5fd' : 'linear-gradient(135deg, #1e3a5f, #2563eb)', color: 'white', border: 'none', borderRadius: 10, fontSize: '0.9375rem', fontWeight: 700, fontFamily: 'inherit', cursor: loading ? 'not-allowed' : 'pointer' }}>
                                {loading ? 'Verifying…' : 'Verify & Continue →'}
                            </button>
                            <button type="button" onClick={() => { setStep('form'); setOtp(''); setError(''); }} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'inherit' }}>
                                ← Change number
                            </button>
                        </form>
                    )}

                    {/* ── Email flow ── */}
                    {mode === 'email' && (
                        <form onSubmit={handleEmail} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {/* New / existing toggle */}
                            <div style={{ display: 'flex', gap: '1rem', fontSize: '0.875rem', color: '#64748b' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', cursor: 'pointer' }}>
                                    <input type="radio" checked={isNewAccount} onChange={() => setIsNewAccount(true)} /> New account
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', cursor: 'pointer' }}>
                                    <input type="radio" checked={!isNewAccount} onChange={() => setIsNewAccount(false)} /> Sign in
                                </label>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#475569', marginBottom: '0.375rem' }}>Email</label>
                                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" style={inp} required />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#475569', marginBottom: '0.375rem' }}>Password</label>
                                <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min 6 characters" style={inp} required />
                            </div>
                            {isNewAccount && (
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#475569', marginBottom: '0.375rem' }}>Confirm Password</label>
                                    <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Repeat password" style={inp} required />
                                </div>
                            )}
                            <button type="submit" disabled={loading} style={{ height: 46, background: loading ? '#93c5fd' : 'linear-gradient(135deg, #1e3a5f, #2563eb)', color: 'white', border: 'none', borderRadius: 10, fontSize: '0.9375rem', fontWeight: 700, fontFamily: 'inherit', cursor: loading ? 'not-allowed' : 'pointer' }}>
                                {loading ? (isNewAccount ? 'Creating account…' : 'Signing in…') : (isNewAccount ? 'Create Account →' : 'Sign In →')}
                            </button>
                        </form>
                    )}

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
        <Suspense fallback={<div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="map-loading-spinner" /></div>}>
            <RegisterContent />
        </Suspense>
    );
}