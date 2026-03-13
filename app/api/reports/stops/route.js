import { NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/firebase-admin';
import { query } from '@/lib/db';
import { getStops } from '@/lib/traccar';

/**
 * GET /api/reports/stops?deviceId=1&from=ISO&to=ISO
 *
 * Returns parking/stop events for a device.
 * Each stop includes address, arrival time, departure time, and duration.
 */
export async function GET(request) {
    try {
        let decodedToken;
        try {
            decodedToken = await verifyFirebaseToken(request);
        } catch (authErr) {
            return NextResponse.json({ error: authErr.message }, { status: authErr.status || 401 });
        }

        const { searchParams } = new URL(request.url);
        const deviceId = searchParams.get('deviceId');
        const from = searchParams.get('from');
        const to = searchParams.get('to');

        if (!deviceId || !from || !to) {
            return NextResponse.json({ error: 'Missing required params: deviceId, from, to' }, { status: 400 });
        }

        const deviceIdNum = parseInt(deviceId, 10);
        if (isNaN(deviceIdNum)) {
            return NextResponse.json({ error: 'deviceId must be a number' }, { status: 400 });
        }

        const fromDate = new Date(from);
        const toDate = new Date(to);
        if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
            return NextResponse.json({ error: 'Invalid date format. Use ISO 8601.' }, { status: 400 });
        }

        const diffDays = (toDate - fromDate) / (1000 * 60 * 60 * 24);
        if (diffDays > 31) {
            return NextResponse.json({ error: 'Date range cannot exceed 31 days' }, { status: 400 });
        }

        const ownership = await query(
            'SELECT id FROM client_devices WHERE firebase_uid = $1 AND traccar_device_id = $2',
            [decodedToken.uid, deviceIdNum]
        );
        if (ownership.rows.length === 0) {
            return NextResponse.json({ error: 'Access denied to this device' }, { status: 403 });
        }

        const stops = await getStops(deviceIdNum, fromDate, toDate);

        return NextResponse.json(stops);
    } catch (err) {
        console.error('[Reports/Stops] Error:', err.message);
        return NextResponse.json({ error: 'Failed to fetch stops' }, { status: 500 });
    }
}