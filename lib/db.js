/**
 * Database Connection Pool (Singleton)
 *
 * Uses a single shared Pool across all API routes.
 * Configured for production scalability (1000+ devices).
 *
 * - max: 20 connections
 * - idleTimeoutMillis: close idle connections after 30s
 * - connectionTimeoutMillis: fail fast if pool is exhausted
 * - SSL: disabled for internal Docker network connections
 *        (TimescaleDB is on the same private network as Next.js)
 */

import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || '';

// Whether to use SSL — only needed for external DBs like Neon.
// Internal Docker connections don't need SSL.
const useSSL = process.env.DB_SSL === 'true';

let pool;

if (!global._pgPool) {
    global._pgPool = new Pool({
        connectionString: DATABASE_URL,
        ...(useSSL ? { ssl: { rejectUnauthorized: false } } : {}),
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
    });

    // Log pool errors (don't crash the process)
    global._pgPool.on('error', (err) => {
        console.error('[DB] Unexpected pool error:', err.message);
    });
}

pool = global._pgPool;

/**
 * Run a parameterized query against the database.
 * Always use parameterized queries ($1, $2, ...) to prevent SQL injection.
 *
 * @param {string} text - SQL query with $1, $2 placeholders
 * @param {Array} params - Parameter values
 * @returns {Promise<import('pg').QueryResult>}
 */
export async function query(text, params) {
    const start = Date.now();
    const result = await pool.query(text, params);
    const duration = Date.now() - start;

    // Log slow queries (> 500ms) for debugging
    if (duration > 500) {
        console.warn(`[DB] Slow query (${duration}ms):`, text);
    }

    return result;
}

export { pool };
