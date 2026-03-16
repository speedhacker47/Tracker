import { NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/firebase-admin';
import { upsertUser } from '@/lib/ownership';

/**
 * POST /api/auth/register
 * Called after Firebase auth to ensure user exists in our DB.
 * Safe to call multiple times (upsert).
 */
export async function POST(request) {
    try {
        let decodedToken;
        try {
            decodedToken = await verifyFirebaseToken(request);
        } catch (authErr) {
            return NextResponse.json({ error: authErr.message }, { status: authErr.status || 401 });
        }

        await upsertUser(decodedToken.uid, {
            phone: decodedToken.phone_number || null,
            email: decodedToken.email || null,
            name: decodedToken.name || null,
        });

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('[Auth/Register] Error:', err.message);
        return NextResponse.json({ error: 'Failed to register user' }, { status: 500 });
    }
}