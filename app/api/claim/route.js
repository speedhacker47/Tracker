import { NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/firebase-admin';
import { query } from '@/lib/db';
import { upsertUser } from '@/lib/ownership';

/**
 * POST /api/claim
 * Body: { imei, vehicleName, vehicleNumber }
 *
 * Validates IMEI exists in devices table, is unclaimed,
 * user hasn't exceeded their plan limit, then assigns ownership.
 */
export async function POST(request) {
    try {
        let decodedToken;
        try {
            decodedToken = await verifyFirebaseToken(request);
        } catch (authErr) {
            return NextResponse.json({ error: authErr.message }, { status: authErr.status || 401 });
        }

        const body = await request.json();
        const { imei, vehicleName, vehicleNumber } = body;

        if (!imei || !imei.trim())
            return NextResponse.json({ error: 'IMEI is required' }, { status: 400 });

        const cleanImei = imei.trim();

        // Validate IMEI format (8-20 digits)
        if (!/^\d{8,20}$/.test(cleanImei))
            return NextResponse.json({ error: 'Invalid IMEI format. Must be 8-20 digits.' }, { status: 400 });

        // Upsert user record
        await upsertUser(decodedToken.uid, {
            phone: decodedToken.phone_number || null,
            email: decodedToken.email || null,
        });

        // Check device exists in our system
        const deviceResult = await query(
            'SELECT id, imei, traccar_id, status FROM devices WHERE imei = $1',
            [cleanImei]
        );

        if (deviceResult.rows.length === 0)
            return NextResponse.json({
                error: 'Device not found. Please check your IMEI number and try again.'
            }, { status: 404 });

        const device = deviceResult.rows[0];

        // Check device is not already claimed by someone else
        if (device.status === 'active') {
            // Check if it's claimed by THIS user (re-claim = update names)
            const existingOwnership = await query(
                'SELECT id FROM user_devices WHERE device_id = $1 AND firebase_uid = $2',
                [device.id, decodedToken.uid]
            );
            if (existingOwnership.rows.length === 0)
                return NextResponse.json({
                    error: 'This device is already registered to another account.'
                }, { status: 409 });

            // Update vehicle details for existing claim
            await query(
                `UPDATE user_devices
                 SET vehicle_name = $1, vehicle_number = $2
                 WHERE device_id = $3 AND firebase_uid = $4`,
                [vehicleName || null, vehicleNumber || null, device.id, decodedToken.uid]
            );
            return NextResponse.json({ success: true, message: 'Device details updated.', traccarId: device.traccar_id });
        }

        if (device.status === 'suspended')
            return NextResponse.json({ error: 'This device has been suspended. Contact support.' }, { status: 403 });

        if (device.status === 'decommissioned')
            return NextResponse.json({ error: 'This device is no longer active.' }, { status: 403 });

        // Check user's plan device limit
        const userResult = await query(
            'SELECT max_devices FROM users WHERE firebase_uid = $1',
            [decodedToken.uid]
        );
        const maxDevices = userResult.rows[0]?.max_devices ?? 5;

        const currentCount = await query(
            'SELECT COUNT(*) FROM user_devices WHERE firebase_uid = $1 AND is_active = TRUE',
            [decodedToken.uid]
        );
        const currentDevices = parseInt(currentCount.rows[0].count, 10);

        if (currentDevices >= maxDevices)
            return NextResponse.json({
                error: `You've reached your plan limit of ${maxDevices} devices. Please upgrade your plan.`
            }, { status: 403 });

        // All good — claim the device (transaction)
        await query('BEGIN', []);
        try {
            await query(
                `INSERT INTO user_devices (firebase_uid, device_id, vehicle_name, vehicle_number)
                 VALUES ($1, $2, $3, $4)`,
                [decodedToken.uid, device.id, vehicleName || null, vehicleNumber || null]
            );
            await query(
                `UPDATE devices SET status = 'active' WHERE id = $1`,
                [device.id]
            );
            await query('COMMIT', []);
        } catch (txErr) {
            await query('ROLLBACK', []);
            throw txErr;
        }

        return NextResponse.json({
            success: true,
            message: 'Device claimed successfully! It will appear in your dashboard.',
            traccarId: device.traccar_id,
            imei: device.imei,
        }, { status: 201 });

    } catch (err) {
        console.error('[Claim] Error:', err.message);
        return NextResponse.json({ error: 'Failed to claim device. Please try again.' }, { status: 500 });
    }
}