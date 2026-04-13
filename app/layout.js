import './globals.css';
import './mobile.css';

export const metadata = {
    title: 'TrackPro — GPS Vehicle Tracking',
    description: 'Professional GPS vehicle tracking and fleet management platform. Monitor your vehicles in real-time with TrackPro.',
    keywords: 'GPS tracking, vehicle tracking, fleet management, live tracking',
};

export default function RootLayout({ children }) {
    return (
        <html lang="en" suppressHydrationWarning>
            <head>
                {/* Viewport — critical for mobile rendering */}
                <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
                <link
                    href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap"
                    rel="stylesheet"
                />
                <link
                    rel="stylesheet"
                    href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
                    integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
                    crossOrigin=""
                />
                {/* Mobile WebView detection — runs before first paint */}
                <script dangerouslySetInnerHTML={{ __html: `
                    (function() {
                        try {
                            // Three ways to be detected as the mobile app:
                            // 1. Cookie 'tp_app=1' already set from a prior visit
                            // 2. ?source=app in URL (first hit from WebView deep link)
                            // 3. #source=app hash (survives all redirects, never sent to server)
                            // 4. User-Agent contains 'TrackProApp' (set by React Native WebView)
                            var hasCookie = document.cookie.indexOf('tp_app=1') !== -1;
                            var ua = navigator.userAgent || '';
                            var search = window.location.search || '';
                            var hash = window.location.hash || '';
                            var isApp = hasCookie ||
                                        ua.indexOf('TrackProApp') !== -1 ||
                                        search.indexOf('source=app') !== -1 ||
                                        hash.indexOf('source=app') !== -1;
                            if (isApp) {
                                document.documentElement.classList.add('mobile-app');
                                // Persist as a 1-year cookie — survives all SPA navigation & auth redirects
                                if (!hasCookie) {
                                    document.cookie = 'tp_app=1; path=/; max-age=31536000; SameSite=Lax';
                                }
                            }
                        } catch(e) {}
                    })();
                ` }} />
            </head>
            <body>{children}</body>
        </html>
    );
}
