import { NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/firebase-admin';
import { getAdminRole } from '@/lib/ownership';
import { query } from '@/lib/db';
import { redis } from '@/lib/redis';

/**
 * GET /api/admin/stats
 * Master admin dashboard stats.
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
        if (!isAdmin)
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

        const [
            totalUsers,
            totalDevices,
            activeDevices,
            unclaimedDevices,
            suspendedDevices,
            newUsersToday,
            newUsersThisWeek,
        ] = await Promise.all([
            query('SELECT COUNT(*) FROM users'),
            query('SELECT COUNT(*) FROM devices'),
            query("SELECT COUNT(*) FROM devices WHERE status = 'active'"),
            query("SELECT COUNT(*) FROM devices WHERE status = 'unclaimed'"),
            query("SELECT COUNT(*) FROM devices WHERE status = 'suspended'"),
            query("SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL '1 day'"),
            query("SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL '7 days'"),
        ]);

        // Online devices count from Redis
        let onlineCount = 0;
        try {
            const cached = await redis.get('trackpro:positions');
            if (cached) {
                const positions = JSON.parse(cached);
                onlineCount = positions.filter(p => {
                    if (!p.fixTime) return false;
                    return (Date.now() - new Date(p.fixTime)) / 1000 < 300;
                }).length;
            }
        } catch (_) { }

        return NextResponse.json({
            users: {
                total: parseInt(totalUsers.rows[0].count),
                newToday: parseInt(newUsersToday.rows[0].count),
                newThisWeek: parseInt(newUsersThisWeek.rows[0].count),
            },
            devices: {
                total: parseInt(totalDevices.rows[0].count),
                active: parseInt(activeDevices.rows[0].count),
                unclaimed: parseInt(unclaimedDevices.rows[0].count),
                suspended: parseInt(suspendedDevices.rows[0].count),
                onlineNow: onlineCount,
            },
        });
    } catch (err) {
        console.error('[Admin/Stats] Error:', err.message);
        return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
    }
}