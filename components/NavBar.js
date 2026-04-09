'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';

const NAV_ITEMS = [
    {
        label: 'Live Tracking',
        href: '/dashboard',
        icon: <img src="/live.svg" width="20" height="20" alt="Live Tracking" style={{ display: 'block', opacity: 0.85 }} />,
    },
    {
        label: 'Vehicles',
        href: '/vehicles',
        icon: <img src="/vehicles.svg" width="20" height="20" alt="Vehicles" style={{ display: 'block', opacity: 0.85 }} />,
    },
    {
        label: 'Journey',
        href: '/journey',
        icon: <img src="/journey.svg" width="20" height="20" alt="Journey" style={{ display: 'block', opacity: 0.85 }} />,
    },
    {
        label: 'Reports',
        href: '/reports',
        icon: <img src="/reports.svg" width="20" height="20" alt="Reports" style={{ display: 'block', opacity: 0.85 }} />,
    },
    {
        label: 'Alerts',
        href: '/alerts',
        icon: <img src="/alert.svg" width="20" height="20" alt="Alerts" style={{ display: 'block', opacity: 0.85 }} />,
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
        icon: <img src="/account.svg" width="20" height="20" alt="Account" style={{ display: 'block', opacity: 0.85 }} />,
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

    // Theme icon (uses custom SVG from /public)
    const ThemeIcon = <img src="/themes.svg" width="20" height="20" alt="Theme" style={{ display: 'block', opacity: 0.85 }} />;

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
                        <img src="/logout.svg" width="20" height="20" alt="Logout" style={{ display: 'block', opacity: 0.85 }} />
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
                    <span style={{ width: 20, minWidth: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {ThemeIcon}
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