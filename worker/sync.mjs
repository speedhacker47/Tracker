/**
 * Position Sync Worker
 * Polls Traccar every 5s and writes all positions + devices to Redis.
 * Runs as a separate Docker container — Next.js API routes read from Redis only.
 */

import Redis from 'ioredis';

const REDIS_HOST = process.env.REDIS_HOST || 'redis';
const REDIS_PORT = Number(process.env.REDIS_PORT) || 6379;
const TRACCAR_URL = process.env.TRACCAR_INTERNAL_URL || 'http://traccar:8082';
const TRACCAR_USER = process.env.TRACCAR_USER;
const TRACCAR_PASS = process.env.TRACCAR_PASS;
const SYNC_INTERVAL = Number(process.env.SYNC_INTERVAL_MS) || 5000;

const redis = new Redis({ host: REDIS_HOST, port: REDIS_PORT });

const authHeader = 'Basic ' + Buffer.from(`${TRACCAR_USER}:${TRACCAR_PASS}`).toString('base64');

async function traccarGet(path) {
    const res = await fetch(`${TRACCAR_URL}/api${path}`, {
        headers: { Authorization: authHeader, Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Traccar ${path} → ${res.status}`);
    return res.json();
}

async function sync() {
    try {
        const [positions, devices] = await Promise.all([
            traccarGet('/positions'),
            traccarGet('/devices'),
        ]);

        const pipeline = redis.pipeline();

        // All positions — 10s TTL (worker refreshes every 5s, so never expires in normal operation)
        pipeline.set('tracker:positions', JSON.stringify(positions), 'EX', 10);

        // All devices — 30s TTL
        pipeline.set('tracker:devices', JSON.stringify(devices), 'EX', 30);

        // Per-device positions for fast single-device lookups
        for (const pos of positions) {
            pipeline.set(`tracker:position:${pos.deviceId}`, JSON.stringify(pos), 'EX', 30);
        }

        // Worker heartbeat — lets you monitor if worker is alive
        pipeline.set('tracker:worker:heartbeat', Date.now(), 'EX', 15);

        await pipeline.exec();

        console.log(`[sync] OK — ${positions.length} positions, ${devices.length} devices @ ${new Date().toISOString()}`);
    } catch (err) {
        console.error('[sync] Error:', err.message);
    }
}

// Run immediately then every SYNC_INTERVAL
sync();
setInterval(sync, SYNC_INTERVAL);

redis.on('error', (err) => console.error('[Redis]', err.message));