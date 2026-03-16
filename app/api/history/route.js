import { NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/firebase-admin';
import { userOwnsTraccarDevice } from '@/lib/ownership';
import { getDevicePositions } from '@/lib/traccar';

/**
 * GET /api/history?deviceId=1&from=ISO&to=ISO
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

        if (!deviceId || !from || !to)
            return NextResponse.json({ error: 'Missing required params: deviceId, from, to' }, { status: 400 });

        const deviceIdNum = parseInt(deviceId, 10);
        if (isNaN(deviceIdNum))
            return NextResponse.json({ error: 'deviceId must be a number' }, { status: 400 });

        const fromDate = new Date(from);
        const toDate = new Date(to);
        if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime()))
            return NextResponse.json({ error: 'Invalid date format. Use ISO 8601.' }, { status: 400 });

        const diffDays = (toDate - fromDate) / (1000 * 60 * 60 * 24);
        if (diffDays > 7)
            return NextResponse.json({ error: 'Date range cannot exceed 7 days' }, { status: 400 });

        // Ownership check using new schema
        const owns = await userOwnsTraccarDevice(decodedToken.uid, deviceIdNum);
        if (!owns)
            return NextResponse.json({ error: 'You do not have access to this device' }, { status: 403 });

        const positions = await getDevicePositions(deviceIdNum, fromDate, toDate);
        positions.sort((a, b) => new Date(a.fixTime) - new Date(b.fixTime));
        return NextResponse.json(positions);

    } catch (err) {
        console.error('[History] Error:', err.message);
        return NextResponse.json({ error: 'Failed to fetch route history' }, { status: 500 });
    }
}