import { query } from '@/lib/db';

export async function getUserTraccarIds(firebaseUid) {
    const result = await query(
        `SELECT traccar_device_id FROM client_devices WHERE firebase_uid = $1`,
        [firebaseUid]
    );
    return new Set(result.rows.map(r => Number(r.traccar_device_id)));
}

export async function getUserDeviceMap(firebaseUid) {
    const result = await query(
        `SELECT traccar_device_id, vehicle_name, vehicle_number FROM client_devices WHERE firebase_uid = $1`,
        [firebaseUid]
    );
    return result.rows.map(r => ({
        traccar_id: r.traccar_device_id,
        vehicle_name: r.vehicle_name,
        vehicle_number: r.vehicle_number,
        imei: r.vehicle_number
    }));
}

export async function userOwnsTraccarDevice(firebaseUid, traccarId) {
    const result = await query(
        `SELECT 1 FROM client_devices WHERE firebase_uid = $1 AND traccar_device_id = $2`,
        [firebaseUid, traccarId]
    );
    return result.rows.length > 0;
}

export async function upsertUser() { return; }
export async function getAdminRole() { return { isAdmin: false }; }