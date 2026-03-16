import { NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/firebase-admin';
import { getTrips } from '@/lib/traccar';

import { userOwnsTraccarDevice } from '@/lib/ownership';

/**
 * GET /api/reports/trips?deviceId=1&from=ISO&to=ISO
 *
 * Returns Traccar auto-detected trips for a device.
 * Traccar analyses position history and groups movement into trips automatically.
 */
export async function GET(request) {
    try {
        // ── Auth ──
        let decodedToken;
        try {
            decodedToken = await verifyFirebaseToken(request);
        } catch (authErr) {
            return NextResponse.json({ error: authErr.message }, { status: authErr.status || 401 });
        }

        // ── Params ──
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

        // ── Validate dates ──
        const fromDate = new Date(from);
        const toDate = new Date(to);
        if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
            return NextResponse.json({ error: 'Invalid date format. Use ISO 8601.' }, { status: 400 });
        }

        const diffDays = (toDate - fromDate) / (1000 * 60 * 60 * 24);
        if (diffDays > 31) {
            return NextResponse.json({ error: 'Date range cannot exceed 31 days' }, { status: 400 });
        }

        // ── Ownership check ──
        const { userOwnsTraccarDevice } = await import('@/lib/ownership');
        const owns = await userOwnsTraccarDevice(decodedToken.uid, deviceIdNum);
        if (!owns) return NextResponse.json({ error: 'Access denied to this device' }, { status: 403 });

        // ── Fetch from Traccar ──
        const trips = await getTrips(deviceIdNum, fromDate, toDate);

        return NextResponse.json(trips);
    } catch (err) {
        console.error('[Reports/Trips] Error:', err.message);
        return NextResponse.json({ error: 'Failed to fetch trips' }, { status: 500 });
    }
}