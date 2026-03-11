import { NextResponse } from 'next/server';

/**
 * Middleware to protect /dashboard routes.
 * Redirects to /login if no firebase_token cookie is present.
 *
 * Note: This is a client-side cookie check only. Full Firebase ID Token
 * verification happens in the API routes via Firebase Admin SDK.
 * (Edge Runtime cannot run Firebase Admin SDK.)
 */
export function middleware(request) {
    const { pathname } = request.nextUrl;

    // Only protect app routes
    if (pathname.startsWith('/dashboard') || pathname.startsWith('/history') || pathname.startsWith('/vehicles')) {
        const token = request.cookies.get('firebase_token');

        if (!token || !token.value) {
            const loginUrl = new URL('/login', request.url);
            loginUrl.searchParams.set('redirect', pathname);
            return NextResponse.redirect(loginUrl);
        }
    }

    // If user is logged in and visits /login, redirect to dashboard
    if (pathname === '/login') {
        const token = request.cookies.get('firebase_token');
        if (token && token.value) {
            return NextResponse.redirect(new URL('/dashboard', request.url));
        }
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/dashboard/:path*', '/history/:path*', '/vehicles/:path*', '/login'],
};
