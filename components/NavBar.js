'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';

const NAV_ITEMS = [
    {
        label: 'Live Tracking',
        href: '/dashboard',
        icon: (
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 2v4" /><path d="M12 18v4" />
                <path d="M4.93 4.93l2.83 2.83" /><path d="M16.24 16.24l2.83 2.83" />
                <path d="M2 12h4" /><path d="M18 12h4" />
                <path d="M4.93 19.07l2.83-2.83" /><path d="M16.24 7.76l2.83-2.83" />
            </svg>
        ),
    },
    {
        label: 'Vehicles',
        href: '/vehicles',
        icon: (
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="3" width="15" height="13" rx="2" />
                <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                <circle cx="5.5" cy="18.5" r="2.5" />
                <circle cx="18.5" cy="18.5" r="2.5" />
            </svg>
        ),
    },
    {
        label: 'Route History',
        href: '/history',
        icon: (
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
        ),
    },
    {
        label: 'Reports',
        href: '/reports',
        icon: (
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
        ),
    },
    {
        label: 'Alerts',
        href: '/alerts',
        icon: (
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
        ),
    },
    {
        label: 'Geofences',
        href: '/geofences',
        icon: (
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z" />
                <circle cx="12" cy="10" r="3" />
            </svg>
        ),
    },
    {
        label: 'Account',
        href: '/account',
        icon: (
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
            </svg>
        ),
    },
];

const COLLAPSED_W = 54;
const EXPANDED_W = 200;
const LS_KEY = 'trackpro_nav_expanded';

export default function NavBar() {
    const pathname = usePathname();
    const router = useRouter();
    const [expanded, setExpanded] = useState(true);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        try {
            const stored = localStorage.getItem(LS_KEY);
            if (stored === 'true') setExpanded(true);
        } catch (_) { }
        setReady(true);
    }, []);

    const toggle = () => {
        const next = !expanded;
        setExpanded(next);
        try { localStorage.setItem(LS_KEY, String(next)); } catch (_) { }
    };

    const handleLogout = async () => {
        try { await signOut(auth); } catch (_) { }
        router.push('/login');
    };

    const w = ready ? (expanded ? EXPANDED_W : COLLAPSED_W) : COLLAPSED_W;

    const navItemStyle = (active) => ({
        display: 'flex',
        alignItems: 'center',
        height: 42,
        borderRadius: '0.375rem',
        margin: '0 6px',
        padding: '0 11px',
        textDecoration: 'none',
        cursor: 'pointer',
        background: active ? 'rgba(255,255,255,0.18)' : 'transparent',
        color: active ? 'white' : 'rgba(255,255,255,0.45)',
        transition: 'background 0.15s, color 0.15s',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        flexShrink: 0,
        position: 'relative',
        border: 'none',
        fontFamily: 'inherit',
    });

    const labelStyle = {
        fontSize: '0.8125rem',
        opacity: expanded ? 1 : 0,
        transform: expanded ? 'translateX(0)' : 'translateX(-6px)',
        transition: 'opacity 0.16s ease, transform 0.16s ease',
        pointerEvents: 'none',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        marginLeft: '0.5rem',
        whiteSpace: 'nowrap',
    };

    const iconWrap = {
        width: 30,
        minWidth: 30,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    };

    return (
        <nav style={{
            width: w,
            minWidth: w,
            height: '100vh',
            background: '#1e3a5f',
            display: 'flex',
            flexDirection: 'column',
            flexShrink: 0,
            zIndex: 100,
            transition: 'width 0.22s cubic-bezier(0.4,0,0.2,1), min-width 0.22s cubic-bezier(0.4,0,0.2,1)',
            overflow: 'hidden',
        }}>

            {/* Logo */}
            <div style={{
                height: 54, minHeight: 54,
                display: 'flex', alignItems: 'center',
                background: '#2563eb', flexShrink: 0, overflow: 'hidden',
            }}>
                <div style={{ width: COLLAPSED_W, minWidth: COLLAPSED_W, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M12 2v4" /><path d="M12 18v4" />
                        <path d="M4.93 4.93l2.83 2.83" /><path d="M16.24 16.24l2.83 2.83" />
                        <path d="M2 12h4" /><path d="M18 12h4" />
                        <path d="M4.93 19.07l2.83-2.83" /><path d="M16.24 7.76l2.83-2.83" />
                    </svg>
                </div>
                <span style={{
                    fontSize: '0.9375rem', fontWeight: 800, color: 'white',
                    letterSpacing: '-0.02em', whiteSpace: 'nowrap',
                    opacity: expanded ? 1 : 0,
                    transform: expanded ? 'translateX(0)' : 'translateX(-8px)',
                    transition: 'opacity 0.18s ease, transform 0.18s ease',
                    userSelect: 'none',
                }}>
                    TrackPro
                </span>
            </div>

            {/* Nav links */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.125rem', padding: '0.625rem 0', overflowY: 'auto', overflowX: 'hidden' }}>
                {NAV_ITEMS.map((item) => {
                    const active = pathname === item.href;
                    return (
                        <a
                            key={item.href}
                            href={item.href}
                            title={expanded ? undefined : item.label}
                            onClick={(e) => { e.preventDefault(); router.push(item.href); }}
                            style={navItemStyle(active)}
                            onMouseEnter={e => {
                                if (!active) {
                                    e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                                    e.currentTarget.style.color = 'rgba(255,255,255,0.85)';
                                }
                            }}
                            onMouseLeave={e => {
                                if (!active) {
                                    e.currentTarget.style.background = 'transparent';
                                    e.currentTarget.style.color = 'rgba(255,255,255,0.45)';
                                }
                            }}
                        >
                            {/* Active bar */}
                            {active && (
                                <span style={{
                                    position: 'absolute', left: -6, top: '50%',
                                    transform: 'translateY(-50%)',
                                    width: 3, height: 20,
                                    borderRadius: '0 2px 2px 0',
                                    background: 'white',
                                }} />
                            )}
                            <span style={iconWrap}>{item.icon}</span>
                            <span style={{ ...labelStyle, fontWeight: active ? 700 : 500 }}>{item.label}</span>
                        </a>
                    );
                })}
            </div>

            {/* Bottom: logout + toggle */}
            <div style={{ padding: '0.625rem 0', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: '0.125rem', flexShrink: 0 }}>

                {/* Logout */}
                <button
                    title={expanded ? undefined : 'Logout'}
                    onClick={handleLogout}
                    style={navItemStyle(false)}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.15)'; e.currentTarget.style.color = '#fca5a5'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.45)'; }}
                >
                    <span style={iconWrap}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                            <polyline points="16 17 21 12 16 7" />
                            <line x1="21" y1="12" x2="9" y2="12" />
                        </svg>
                    </span>
                    <span style={{ ...labelStyle, fontWeight: 500 }}>Logout</span>
                </button>

                {/* Toggle */}
                <button
                    onClick={toggle}
                    title={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
                    style={navItemStyle(false)}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.45)'; }}
                >
                    <span style={{
                        ...iconWrap,
                        transition: 'transform 0.22s cubic-bezier(0.4,0,0.2,1)',
                        transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                    }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="9 18 15 12 9 6" />
                        </svg>
                    </span>
                    <span style={{ ...labelStyle, fontWeight: 500, fontSize: '0.75rem' }}>Collapse</span>
                </button>
            </div>
        </nav>
    );
}