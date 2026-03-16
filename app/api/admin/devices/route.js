import { NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/firebase-admin';
import { getAdminRole } from '@/lib/ownership';
import { query } from '@/lib/db';

/**
 * GET /api/admin/devices?status=all|unclaimed|active&page=1&search=
 * List all devices with owner info.
 *
 * POST /api/admin/devices
 * Body: { devices: [{ imei, traccarId, simNumber, deviceModel }] }
 * Bulk register new devices (you do this when you receive stock).
 */

export async function GET(request) {
    try {
        let decodedToken;
        try {
            decodedToken = await verifyFirebaseToken(request);
        } catch (authErr) {
            return NextResponse.json({ error: authErr.message }, { status: authErr.status || 401 });
        }

        const { isAdmin } = await getAdminRole(decodedToken.uid);
        if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

        const { searchParams } = new URL(request.url);
        const status = searchParams.get('status') || 'all';
        const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
        const limit = Math.min(100, parseInt(searchParams.get('limit') || '50'));
        const search = searchParams.get('search') || '';
        const offset = (page - 1) * limit;

        const conditions = [];
        const params = [];
        let i = 1;

        if (status !== 'all') { conditions.push(`d.status = $${i++}`); params.push(status); }
        if (search) { conditions.push(`(d.imei ILIKE $${i} OR ud.vehicle_name ILIKE $${i} OR ud.vehicle_number ILIKE $${i})`); params.push(`%${search}%`); i++; }

        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        params.push(limit, offset);

        const result = await query(
            `SELECT
                d.id, d.imei, d.traccar_id, d.status,
                d.device_model, d.sim_number, d.notes, d.created_at,
                ud.firebase_uid as owner_uid,
                ud.vehicle_name, ud.vehicle_number, ud.claimed_at,
                u.phone as owner_phone, u.email as owner_email, u.name as owner_name
             FROM devices d
             LEFT JOIN user_devices ud ON ud.device_id = d.id AND ud.is_active = TRUE
             LEFT JOIN users u ON u.firebase_uid = ud.firebase_uid
             ${where}
             ORDER BY d.created_at DESC
             LIMIT $${i} OFFSET $${i + 1}`,
            params
        );

        const countParams = conditions.length ? params.slice(0, -2) : [];
        const countResult = await query(
            `SELECT COUNT(*) FROM devices d
             LEFT JOIN user_devices ud ON ud.device_id = d.id AND ud.is_active = TRUE
             ${where}`,
            countParams
        );

        return NextResponse.json({
            devices: result.rows,
            total: parseInt(countResult.rows[0].count),
            page,
            limit,
        });
    } catch (err) {
        console.error('[Admin/Devices GET] Error:', err.message);
        return NextResponse.json({ error: 'Failed to fetch devices' }, { status: 500 });
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

        const { isAdmin } = await getAdminRole(decodedToken.uid);
        if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

        const body = await request.json();
        const { devices } = body;

        if (!Array.isArray(devices) || devices.length === 0)
            return NextResponse.json({ error: 'devices array is required' }, { status: 400 });

        if (devices.length > 500)
            return NextResponse.json({ error: 'Max 500 devices per batch' }, { status: 400 });

        const results = { inserted: 0, skipped: 0, errors: [] };

        for (const dev of devices) {
            const { imei, traccarId, simNumber, deviceModel, notes } = dev;

            if (!imei || !traccarId) {
                results.errors.push({ imei, error: 'imei and traccarId are required' });
                continue;
            }

            if (!/^\d{8,20}$/.test(String(imei).trim())) {
                results.errors.push({ imei, error: 'Invalid IMEI format' });
                continue;
            }

            try {
                await query(
                    `INSERT INTO devices (imei, traccar_id, sim_number, device_model, notes, status)
                     VALUES ($1, $2, $3, $4, $5, 'unclaimed')
                     ON CONFLICT (imei) DO NOTHING`,
                    [String(imei).trim(), traccarId, simNumber || null, deviceModel || null, notes || null]
                );
                results.inserted++;
            } catch (e) {
                results.skipped++;
                results.errors.push({ imei, error: e.message });
            }
        }

        return NextResponse.json(results, { status: 201 });
    } catch (err) {
        console.error('[Admin/Devices POST] Error:', err.message);
        return NextResponse.json({ error: 'Failed to register devices' }, { status: 500 });
    }
}