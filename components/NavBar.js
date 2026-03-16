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
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
        ),
    },
    {
        label: 'Reports',
        href: '/reports',
        icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
        ),
    },
    {
        label: 'Geofences',
        href: '/geofences',
        icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z" />
                <circle cx="12" cy="10" r="3" />
            </svg>
        ),
    },
    {
        label: 'Account',
        href: '/account',
        icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
            </svg>
        ),
    },
];

const COLLAPSED_W = 64;
const EXPANDED_W = 240;
const LS_KEY = 'trackpro_nav_expanded';

export default function NavBar() {
    const pathname = usePathname();
    const router = useRouter();
    const [expanded, setExpanded] = useState(true);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        try {
            const stored = localStorage.getItem(LS_KEY);
            if (stored === 'false') setExpanded(false);
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

    const w = ready ? (expanded ? EXPANDED_W : COLLAPSED_W) : EXPANDED_W;

    const navItemStyle = (active) => ({
        display: 'flex',
        alignItems: 'center',
        height: 40,
        borderRadius: '0 20px 20px 0',
        margin: '4px 12px 4px 0',
        padding: '0 16px',
        textDecoration: 'none',
        cursor: 'pointer',
        background: active ? 'var(--primary-50)' : 'transparent',
        color: active ? 'var(--primary-600)' : 'var(--gray-600)',
        transition: 'background 0.2s, color 0.2s',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        flexShrink: 0,
        border: 'none',
        fontFamily: 'var(--font-sans)',
        fontWeight: active ? 500 : 400,
    });

    const labelStyle = {
        fontSize: '0.875rem',
        opacity: expanded ? 1 : 0,
        transform: expanded ? 'translateX(0)' : 'translateX(-10px)',
        transition: 'opacity 0.2s ease, transform 0.2s ease',
        marginLeft: '16px',
    };

    return (
        <nav style={{
            width: w, minWidth: w, height: '100vh',
            background: 'white', borderRight: '1px solid var(--gray-300)',
            display: 'flex', flexDirection: 'column', flexShrink: 0, zIndex: 100,
            transition: 'width 0.2s cubic-bezier(0.4,0,0.2,1), min-width 0.2s cubic-bezier(0.4,0,0.2,1)',
            overflow: 'hidden',
        }}>
            {/* Logo */}
            <div style={{
                height: 64, minHeight: 64, display: 'flex', alignItems: 'center',
                padding: '0 16px', borderBottom: '1px solid transparent', flexShrink: 0,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary-500)', flexShrink: 0 }}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M12 2v4" /><path d="M12 18v4" />
                        <path d="M4.93 4.93l2.83 2.83" /><path d="M16.24 16.24l2.83 2.83" />
                        <path d="M2 12h4" /><path d="M18 12h4" />
                        <path d="M4.93 19.07l2.83-2.83" /><path d="M16.24 7.76l2.83-2.83" />
                    </svg>
                </div>
                <span style={{
                    fontSize: '1.25rem', fontWeight: 500, color: 'var(--gray-700)',
                    marginLeft: '12px', whiteSpace: 'nowrap',
                    opacity: expanded ? 1 : 0, transition: 'opacity 0.2s ease',
                }}>
                    TrackPro
                </span>
            </div>

            {/* Nav links */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', paddingTop: '12px', overflowY: 'auto' }}>
                {NAV_ITEMS.map((item) => {
                    const active = pathname === item.href;
                    return (
                        <a key={item.href} href={item.href} title={expanded ? undefined : item.label} onClick={(e) => { e.preventDefault(); router.push(item.href); }}
                            style={navItemStyle(active)}
                            onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--gray-50)'; }}
                            onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}>
                            <span style={{ minWidth: 24, display: 'flex', justifyContent: 'center' }}>{item.icon}</span>
                            <span style={labelStyle}>{item.label}</span>
                        </a>
                    );
                })}
            </div>

            {/* Bottom Actions */}
            <div style={{ padding: '12px 0', borderTop: '1px solid var(--gray-200)' }}>
                <button title={expanded ? undefined : 'Logout'} onClick={handleLogout} style={navItemStyle(false)}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--gray-50)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                    <span style={{ minWidth: 24, display: 'flex', justifyContent: 'center' }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
                        </svg>
                    </span>
                    <span style={labelStyle}>Logout</span>
                </button>

                <button onClick={toggle} title={expanded ? 'Collapse sidebar' : 'Expand sidebar'} style={navItemStyle(false)}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--gray-50)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                    <span style={{ minWidth: 24, display: 'flex', justifyContent: 'center', transition: 'transform 0.2s', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                    </span>
                    <span style={labelStyle}>Collapse</span>
                </button>
            </div>
        </nav>
    );
}