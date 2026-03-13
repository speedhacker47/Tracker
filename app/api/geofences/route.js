import { NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/firebase-admin';
import { getGeofences, createGeofence } from '@/lib/traccar';

/**
 * GET /api/geofences
 * Returns all geofences from Traccar.
 *
 * POST /api/geofences
 * Body: { name, description?, area }
 * area is WKT format:
 *   Circle:  "CIRCLE (lat lon, radiusMeters)"
 *   Polygon: "POLYGON ((lon lat, lon lat, lon lat, lon lat))"
 */

export async function GET(request) {
    try {
        let decodedToken;
        try {
            decodedToken = await verifyFirebaseToken(request);
        } catch (authErr) {
            return NextResponse.json({ error: authErr.message }, { status: authErr.status || 401 });
        }

        const geofences = await getGeofences();
        return NextResponse.json(geofences);
    } catch (err) {
        console.error('[Geofences] GET Error:', err.message);
        return NextResponse.json({ error: 'Failed to fetch geofences' }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        let decodedToken;
        try {
            decodedToken = await verifyFirebaseToken(request);
        } catch (authErr) {
            return NextResponse.json({ error: authErr.message }, { status: authErr.status || 401 });
        }

        const body = await request.json();
        const { name, description, area } = body;

        if (!name || !area) {
            return NextResponse.json({ error: 'Missing required fields: name, area' }, { status: 400 });
        }

        const geofence = await createGeofence({ name, description, area });
        return NextResponse.json(geofence, { status: 201 });
    } catch (err) {
        console.error('[Geofences] POST Error:', err.message);
        return NextResponse.json({ error: 'Failed to create geofence' }, { status: 500 });
    }
}