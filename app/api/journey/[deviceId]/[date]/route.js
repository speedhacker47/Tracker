import { NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/firebase-admin';
import { userOwnsTraccarDevice } from '@/lib/ownership';
import { query } from '@/lib/db';

/**
 * GET /api/journey/[deviceId]/[date]
 *
 * Returns all done segments (with road-snapped points) and stops
 * for a device on a given date.
 *
 * Params:
 *   deviceId — Traccar device ID
 *   date     — YYYY-MM-DD
 */
export async function GET(request, { params }) {
    try {
        let decodedToken;
        try {
            decodedToken = await verifyFirebaseToken(request);
        } catch (authErr) {
            return NextResponse.json({ error: authErr.message }, { status: authErr.status || 401 });
        }

        const { deviceId, date } = await params;
        const deviceIdNum = parseInt(deviceId, 10);
        if (isNaN(deviceIdNum))
            return NextResponse.json({ error: 'deviceId must be a number' }, { status: 400 });

        // Validate date format
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
            return NextResponse.json({ error: 'Date must be YYYY-MM-DD format' }, { status: 400 });

        const dateObj = new Date(date + 'T00:00:00');
        if (isNaN(dateObj.getTime()))
            return NextResponse.json({ error: 'Invalid date' }, { status: 400 });

        // Ownership check
        const owns = await userOwnsTraccarDevice(decodedToken.uid, deviceIdNum);
        if (!owns)
            return NextResponse.json({ error: 'You do not have access to this device' }, { status: 403 });

        // Date boundaries (full day in UTC)
        const dayStart = date + 'T00:00:00.000Z';
        const dayEnd   = date + 'T23:59:59.999Z';

        // Fetch completed segments for this day
        const segResult = await query(`
            SELECT id, device_id, started_at, ended_at, distance_meters, status
            FROM journey_segments
            WHERE device_id = $1
              AND started_at >= $2
              AND started_at <= $3
              AND status = 'done'
            ORDER BY started_at ASC
        `, [deviceIdNum, dayStart, dayEnd]);

        // Fetch points for each segment
        const segments = [];
        for (const seg of segResult.rows) {
            const ptResult = await query(`
                SELECT sequence, latitude, longitude, timestamp
                FROM journey_segment_points
                WHERE segment_id = $1
                ORDER BY sequence ASC
            `, [seg.id]);

            segments.push({
                id: seg.id,
                startedAt: seg.started_at,
                endedAt: seg.ended_at,
                distanceMeters: Number(seg.distance_meters),
                points: ptResult.rows.map(r => ({
                    seq: r.sequence,
                    lat: Number(r.latitude),
                    lng: Number(r.longitude),
                    timestamp: r.timestamp,
                })),
            });
        }

        // Fetch stops for this day  
        const stopResult = await query(`
            SELECT id, arrived_at, departed_at, latitude, longitude, duration_seconds
            FROM journey_stops
            WHERE device_id = $1
              AND arrived_at >= $2
              AND arrived_at <= $3
            ORDER BY arrived_at ASC
        `, [deviceIdNum, dayStart, dayEnd]);

        const stops = stopResult.rows.map(r => ({
            id: r.id,
            arrivedAt: r.arrived_at,
            departedAt: r.departed_at,
            lat: Number(r.latitude),
            lng: Number(r.longitude),
            durationSeconds: r.duration_seconds,
        }));

        // Summary
        const totalDistanceM = segments.reduce((s, seg) => s + seg.distanceMeters, 0);
        const totalDrivingSec = segments.reduce((s, seg) => {
            return s + (new Date(seg.endedAt) - new Date(seg.startedAt)) / 1000;
        }, 0);
        const totalStoppedSec = stops.reduce((s, st) => s + (st.durationSeconds || 0), 0);

        return NextResponse.json({
            segments,
            stops,
            summary: {
                totalDistanceKm: Math.round(totalDistanceM / 10) / 100,
                totalDrivingMinutes: Math.round(totalDrivingSec / 60),
                totalStoppedMinutes: Math.round(totalStoppedSec / 60),
                segmentCount: segments.length,
                stopCount: stops.length,
            },
        });

    } catch (err) {
        console.error('[Journey API] Error:', err.message);
        return NextResponse.json({ error: 'Failed to fetch journey data' }, { status: 500 });
    }
}
