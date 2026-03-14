import { NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/firebase-admin';
import { query } from '@/lib/db';
import { redis } from '@/lib/redis';

export async function GET(request) {
    try {
        let decodedToken;
        try {
            decodedToken = await verifyFirebaseToken(request);
        } catch (authErr) {
            return NextResponse.json({ error: authErr.message }, { status: authErr.status || 401 });
        }

        // Get client's device IDs from DB
        const result = await query(
            'SELECT traccar_device_id FROM client_devices WHERE firebase_uid = $1',
            [decodedToken.uid]
        );
        const clientDeviceIds = new Set(result.rows.map(r => Number(r.traccar_device_id)));

        // Read from Redis — written by sync worker every 5s
        const cached = await redis.get('trackpro:positions');
        if (!cached) {
            // Worker not running yet or just started — return empty, client retries in 10s
            return NextResponse.json([]);
        }

        const positions = JSON.parse(cached);
        const clientPositions = positions.filter(p => clientDeviceIds.has(p.deviceId));
        return NextResponse.json(clientPositions);

    } catch (err) {
        console.error('[Positions] Error:', err.message);
        return NextResponse.json({ error: 'Failed to fetch positions' }, { status: 500 });
    }
}