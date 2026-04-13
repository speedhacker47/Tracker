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
                            var ua = navigator.userAgent || '';
                            var isApp = ua.indexOf('TrackProApp') !== -1 ||
                                        window.location.search.indexOf('source=app') !== -1;
                            if (isApp) {
                                document.documentElement.classList.add('mobile-app');
                                // Persist across SPA navigations
                                sessionStorage.setItem('trackpro_is_app', '1');
                            } else if (sessionStorage.getItem('trackpro_is_app') === '1') {
                                document.documentElement.classList.add('mobile-app');
                            }
                        } catch(e) {}
                    })();
                ` }} />
            </head>
            <body>{children}</body>
        </html>
    );
}
