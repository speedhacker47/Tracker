import { NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/firebase-admin';
import { getAdminRole } from '@/lib/ownership';
import { query } from '@/lib/db';

/**
 * GET /api/admin/users/[id] — user detail with their devices
 * PATCH /api/admin/users/[id] — update user (suspend, plan, max_devices)
 */

export async function GET(request, { params }) {
    try {
        let decodedToken;
        try {
            decodedToken = await verifyFirebaseToken(request);
        } catch (authErr) {
            return NextResponse.json({ error: authErr.message }, { status: authErr.status || 401 });
        }

        const { isAdmin } = await getAdminRole(decodedToken.uid);
        if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

        const firebaseUid = params.id;

        const [userResult, devicesResult] = await Promise.all([
            query('SELECT * FROM users WHERE firebase_uid = $1', [firebaseUid]),
            query(
                `SELECT d.id, d.imei, d.traccar_id, d.status as device_status,
                        d.device_model, d.sim_number,
                        ud.vehicle_name, ud.vehicle_number, ud.claimed_at, ud.is_active
                 FROM user_devices ud
                 JOIN devices d ON d.id = ud.device_id
                 WHERE ud.firebase_uid = $1
                 ORDER BY ud.claimed_at DESC`,
                [firebaseUid]
            ),
        ]);

        if (userResult.rows.length === 0)
            return NextResponse.json({ error: 'User not found' }, { status: 404 });

        return NextResponse.json({
            user: userResult.rows[0],
            devices: devicesResult.rows,
        });
    } catch (err) {
        console.error('[Admin/User Detail] Error:', err.message);
        return NextResponse.json({ error: 'Failed to fetch user' }, { status: 500 });
    }
}

export async function PATCH(request, { params }) {
    try {
        let decodedToken;
        try {
            decodedToken = await verifyFirebaseToken(request);
        } catch (authErr) {
            return NextResponse.json({ error: authErr.message }, { status: authErr.status || 401 });
        }

        const { isAdmin } = await getAdminRole(decodedToken.uid);
        if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

        const firebaseUid = params.id;
        const body = await request.json();
        const { is_suspended, plan, max_devices } = body;

        const updates = [];
        const values = [];
        let i = 1;

        if (is_suspended !== undefined) { updates.push(`is_suspended = $${i++}`); values.push(is_suspended); }
        if (plan !== undefined) { updates.push(`plan = $${i++}`); values.push(plan); }
        if (max_devices !== undefined) { updates.push(`max_devices = $${i++}`); values.push(max_devices); }

        if (updates.length === 0)
            return NextResponse.json({ error: 'No fields to update' }, { status: 400 });

        values.push(firebaseUid);
        await query(
            `UPDATE users SET ${updates.join(', ')} WHERE firebase_uid = $${i}`,
            values
        );

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('[Admin/User Patch] Error:', err.message);
        return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
    }
}