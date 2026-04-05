import { NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/firebase-admin';
import { query } from '@/lib/db';

const TRACCAR_URL = process.env.TRACCAR_INTERNAL_URL || 'http://traccar:8082';
const TRACCAR_USER = process.env.TRACCAR_USER;
const TRACCAR_PASS = process.env.TRACCAR_PASS;

function getAuthHeader() {
    return 'Basic ' + Buffer.from(`${TRACCAR_USER}:${TRACCAR_PASS}`).toString('base64');
}

async function findTraccarDeviceByImei(imei) {
    const res = await fetch(`${TRACCAR_URL}/api/devices`, {
        headers: { Authorization: getAuthHeader(), Accept: 'application/json' },
        cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Traccar error: ${res.status}`);
    const devices = await res.json();
    return devices.find(d => d.uniqueId === imei) || null;
}

/**
 * POST /api/claim
 * Body: { imei, vehicleName, vehicleNumber }
 *
 * Looks up device directly in Traccar by IMEI.
 * Auto-registers it in client_devices table if not already there.
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

        if (!/^\d{8,20}$/.test(cleanImei))
            return NextResponse.json({ error: 'Invalid IMEI format. Must be 8-20 digits.' }, { status: 400 });

        // Look up device in Traccar directly
        let traccarDevice;
        try {
            traccarDevice = await findTraccarDeviceByImei(cleanImei);
        } catch (e) {
            console.error('[Claim] Traccar lookup failed:', e.message);
            return NextResponse.json({ error: 'Could not connect to GPS server. Please try again.' }, { status: 503 });
        }

        if (!traccarDevice) {
            return NextResponse.json({
                error: 'Device not found. Please check your IMEI number and try again. Make sure the device has been registered in the system.'
            }, { status: 404 });
        }

        const traccarId = traccarDevice.id;

        // Check if already claimed by someone else
        const existingOwner = await query(
            `SELECT firebase_uid FROM client_devices WHERE traccar_device_id = $1`,
            [traccarId]
        );

        if (existingOwner.rows.length > 0) {
            const ownerUid = existingOwner.rows[0].firebase_uid;

            if (ownerUid !== decodedToken.uid) {
                return NextResponse.json({
                    error: 'This device is already registered to another account.'
                }, { status: 409 });
            }

            // Update vehicle details for existing claim
            await query(
                `UPDATE client_devices SET vehicle_name = $1, vehicle_number = $2 WHERE traccar_device_id = $3 AND firebase_uid = $4`,
                [vehicleName || null, vehicleNumber || null, traccarId, decodedToken.uid]
            );
            return NextResponse.json({
                success: true,
                message: 'Device details updated.',
                traccarId,
            });
        }

        // Claim the device
        await query(
            `INSERT INTO client_devices (firebase_uid, traccar_device_id, vehicle_name, vehicle_number)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (client_id, traccar_device_id) DO NOTHING`,
            [decodedToken.uid, traccarId, vehicleName || null, vehicleNumber || null]
        );

        return NextResponse.json({
            success: true,
            message: 'Device claimed successfully! It will appear in your dashboard.',
            traccarId,
            imei: cleanImei,
        }, { status: 201 });

    } catch (err) {
        console.error('[Claim] Error:', err.message);
        return NextResponse.json({ error: 'Failed to claim device. Please try again.' }, { status: 500 });
    }
}