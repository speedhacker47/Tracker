import { NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/firebase-admin';
import { query } from '@/lib/db';

const TRACCAR_URL = process.env.TRACCAR_INTERNAL_URL || 'http://traccar:8082';
const TRACCAR_USER = process.env.TRACCAR_USER;
const TRACCAR_PASS = process.env.TRACCAR_PASS;

function getAuthHeader() {
    return 'Basic ' + Buffer.from(`${TRACCAR_USER}:${TRACCAR_PASS}`).toString('base64');
}

const TRACCAR_HEADERS = {
    Authorization: getAuthHeader(),
    'Content-Type': 'application/json',
    Accept: 'application/json',
};

/**
 * Find a device in Traccar by IMEI (uniqueId).
 * Returns the device object or null if not found.
 */
async function findTraccarDeviceByImei(imei) {
    const res = await fetch(`${TRACCAR_URL}/api/devices?uniqueId=${encodeURIComponent(imei)}`, {
        headers: TRACCAR_HEADERS,
        cache: 'no-store',
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Traccar lookup failed (${res.status}): ${text}`);
    }

    const devices = await res.json();
    // Traccar may return all devices when query param is not strict — find exact match
    const exact = Array.isArray(devices) ? devices.find(d => d.uniqueId === imei) : null;
    return exact || null;
}

/**
 * Create a new device in Traccar with the given IMEI.
 * Returns the created device object including its new id.
 */
async function createTraccarDevice(imei, name) {
    const deviceName = name?.trim() || `Device ${imei.slice(-6)}`;

    const res = await fetch(`${TRACCAR_URL}/api/devices`, {
        method: 'POST',
        headers: TRACCAR_HEADERS,
        body: JSON.stringify({ name: deviceName, uniqueId: imei }),
        cache: 'no-store',
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Traccar create device failed (${res.status}): ${text}`);
    }

    return res.json();
}

/**
 * POST /api/claim
 * Body: { imei, vehicleName, vehicleNumber }
 *
 * 1. Looks up device in Traccar by IMEI.
 * 2. If not found, automatically creates it in Traccar.
 * 3. Registers the device under the current Firebase user in our DB.
 */
export async function POST(request) {
    try {
        // — Auth check —
        let decodedToken;
        try {
            decodedToken = await verifyFirebaseToken(request);
        } catch (authErr) {
            return NextResponse.json({ error: authErr.message }, { status: authErr.status || 401 });
        }

        const body = await request.json();
        const { imei, vehicleName, vehicleNumber } = body;

        if (!imei || !imei.trim()) {
            return NextResponse.json({ error: 'IMEI is required' }, { status: 400 });
        }

        const cleanImei = imei.trim();

        if (!/^\d{8,20}$/.test(cleanImei)) {
            return NextResponse.json({ error: 'Invalid IMEI format. Must be 8–20 digits.' }, { status: 400 });
        }

        const cleanName = vehicleName?.trim() || null;
        const cleanNumber = vehicleNumber?.trim() || null;

        // — Find or create device in Traccar —
        let traccarDevice;
        let createdInTraccar = false;

        try {
            traccarDevice = await findTraccarDeviceByImei(cleanImei);
        } catch (e) {
            console.error('[Claim] Traccar lookup failed:', e.message);
            return NextResponse.json(
                { error: 'Could not connect to GPS server. Please try again.' },
                { status: 503 }
            );
        }

        if (!traccarDevice) {
            // Auto-create device in Traccar
            try {
                traccarDevice = await createTraccarDevice(cleanImei, cleanName);
                createdInTraccar = true;
                console.log(`[Claim] Created Traccar device id=${traccarDevice.id} imei=${cleanImei}`);
            } catch (e) {
                console.error('[Claim] Traccar device creation failed:', e.message);
                return NextResponse.json(
                    { error: 'Failed to register device in GPS server. Please try again.' },
                    { status: 502 }
                );
            }
        }

        const traccarId = traccarDevice.id;

        // — Check if already claimed by someone else —
        const existingOwner = await query(
            `SELECT firebase_uid FROM client_devices WHERE traccar_device_id = $1`,
            [traccarId]
        );

        if (existingOwner.rows.length > 0) {
            const ownerUid = existingOwner.rows[0].firebase_uid;

            if (ownerUid !== decodedToken.uid) {
                return NextResponse.json(
                    { error: 'This device is already registered to another account.' },
                    { status: 409 }
                );
            }

            // Same user — update vehicle details
            await query(
                `UPDATE client_devices
                 SET vehicle_name = $1, vehicle_number = $2
                 WHERE traccar_device_id = $3 AND firebase_uid = $4`,
                [cleanName, cleanNumber, traccarId, decodedToken.uid]
            );

            return NextResponse.json({
                success: true,
                message: 'Device details updated successfully.',
                traccarId,
                imei: cleanImei,
            });
        }

        // — Claim the device (insert into our DB) —
        // UNIQUE constraint is (firebase_uid, traccar_device_id)
        await query(
            `INSERT INTO client_devices (firebase_uid, traccar_device_id, vehicle_name, vehicle_number)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (firebase_uid, traccar_device_id) DO UPDATE
               SET vehicle_name = EXCLUDED.vehicle_name,
                   vehicle_number = EXCLUDED.vehicle_number`,
            [decodedToken.uid, traccarId, cleanName, cleanNumber]
        );

        const message = createdInTraccar
            ? 'Device registered and added successfully! It will appear in your dashboard.'
            : 'Device claimed successfully! It will appear in your dashboard.';

        return NextResponse.json({
            success: true,
            message,
            traccarId,
            imei: cleanImei,
            createdInTraccar,
        }, { status: 201 });

    } catch (err) {
        console.error('[Claim] Unexpected error:', err.message, err.stack);
        return NextResponse.json({ error: 'Failed to claim device. Please try again.' }, { status: 500 });
    }
}