import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { query } from '@/lib/db';
import { redis } from '@/lib/redis';
import { getPositions } from '@/lib/traccar';

/**
 * GET /api/positions
 *
 * Returns current positions for the logged-in client's devices.
 * Uses Redis caching (30s TTL) to reduce Traccar API load.
 *
 * Cache strategy:
 *  - All positions from Traccar are cached globally (shared across clients)
 *  - Filtering per-client happens after cache retrieval
 *  - 30s TTL balances freshness vs. API load for 1000+ devices
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
            'SELECT traccar_device_id FROM client_devices WHERE client_id = $1',
            [tokenData.userId]
        );

        const clientDeviceIds = new Set(result.rows.map((r) => r.traccar_device_id));

        // ── Check Redis cache ──
        const CACHE_KEY = 'trackpro:positions';
        let positions = null;

        try {
            const cached = await redis.get(CACHE_KEY);
            if (cached) {
                // ioredis always returns strings — parse to get the array back
                positions = typeof cached === 'string' ? JSON.parse(cached) : cached;
            }
        } catch (cacheErr) {
            console.warn('[Positions] Redis read error:', cacheErr.message);
            // Continue without cache — don't fail the request
        }

        // ── Cache miss: fetch from Traccar ──
        if (!positions) {
            positions = await getPositions();

            // Cache for 30 seconds
            try {
                await redis.set(CACHE_KEY, JSON.stringify(positions), 'EX', 30);
            } catch (cacheErr) {
                console.warn('[Positions] Redis write error:', cacheErr.message);
            }
        }

        // ── Filter positions to only client's devices ──
        const clientPositions = positions.filter((pos) => clientDeviceIds.has(pos.deviceId));

        return NextResponse.json(clientPositions);
    } catch (err) {
        console.error('[Positions] Error:', err.message);
        return NextResponse.json(
            { error: 'Failed to fetch positions' },
            { status: 500 }
        );
    }
}
