'use client';

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

export default function NavBar() {
    const pathname = usePathname();
    const router = useRouter();

    const handleLogout = async () => {
        try {
            await signOut(auth);
        } catch (err) {
            console.error('Firebase sign-out error:', err);
        }
        router.push('/login');
    };

    return (
        <nav className="icon-sidebar">
            {/* Logo */}
            <div className="icon-sidebar-logo">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M12 2v4" /><path d="M12 18v4" />
                    <path d="M4.93 4.93l2.83 2.83" /><path d="M16.24 16.24l2.83 2.83" />
                    <path d="M2 12h4" /><path d="M18 12h4" />
                    <path d="M4.93 19.07l2.83-2.83" /><path d="M16.24 7.76l2.83-2.83" />
                </svg>
            </div>

            {/* Nav links */}
            <div className="icon-nav-links">
                {NAV_ITEMS.map((item) => (
                    <a
                        key={item.href}
                        href={item.href}
                        title={item.label}
                        className={`icon-nav-link${pathname === item.href ? ' active' : ''}`}
                        onClick={(e) => {
                            e.preventDefault();
                            router.push(item.href);
                        }}
                    >
                        {item.icon}
                    </a>
                ))}
            </div>

            {/* Bottom: logout */}
            <div className="icon-sidebar-bottom">
                <button
                    title="Logout"
                    className="icon-nav-link icon-nav-logout"
                    onClick={handleLogout}
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                        <polyline points="16 17 21 12 16 7" />
                        <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                </button>
            </div>
        </nav>
    );
}