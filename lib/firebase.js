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
 */
export async function getFirebaseToken() {
    return new Promise((resolve) => {
        // If already signed in, return token immediately
        if (auth.currentUser) {
            auth.currentUser.getIdToken()
                .then(resolve)
                .catch(() => resolve(null));
            return;
        }

        // Wait for Firebase to restore auth state (runs once)
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            unsubscribe(); // stop listening after first event
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