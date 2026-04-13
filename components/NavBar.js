'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';

// Bottom nav items (subset of NAV_ITEMS — most important 5 for mobile)
const MOBILE_NAV_ITEMS = [
    {
        label: 'Live',
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
        label: 'Journey',
        href: '/journey',
        icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
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

const NAV_ITEMS = [
    {
        label: 'Live Tracking',
        href: '/dashboard',
        icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="3" width="15" height="13" rx="2" />
                <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                <circle cx="5.5" cy="18.5" r="2.5" />
                <circle cx="18.5" cy="18.5" r="2.5" />
            </svg>
        ),
    },
    {
        label: 'Journey',
        href: '/journey',
        icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
        ),
    },
    {
        label: 'Reports',
        href: '/reports',
        icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
        ),
    },
    {
        label: 'Geofences',
        href: '/geofences',
        icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z" />
                <circle cx="12" cy="10" r="3" />
            </svg>
        ),
    },
    {
        label: 'Account',
        href: '/account',
        icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
            </svg>
        ),
    },
];

const COLLAPSED_W = 54;
const EXPANDED_W = 230;
const LS_KEY = 'trackpro_nav_expanded';
const LS_THEME = 'trackpro_theme';

export default function NavBar() {
    const pathname = usePathname();
    const router = useRouter();
    const [expanded, setExpanded] = useState(true);
    const [ready, setReady] = useState(false);
    const [dark, setDark] = useState(false);

    useEffect(() => {
        try {
            const stored = localStorage.getItem(LS_KEY);
            if (stored === 'false') setExpanded(false);
            const theme = localStorage.getItem(LS_THEME);
            const isDark = theme === 'dark'; // default is always light
            setDark(isDark);
            document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
        } catch (_) { }
        setReady(true);
    }, []);

    const toggle = () => {
        const next = !expanded;
        setExpanded(next);
        try { localStorage.setItem(LS_KEY, String(next)); } catch (_) { }
    };

    const toggleTheme = () => {
        const next = !dark;
        setDark(next);
        document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light');
        try { localStorage.setItem(LS_THEME, next ? 'dark' : 'light'); } catch (_) { }
    };

    const handleLogout = async () => {
        try { await signOut(auth); } catch (_) { }
        router.push('/login');
    };

    const w = ready ? (expanded ? EXPANDED_W : COLLAPSED_W) : EXPANDED_W;

    // ── Mobile detection ──────────────────────────────────────────────────────
    const [isMobile, setIsMobile] = useState(false);
    useEffect(() => {
        const check = () => setIsMobile(
            document.documentElement.classList.contains('mobile-app')
        );
        check();
        // Watch for class changes (e.g. if added async)
        const obs = new MutationObserver(check);
        obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        return () => obs.disconnect();
    }, []);

    // ── Mobile: bottom tab bar ─────────────────────────────────────────────────
    if (isMobile) {
        return (
            <nav className="mobile-bottom-nav" role="navigation" aria-label="Main navigation">
                {MOBILE_NAV_ITEMS.map((item) => {
                    const active = pathname === item.href ||
                        (item.href !== '/dashboard' && pathname.startsWith(item.href));
                    return (
                        <a
                            key={item.href}
                            href={item.href}
                            className={`mobile-bottom-nav__item${active ? ' mobile-bottom-nav__item--active' : ''}`}
                            onClick={(e) => {
                                e.preventDefault();
                                // Live tab: if already on dashboard, toggle vehicle panel
                                if (item.href === '/dashboard' && pathname === '/dashboard') {
                                    window.dispatchEvent(new CustomEvent('trackpro:toggle-live-panel'));
                                } else {
                                    router.push(item.href);
                                }
                            }}
                            aria-current={active ? 'page' : undefined}
                        >
                            <span className="mobile-bottom-nav__icon">{item.icon}</span>
                            <span>{item.label}</span>
                        </a>
                    );
                })}
            </nav>
        );
    }

    // Sun icon (light mode)
    const SunIcon = (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
    );

    // Moon icon (dark mode)
    const MoonIcon = (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
    );

    return (
        <nav style={{
            width: w,
            minWidth: w,
            height: '100vh',
            background: 'var(--nav-bg)',
            borderRight: '1px solid var(--nav-border)',
            display: 'flex',
            flexDirection: 'column',
            flexShrink: 0,
            zIndex: 100,
            transition: 'width 0.22s cubic-bezier(0.4,0,0.2,1), min-width 0.22s cubic-bezier(0.4,0,0.2,1)',
            overflow: 'hidden',
        }}>

            {/* Logo */}
            <div style={{
                height: 60, minHeight: 60,
                display: 'flex', alignItems: 'center',
                padding: '0 14px',
                flexShrink: 0,
                overflow: 'hidden',
                gap: '0.5rem',
                borderBottom: '1px solid var(--nav-border)',
            }}>
                <div style={{ width: 26, minWidth: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--primary-500)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M12 2v4" /><path d="M12 18v4" />
                        <path d="M4.93 4.93l2.83 2.83" /><path d="M16.24 16.24l2.83 2.83" />
                        <path d="M2 12h4" /><path d="M18 12h4" />
                        <path d="M4.93 19.07l2.83-2.83" /><path d="M16.24 7.76l2.83-2.83" />
                    </svg>
                </div>
                <span style={{
                    fontSize: '1.5rem', fontWeight: 500, color: 'var(--nav-text)',
                    letterSpacing: '-0.01em', whiteSpace: 'nowrap',
                    opacity: expanded ? 1 : 0,
                    transform: expanded ? 'translateX(0)' : 'translateX(-8px)',
                    transition: 'opacity 0.18s ease, transform 0.18s ease',
                    userSelect: 'none',
                }}>
                    TrackPro
                </span>
            </div>

            {/* Nav links */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', padding: '0.5rem 0', overflowY: 'auto', overflowX: 'hidden' }}>
                {NAV_ITEMS.map((item) => {
                    const active = pathname === item.href;
                    return (
                        <a
                            key={item.href}
                            href={item.href}
                            title={expanded ? undefined : item.label}
                            onClick={(e) => { e.preventDefault(); router.push(item.href); }}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                height: 50,
                                borderRadius: '0 20px 20px 0',
                                margin: '0 8px 0 0',
                                paddingLeft: 14,
                                paddingRight: 12,
                                textDecoration: 'none',
                                cursor: 'pointer',
                                background: active ? 'var(--nav-active-bg)' : 'transparent',
                                color: active ? 'var(--primary-500)' : 'var(--nav-text-muted)',
                                transition: 'background 0.15s, color 0.15s',
                                overflow: 'hidden',
                                whiteSpace: 'nowrap',
                                flexShrink: 0,
                                border: 'none',
                                fontFamily: 'inherit',
                                gap: '0.625rem',
                            }}
                            onMouseEnter={e => {
                                if (!active) {
                                    e.currentTarget.style.background = 'var(--nav-hover-bg)';
                                    e.currentTarget.style.color = 'var(--nav-text)';
                                }
                            }}
                            onMouseLeave={e => {
                                if (!active) {
                                    e.currentTarget.style.background = 'transparent';
                                    e.currentTarget.style.color = 'var(--nav-text-muted)';
                                }
                            }}
                        >
                            <span style={{ width: 20, minWidth: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                {item.icon}
                            </span>
                            <span style={{
                                fontSize: '0.9rem',
                                fontWeight: active ? 500 : 400,
                                opacity: expanded ? 1 : 0,
                                transform: expanded ? 'translateX(0)' : 'translateX(-6px)',
                                transition: 'opacity 0.16s ease, transform 0.16s ease',
                                pointerEvents: 'none',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            }}>{item.label}</span>
                        </a>
                    );
                })}
            </div>

            {/* Bottom: logout + dark toggle + collapse */}
            <div style={{ padding: '0.5rem 0', borderTop: '1px solid var(--nav-border)', display: 'flex', flexDirection: 'column', gap: '5px', flexShrink: 0 }}>

                {/* Logout */}
                <button
                    title={expanded ? undefined : 'Logout'}
                    onClick={handleLogout}
                    style={{
                        display: 'flex', alignItems: 'center', height: 38,
                        borderRadius: '0 20px 20px 0',
                        margin: '0 8px 0 0', paddingLeft: 14, paddingRight: 12,
                        cursor: 'pointer', background: 'transparent',
                        color: 'var(--nav-text-muted)', border: 'none', fontFamily: 'inherit',
                        gap: '0.625rem', overflow: 'hidden', whiteSpace: 'nowrap', flexShrink: 0,
                        transition: 'background 0.15s, color 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--danger-50)'; e.currentTarget.style.color = 'var(--danger-600)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--nav-text-muted)'; }}
                >
                    <span style={{ width: 20, minWidth: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                            <polyline points="16 17 21 12 16 7" />
                            <line x1="21" y1="12" x2="9" y2="12" />
                        </svg>
                    </span>
                    <span style={{
                        fontSize: '0.9rem', fontWeight: 400,
                        opacity: expanded ? 1 : 0,
                        transform: expanded ? 'translateX(0)' : 'translateX(-6px)',
                        transition: 'opacity 0.16s ease, transform 0.16s ease',
                        pointerEvents: 'none', whiteSpace: 'nowrap',
                    }}>Logout</span>
                </button>

                {/* Dark mode toggle */}
                <button
                    title={dark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                    onClick={toggleTheme}
                    style={{
                        display: 'flex', alignItems: 'center', height: 38,
                        borderRadius: '0 20px 20px 0',
                        margin: '0 8px 0 0', paddingLeft: 14, paddingRight: 12,
                        cursor: 'pointer', background: 'transparent',
                        color: 'var(--nav-text-muted)', border: 'none', fontFamily: 'inherit',
                        gap: '0.625rem', overflow: 'hidden', whiteSpace: 'nowrap', flexShrink: 0,
                        transition: 'background 0.15s, color 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--nav-hover-bg)'; e.currentTarget.style.color = 'var(--nav-text)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--nav-text-muted)'; }}
                >
                    {/* Toggle track */}
                    <span style={{
                        width: 20, minWidth: 20, display: 'flex', alignItems: 'center',
                        justifyContent: 'center', flexShrink: 0,
                        color: dark ? 'var(--warning-500)' : 'var(--gray-500)',
                        transition: 'color 0.2s',
                    }}>
                        {dark ? MoonIcon : SunIcon}
                    </span>
                    {/* Label + inline toggle switch */}
                    <span style={{
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                        opacity: expanded ? 1 : 0,
                        transform: expanded ? 'translateX(0)' : 'translateX(-6px)',
                        transition: 'opacity 0.16s ease, transform 0.16s ease',
                        pointerEvents: 'none', whiteSpace: 'nowrap', flex: 1,
                    }}>
                        <span style={{ fontSize: '0.9rem', fontWeight: 400 }}>
                            {dark ? 'Dark' : 'Light'}
                        </span>
                        {/* Switch pill */}
                        <span style={{
                            width: 28, height: 16, borderRadius: 8,
                            background: dark ? 'var(--primary-500)' : 'var(--gray-300)',
                            display: 'inline-flex', alignItems: 'center',
                            padding: '2px',
                            transition: 'background 0.22s',
                            flexShrink: 0, marginLeft: 'auto',
                        }}>
                            <span style={{
                                width: 12, height: 12, borderRadius: '50%',
                                background: 'white',
                                transform: dark ? 'translateX(12px)' : 'translateX(0)',
                                transition: 'transform 0.22s cubic-bezier(0.4,0,0.2,1)',
                                display: 'block',
                            }} />
                        </span>
                    </span>
                </button>

                {/* Collapse toggle */}
                <button
                    onClick={toggle}
                    title={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
                    style={{
                        display: 'flex', alignItems: 'center', height: 38,
                        borderRadius: '0 20px 20px 0',
                        margin: '0 8px 0 0', paddingLeft: 14, paddingRight: 12,
                        cursor: 'pointer', background: 'transparent',
                        color: 'var(--nav-text-muted)', border: 'none', fontFamily: 'inherit',
                        gap: '0.625rem', overflow: 'hidden', whiteSpace: 'nowrap', flexShrink: 0,
                        transition: 'background 0.15s, color 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--nav-hover-bg)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                >
                    <span style={{
                        width: 20, minWidth: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        transition: 'transform 0.22s cubic-bezier(0.4,0,0.2,1)',
                        transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                    }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="9 18 15 12 9 6" />
                        </svg>
                    </span>
                    <span style={{
                        fontSize: '0.9rem', fontWeight: 400,
                        opacity: expanded ? 1 : 0,
                        transform: expanded ? 'translateX(0)' : 'translateX(-6px)',
                        transition: 'opacity 0.16s ease, transform 0.16s ease',
                        pointerEvents: 'none', whiteSpace: 'nowrap',
                    }}>Collapse</span>
                </button>
            </div>
        </nav>
    );
}