/**
 * Device ownership helpers — new schema (user_devices + devices)
 * Used by all API routes that need to verify a user owns a device.
 */

import { query } from '@/lib/db';

/**
 * Get all traccar_ids owned by a firebase user.
 * Returns a Set<number> of traccar device IDs.
 */
export async function getUserTraccarIds(firebaseUid) {
    const result = await query(
        `SELECT d.traccar_id
         FROM user_devices ud
         JOIN devices d ON d.id = ud.device_id
         WHERE ud.firebase_uid = $1 AND ud.is_active = TRUE`,
        [firebaseUid]
    );
    return new Set(result.rows.map(r => Number(r.traccar_id)));
}

/**
 * Get full device mapping for a user.
 * Returns array of { traccar_id, vehicle_name, vehicle_number, device_id, imei }
 */
export async function getUserDeviceMap(firebaseUid) {
    const result = await query(
        `SELECT d.traccar_id, d.imei, d.id as device_id,
                ud.vehicle_name, ud.vehicle_number
         FROM user_devices ud
         JOIN devices d ON d.id = ud.device_id
         WHERE ud.firebase_uid = $1 AND ud.is_active = TRUE`,
        [firebaseUid]
    );
    return result.rows;
}

/**
 * Check if a user owns a specific traccar device ID.
 * Returns boolean.
 */
export async function userOwnsTraccarDevice(firebaseUid, traccarId) {
    const result = await query(
        `SELECT 1
         FROM user_devices ud
         JOIN devices d ON d.id = ud.device_id
         WHERE ud.firebase_uid = $1 AND d.traccar_id = $2 AND ud.is_active = TRUE`,
        [firebaseUid, traccarId]
    );
    return result.rows.length > 0;
}

/**
 * Ensure user exists in users table (upsert on login).
 * Call this from auth-dependent routes when you have user info.
 */
export async function upsertUser(firebaseUid, { phone, email, name } = {}) {
    await query(
        `INSERT INTO users (firebase_uid, phone, email, name, last_login)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (firebase_uid) DO UPDATE
         SET last_login = NOW(),
             phone = COALESCE(EXCLUDED.phone, users.phone),
             email = COALESCE(EXCLUDED.email, users.email),
             name  = COALESCE(EXCLUDED.name,  users.name)`,
        [firebaseUid, phone || null, email || null, name || null]
    );
}

/**
 * Check if a firebase user is an admin.
 * Returns { isAdmin, role } or { isAdmin: false }
 */
export async function getAdminRole(firebaseUid) {
    const result = await query(
        'SELECT role FROM admins WHERE firebase_uid = $1',
        [firebaseUid]
    );
    if (result.rows.length === 0) return { isAdmin: false };
    return { isAdmin: true, role: result.rows[0].role };
}