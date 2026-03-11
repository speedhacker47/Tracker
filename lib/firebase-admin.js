/**
 * Firebase Admin SDK — Server-side initialization (lazy)
 *
 * Used in API routes to verify Firebase ID Tokens.
 * Requires server-only env vars: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
 *
 * Initialization is lazy (on first use) to avoid build-time errors when
 * placeholder env vars are set. The Admin SDK is only initialized when
 * verifyFirebaseToken() is actually called at request time.
 */

let _adminAuth = null;

function getAdminAuth() {
    if (_adminAuth) return _adminAuth;

    // Dynamic require to avoid bundling at build time
    const { initializeApp, getApps, cert } = require('firebase-admin/app');
    const { getAuth } = require('firebase-admin/auth');

    if (!getApps().length) {
        initializeApp({
            credential: cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
            }),
        });
    }

    _adminAuth = getAuth();
    return _adminAuth;
}

/**
 * Verify Firebase ID Token from request Authorization header.
 *
 * @param {Request} request - Next.js request object
 * @returns {Promise<import('firebase-admin/auth').DecodedIdToken>} Decoded token with uid, phone, email etc.
 * @throws {Error} If token is missing or invalid
 */
export async function verifyFirebaseToken(request) {
    const authHeader = request.headers.get('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        const err = new Error('Missing or invalid Authorization header');
        err.status = 401;
        throw err;
    }

    const idToken = authHeader.split(' ')[1];

    try {
        const adminAuth = getAdminAuth();
        const decodedToken = await adminAuth.verifyIdToken(idToken);
        return decodedToken;
    } catch (firebaseError) {
        const err = new Error('Invalid or expired Firebase token');
        err.status = 401;
        throw err;
    }
}
