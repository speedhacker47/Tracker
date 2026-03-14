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

        // Get client's device mapping from DB
        const result = await query(
            'SELECT traccar_device_id, vehicle_name, vehicle_number FROM client_devices WHERE firebase_uid = $1',
            [decodedToken.uid]
        );

        if (result.rows.length === 0) return NextResponse.json([]);

        const clientDeviceIds = new Set(result.rows.map(r => Number(r.traccar_device_id)));

        // Custom names map: traccar_id → {vehicle_name, vehicle_number}
        const nameMap = {};
        for (const row of result.rows) {
            nameMap[Number(row.traccar_device_id)] = {
                vehicle_name: row.vehicle_name,
                vehicle_number: row.vehicle_number,
            };
        }

        // Read all devices from Redis — written by sync worker every 30s
        const cached = await redis.get('trackpro:devices');
        if (!cached) return NextResponse.json([]);

        const allDevices = JSON.parse(cached);

        // Filter to client's devices + apply custom names
        const clientDevices = allDevices
            .filter(d => clientDeviceIds.has(d.id))
            .map(d => ({
                ...d,
                name: nameMap[d.id]?.vehicle_name || d.name,
                vehicleNumber: nameMap[d.id]?.vehicle_number || null,
            }));

        return NextResponse.json(clientDevices);

    } catch (err) {
        console.error('[Devices] Error:', err.message);
        return NextResponse.json({ error: 'Failed to fetch devices' }, { status: 500 });
    }
}