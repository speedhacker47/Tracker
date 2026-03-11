import { NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/firebase-admin';
import { query } from '@/lib/db';
import { getDevicePositions } from '@/lib/traccar';

/**
 * GET /api/history?deviceId=1&from=2026-03-05T00:00:00Z&to=2026-03-06T00:00:00Z
 *
 * Fetches historical positions from Traccar for a specific device.
 * Verifies that the requested device belongs to the logged-in client.
 */
export async function GET(request) {
    try {
        // ── Auth (Firebase) ──
        let decodedToken;
        try {
            decodedToken = await verifyFirebaseToken(request);
        } catch (authErr) {
            return NextResponse.json(
                { error: authErr.message },
                { status: authErr.status || 401 }
            );
        }

        // ── Parse query params ──
        const { searchParams } = new URL(request.url);
        const deviceId = searchParams.get('deviceId');
        const from = searchParams.get('from');
        const to = searchParams.get('to');

        if (!deviceId || !from || !to) {
            return NextResponse.json(
                { error: 'Missing required params: deviceId, from, to' },
                { status: 400 }
            );
        }

        const deviceIdNum = parseInt(deviceId, 10);
        if (isNaN(deviceIdNum)) {
            return NextResponse.json(
                { error: 'deviceId must be a number' },
                { status: 400 }
            );
        }

        // ── Verify device ownership ──
        const ownershipCheck = await query(
            'SELECT id FROM client_devices WHERE firebase_uid = $1 AND traccar_device_id = $2',
            [decodedToken.uid, deviceIdNum]
        );

        if (ownershipCheck.rows.length === 0) {
            return NextResponse.json(
                { error: 'You do not have access to this device' },
                { status: 403 }
            );
        }

        // ── Validate date range ──
        const fromDate = new Date(from);
        const toDate = new Date(to);

        if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
            return NextResponse.json(
                { error: 'Invalid date format. Use ISO 8601.' },
                { status: 400 }
            );
        }

        // Prevent excessively large date ranges (max 7 days)
        const diffDays = (toDate - fromDate) / (1000 * 60 * 60 * 24);
        if (diffDays > 7) {
            return NextResponse.json(
                { error: 'Date range cannot exceed 7 days' },
                { status: 400 }
            );
        }

        // ── Fetch from Traccar ──
        const positions = await getDevicePositions(deviceIdNum, fromDate, toDate);

        // Sort by fixTime ascending
        positions.sort((a, b) => new Date(a.fixTime) - new Date(b.fixTime));

        return NextResponse.json(positions);
    } catch (err) {
        console.error('[History] Error:', err.message);
        return NextResponse.json(
            { error: 'Failed to fetch route history' },
            { status: 500 }
        );
    }
}
