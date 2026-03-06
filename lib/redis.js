/**
 * Upstash Redis Client (Singleton)
 *
 * REST-based Redis client — no persistent connections needed.
 * Used for caching positions to reduce Traccar API load.
 */

import { Redis } from '@upstash/redis';

let redis;

if (!global._redisClient) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
        console.warn('[Redis] UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN not set. Caching disabled.');
        // Provide a no-op fallback so the app still works without Redis
        global._redisClient = {
            get: async () => null,
            set: async () => 'OK',
            del: async () => 0,
            _noop: true,
        };
    } else {
        global._redisClient = new Redis({ url, token });
    }
}

redis = global._redisClient;

export { redis };
