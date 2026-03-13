import { NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/firebase-admin';
import { query } from '@/lib/db';
import { getEvents } from '@/lib/traccar';

/**
 * GET /api/reports/events?deviceId=1&from=ISO&to=ISO&type=alarm
 *
 * Returns event log for a device. Optional ?type= filter.
 * Event types: alarm, ignitionOn, ignitionOff, deviceOnline, deviceOffline,
 *   geofenceEnter, geofenceExit, overspeed, etc.
 *
 * alarm events have attributes.alarm = 'sos' | 'powerCut' | 'overspeed' | 'hardBraking' | etc.
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
        const type = searchParams.get('type') || null; // optional filter

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

        const events = await getEvents(deviceIdNum, fromDate, toDate, type);

        // Sort newest first
        events.sort((a, b) => new Date(b.eventTime) - new Date(a.eventTime));

        return NextResponse.json(events);
    } catch (err) {
        console.error('[Reports/Events] Error:', err.message);
        return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
    }
}