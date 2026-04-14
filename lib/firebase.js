import { initializeApp, getApps } from 'firebase/app';
import { getAuth, onAuthStateChanged } from 'firebase/auth';

const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const auth = getAuth(app);

/**
 * Get current user's Firebase ID Token.
 * Waits for auth state to be ready before returning.
 *
 * Has a 5-second timeout: on Android WebView, IndexedDB can be slow to restore
 * the Firebase session. Without this, getFirebaseToken() can hang indefinitely,
 * keeping the dashboard in a loading state forever.
 */
export async function getFirebaseToken() {
    // Fast path: already signed in
    if (auth.currentUser) {
        try { return await auth.currentUser.getIdToken(); } catch { return null; }
    }

    return new Promise((resolve) => {
        let settled = false;

        // 5-second safety net — if Firebase hasn't restored auth by then, give up
        const timer = setTimeout(() => {
            if (!settled) { settled = true; resolve(null); }
        }, 5000);

        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            unsubscribe();
            if (user) {
                user.getIdToken()
                    .then(resolve)
                    .catch(() => resolve(null));
            } else {
                resolve(null);
            }
        });
    });
}