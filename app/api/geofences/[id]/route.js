import { NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/firebase-admin';
import { deleteGeofence } from '@/lib/traccar';

/**
 * DELETE /api/geofences/[id]
 * Deletes a geofence from Traccar by ID.
 */
export async function DELETE(request, { params }) {
    try {
        let decodedToken;
        try {
            decodedToken = await verifyFirebaseToken(request);
        } catch (authErr) {
            return NextResponse.json({ error: authErr.message }, { status: authErr.status || 401 });
        }

        const id = parseInt(params.id, 10);
        if (isNaN(id)) {
            return NextResponse.json({ error: 'Invalid geofence ID' }, { status: 400 });
        }

        await deleteGeofence(id);

        return new NextResponse(null, { status: 204 });
    } catch (err) {
        console.error('[Geofences DELETE] Error:', err.message);
        return NextResponse.json({ error: 'Failed to delete geofence' }, { status: 500 });
    }
}