import { NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/firebase-admin';
import { getAdminRole } from '@/lib/ownership';
import { query } from '@/lib/db';

/**
 * PATCH /api/admin/devices/[id] — update device (status, notes, model, sim)
 * DELETE /api/admin/devices/[id] — remove device from system
 */

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

        const deviceId = parseInt(params.id, 10);
        const body = await request.json();
        const { status, notes, device_model, sim_number } = body;

        const validStatuses = ['unclaimed', 'active', 'suspended', 'decommissioned'];
        if (status && !validStatuses.includes(status))
            return NextResponse.json({ error: `Invalid status. Must be: ${validStatuses.join(', ')}` }, { status: 400 });

        const updates = [];
        const values = [];
        let i = 1;

        if (status !== undefined) { updates.push(`status = $${i++}`); values.push(status); }
        if (notes !== undefined) { updates.push(`notes = $${i++}`); values.push(notes); }
        if (device_model !== undefined) { updates.push(`device_model = $${i++}`); values.push(device_model); }
        if (sim_number !== undefined) { updates.push(`sim_number = $${i++}`); values.push(sim_number); }

        if (updates.length === 0)
            return NextResponse.json({ error: 'No fields to update' }, { status: 400 });

        // If suspending/decommissioning, also deactivate user_devices
        if (status === 'suspended' || status === 'decommissioned') {
            await query('UPDATE user_devices SET is_active = FALSE WHERE device_id = $1', [deviceId]);
        }
        // If restoring to unclaimed, remove ownership
        if (status === 'unclaimed') {
            await query('DELETE FROM user_devices WHERE device_id = $1', [deviceId]);
        }

        values.push(deviceId);
        await query(`UPDATE devices SET ${updates.join(', ')} WHERE id = $${i}`, values);

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('[Admin/Device PATCH] Error:', err.message);
        return NextResponse.json({ error: 'Failed to update device' }, { status: 500 });
    }
}

export async function DELETE(request, { params }) {
    try {
        let decodedToken;
        try {
            decodedToken = await verifyFirebaseToken(request);
        } catch (authErr) {
            return NextResponse.json({ error: authErr.message }, { status: authErr.status || 401 });
        }

        const { isAdmin, role } = await getAdminRole(decodedToken.uid);
        if (!isAdmin || role !== 'superadmin')
            return NextResponse.json({ error: 'Forbidden — superadmin only' }, { status: 403 });

        const deviceId = parseInt(params.id, 10);
        await query('DELETE FROM user_devices WHERE device_id = $1', [deviceId]);
        await query('DELETE FROM devices WHERE id = $1', [deviceId]);

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('[Admin/Device DELETE] Error:', err.message);
        return NextResponse.json({ error: 'Failed to delete device' }, { status: 500 });
    }
}