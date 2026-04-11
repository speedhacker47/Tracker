import { NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/firebase-admin';
import { getUserDeviceMap } from '@/lib/ownership';
import { redis } from '@/lib/redis';

/**
 * GET /api/devices
 * Returns the logged-in user's devices from Redis (populated by sync worker),
 * enriched with custom vehicle names from user_devices table.
 */
export async function GET(request) {
    try {
        let decodedToken;
        try {
            decodedToken = await verifyFirebaseToken(request);
        } catch (authErr) {
            return NextResponse.json({ error: authErr.message }, { status: authErr.status || 401 });
        }

        // Get user's device mapping from DB (traccar_id + custom names)
        const deviceMap = await getUserDeviceMap(decodedToken.uid);
        if (deviceMap.length === 0) return NextResponse.json([]);

        const traccarIdToMeta = new Map();
        for (const row of deviceMap) {
            traccarIdToMeta.set(Number(row.traccar_id), {
                vehicleName: row.vehicle_name,
                vehicleNumber: row.vehicle_number,
            });
        }

        // Read all devices from Redis (written by sync worker every 30s)
        const cached = await redis.get('trackpro:devices');
        if (!cached) return NextResponse.json([]);

        const allDevices = JSON.parse(cached);

        // Filter to user's devices + apply custom names
        const userDevices = allDevices
            .filter(d => traccarIdToMeta.has(d.id))
            .map(d => {
                const meta = traccarIdToMeta.get(d.id);
                return {
                    ...d,
                    name: meta.vehicleName || d.name,
                    vehicleNumber: meta.vehicleNumber || null,
                    imei: d.uniqueId,   // IMEI comes from Traccar's uniqueId field
                };
            });

        return NextResponse.json(userDevices);
    } catch (err) {
        console.error('[Devices] Error:', err.message);
        return NextResponse.json({ error: 'Failed to fetch devices' }, { status: 500 });
    }
}