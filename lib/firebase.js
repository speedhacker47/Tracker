/**
 * Firebase Client SDK — Browser-side initialization
 *
 * Used in login page and client components for authentication.
 * NEXT_PUBLIC_ env vars are baked into the JS bundle at build time.
 */

import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialize only once (Next.js hot-reload safe)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);

/**
 * Get the current user's Firebase ID Token.
 * Firebase SDK auto-refreshes tokens that are about to expire.
 *
 * @returns {Promise<string|null>} ID token string, or null if not logged in
 */
export async function getFirebaseToken() {
    const user = auth.currentUser;
    if (!user) return null;

    try {
        return await user.getIdToken();
    } catch {
        return null;
    }
}
