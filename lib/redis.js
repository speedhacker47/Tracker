/**
 * Redis Client (Singleton)
 * Self-hosted Redis on AWS via ioredis
 */

import Redis from 'ioredis';

let redis;

if (!global._redisClient) {
    const host = process.env.REDIS_HOST || 'localhost';
    const port = process.env.REDIS_PORT || 6379;

    if (!host) {
        console.warn('[Redis] REDIS_HOST not set. Caching disabled.');
        global._redisClient = {
            get: async () => null,
            set: async () => 'OK',
            del: async () => 0,
            _noop: true,
        };
    } else {
        global._redisClient = new Redis({
            host,
            port: Number(port),
            // Auto-reconnect
            retryStrategy(times) {
                if (times > 3) {
                    console.warn('[Redis] Could not connect after 3 retries');
                    return null;
                }
                return Math.min(times * 200, 1000);
            },
            lazyConnect: true,
        });

        global._redisClient.on('error', (err) => {
            console.warn('[Redis] Connection error:', err.message);
        });
    }
}

redis = global._redisClient;

export { redis };