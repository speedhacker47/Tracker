import { NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/firebase-admin';
import { getAdminRole } from '@/lib/ownership';
import { query } from '@/lib/db';

/**
 * GET /api/admin/users?page=1&limit=50&search=
 * List all users with device counts.
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
        const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
        const limit = Math.min(100, parseInt(searchParams.get('limit') || '50'));
        const search = searchParams.get('search') || '';
        const offset = (page - 1) * limit;

        let usersResult, countResult;

        if (search) {
            usersResult = await query(
                `SELECT
                    u.firebase_uid, u.phone, u.email, u.name,
                    u.plan, u.max_devices, u.is_suspended,
                    u.created_at, u.last_login,
                    COUNT(ud.id)::int as device_count
                 FROM users u
                 LEFT JOIN user_devices ud ON ud.firebase_uid = u.firebase_uid AND ud.is_active = TRUE
                 WHERE u.phone ILIKE $3 OR u.email ILIKE $3 OR u.name ILIKE $3
                 GROUP BY u.firebase_uid, u.phone, u.email, u.name, u.plan, u.max_devices, u.is_suspended, u.created_at, u.last_login
                 ORDER BY u.created_at DESC
                 LIMIT $1 OFFSET $2`,
                [limit, offset, `%${search}%`]
            );
            countResult = await query(
                `SELECT COUNT(*) FROM users u
                 WHERE u.phone ILIKE $1 OR u.email ILIKE $1 OR u.name ILIKE $1`,
                [`%${search}%`]
            );
        } else {
            usersResult = await query(
                `SELECT
                    u.firebase_uid, u.phone, u.email, u.name,
                    u.plan, u.max_devices, u.is_suspended,
                    u.created_at, u.last_login,
                    COUNT(ud.id)::int as device_count
                 FROM users u
                 LEFT JOIN user_devices ud ON ud.firebase_uid = u.firebase_uid AND ud.is_active = TRUE
                 GROUP BY u.firebase_uid, u.phone, u.email, u.name, u.plan, u.max_devices, u.is_suspended, u.created_at, u.last_login
                 ORDER BY u.created_at DESC
                 LIMIT $1 OFFSET $2`,
                [limit, offset]
            );
            countResult = await query('SELECT COUNT(*) FROM users', []);
        }

        return NextResponse.json({
            users: usersResult.rows,
            total: parseInt(countResult.rows[0].count),
            page,
            limit,
        });
    } catch (err) {
        console.error('[Admin/Users] Error:', err.message);
        return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
    }
}