import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { getPositions } from '@/lib/traccar';

const JWT_SECRET = process.env.JWT_SECRET || 'trackpro-dev-secret-change-in-production';

/**
 * GET /api/positions
 * 
 * Proxies to Traccar /api/positions.
 * Requires valid JWT in Authorization header.
 * 
 * Phase 2: Add Upstash Redis caching layer.
 * Phase 2: Filter positions by client's devices.
 */
export async function GET(request) {
    try {
        // Verify JWT
        const authHeader = request.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.split(' ')[1];
        try {
            jwt.verify(token, JWT_SECRET);
        } catch {
            return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
        }

        // ============================================
        // Phase 2: Check Redis cache first
        // ============================================
        // const { Redis } = require('@upstash/redis');
        // const redis = new Redis({
        //   url: process.env.UPSTASH_REDIS_REST_URL,
        //   token: process.env.UPSTASH_REDIS_REST_TOKEN,
        // });
        // 
        // const cached = await redis.get('trackpro:positions');
        // if (cached) {
        //   return NextResponse.json(cached);
        // }
        // ============================================

        // Fetch positions from Traccar
        const positions = await getPositions();

        // ============================================
        // Phase 2: Cache in Redis (30 second TTL)
        // ============================================
        // await redis.set('trackpro:positions', JSON.stringify(positions), { ex: 30 });
        // ============================================

        return NextResponse.json(positions);
    } catch (err) {
        console.error('Positions API error:', err);
        return NextResponse.json(
            { error: 'Failed to fetch positions' },
            { status: 500 }
        );
    }
}
