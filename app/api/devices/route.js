import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { query } from '@/lib/db';
import { getDevices } from '@/lib/traccar';

/**
 * GET /api/devices
 *
 * Returns the logged-in client's assigned devices from Traccar,
 * enriched with custom vehicle names/numbers from client_devices table.
 */
export async function GET(request) {
    try {
        // ── Auth ──
        let tokenData;
        try {
            tokenData = verifyToken(request);
        } catch (authErr) {
            return NextResponse.json(
                { error: authErr.message },
                { status: authErr.status || 401 }
            );
        }

        // ── Get client's assigned device IDs ──
        const result = await query(
            'SELECT traccar_device_id, vehicle_name, vehicle_number FROM client_devices WHERE client_id = $1',
            [tokenData.userId]
        );

        const clientDeviceMap = new Map();
        for (const row of result.rows) {
            clientDeviceMap.set(row.traccar_device_id, {
                vehicleName: row.vehicle_name,
                vehicleNumber: row.vehicle_number,
            });
        }

        // ── Fetch all devices from Traccar ──
        const allDevices = await getDevices();

        // ── Filter to only client's devices and enrich with custom names ──
        const clientDevices = allDevices
            .filter((device) => clientDeviceMap.has(device.id))
            .map((device) => {
                const mapping = clientDeviceMap.get(device.id);
                return {
                    ...device,
                    name: mapping.vehicleName || device.name,
                    vehicleNumber: mapping.vehicleNumber || device.uniqueId,
                };
            });

        return NextResponse.json(clientDevices);
    } catch (err) {
        console.error('[Devices] Error:', err.message);
        return NextResponse.json(
            { error: 'Failed to fetch devices' },
            { status: 500 }
        );
    }
}
