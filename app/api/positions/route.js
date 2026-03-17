import { NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/firebase-admin';
import { getUserTraccarIds } from '@/lib/ownership';
import { redis } from '@/lib/redis';

/**
 * GET /api/positions
 * Returns current positions for the logged-in user's devices.
 * Reads exclusively from Redis — never hits Traccar directly.
 * Redis is populated by the sync worker every 5s.
 */
export async function GET(request) {
    try {
        let decodedToken;
        try {
            decodedToken = await verifyFirebaseToken(request);
        } catch (authErr) {
            return NextResponse.json({ error: authErr.message }, { status: authErr.status || 401 });
        }

        // Get user's traccar device IDs
        const clientDeviceIds = await getUserTraccarIds(decodedToken.uid);
        if (clientDeviceIds.size === 0) return NextResponse.json([]);

        // Read from Redis — written by sync worker every 5s
        const cached = await redis.get('tracker:positions');
        if (!cached) return NextResponse.json([]);

        const positions = JSON.parse(cached);
        const clientPositions = positions.filter(p => clientDeviceIds.has(p.deviceId));
        return NextResponse.json(clientPositions);

    } catch (err) {
        console.error('[Positions] Error:', err.message);
        return NextResponse.json({ error: 'Failed to fetch positions' }, { status: 500 });
    }
}