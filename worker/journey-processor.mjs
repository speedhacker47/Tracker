/**
 * Journey Processor — Rolling Background Worker
 *
 * Runs every 30s. For each active device:
 *   1. Detect stops (6+ consecutive points within 20m = ~60s at 10s intervals)
 *   2. Close stops when vehicle departs → create pending segments
 *   3. Process pending segments: snap to roads via OSRM /match → insert points
 *
 * Reads from Traccar's tc_positions (read-only).
 * Writes to our journey_stops, journey_segments, journey_segment_points tables.
 */

import pg from 'pg';
import Redis from 'ioredis';

const { Pool } = pg;

// ── Config ────────────────────────────────────────────────────────────────────
const DATABASE_URL       = process.env.DATABASE_URL || '';
const REDIS_HOST         = process.env.REDIS_HOST || 'redis';
const REDIS_PORT         = Number(process.env.REDIS_PORT) || 6379;
const OSRM_URL           = process.env.OSRM_URL || 'http://osrm:5000';
const PROCESS_INTERVAL   = Number(process.env.JOURNEY_INTERVAL_MS) || 30000;

// Stop detection: 6 consecutive points within 20m radius (~60s at 10s GPS interval)
const STOP_POINT_COUNT   = 6;
const STOP_RADIUS_M      = 20;
const SNAP_BATCH_SIZE    = 100;   // OSRM recommended max per match request
const MAX_RETRY_COUNT    = 3;

// ── Connections ───────────────────────────────────────────────────────────────
const pool = new Pool({
    connectionString: DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => console.error('[journey] Pool error:', err.message));

const redis = new Redis({ host: REDIS_HOST, port: REDIS_PORT });
redis.on('error', (err) => console.error('[journey] Redis error:', err.message));

// ── Haversine distance (meters) ───────────────────────────────────────────────
function haversineM(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Compute total distance along a point array ─────────────────────────────────
function totalDistance(points) {
    let d = 0;
    for (let i = 1; i < points.length; i++) {
        d += haversineM(points[i - 1].latitude, points[i - 1].longitude,
                        points[i].latitude,     points[i].longitude);
    }
    return d;
}

// ── Check if N points are all within radius of their centroid ──────────────────
function pointsWithinRadius(points, radiusM) {
    if (points.length === 0) return false;
    const cLat = points.reduce((s, p) => s + p.latitude, 0) / points.length;
    const cLon = points.reduce((s, p) => s + p.longitude, 0) / points.length;
    return points.every(p => haversineM(cLat, cLon, p.latitude, p.longitude) <= radiusM);
}

// ── OSRM Map Matching: /match endpoint ─────────────────────────────────────────
async function snapToRoads(points) {
    if (points.length < 2) {
        return points.map((p, i) => ({
            latitude: p.latitude, longitude: p.longitude,
            timestamp: p.fixtime, sequence: i,
        }));
    }

    const results = [];

    // Batch into groups of SNAP_BATCH_SIZE (OSRM default max ~100 per match)
    for (let i = 0; i < points.length; i += SNAP_BATCH_SIZE) {
        const batch = points.slice(i, Math.min(i + SNAP_BATCH_SIZE, points.length));

        if (batch.length < 2) {
            // Single point left — just use raw
            for (const p of batch) {
                results.push({ latitude: p.latitude, longitude: p.longitude, timestamp: p.fixtime });
            }
            continue;
        }

        // OSRM uses lng,lat order (opposite of Google)
        const coords = batch.map(p => `${p.longitude},${p.latitude}`).join(';');
        // Unix timestamps for temporal matching (helps OSRM disambiguate U-turns etc.)
        const timestamps = batch.map(p => Math.floor(new Date(p.fixtime).getTime() / 1000)).join(';');
        // Radius per point — 25m tolerance for GPS noise
        const radiuses = batch.map(() => '25').join(';');

        const url = `${OSRM_URL}/match/v1/driving/${coords}?overview=full&geometries=geojson&timestamps=${timestamps}&radiuses=${radiuses}&gaps=split`;

        const res = await fetch(url);
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`OSRM match ${res.status}: ${text}`);
        }

        const data = await res.json();

        if (data.code !== 'Ok' || !data.matchings || data.matchings.length === 0) {
            // Fallback: use raw points for this batch
            console.warn(`[journey] OSRM match returned no matchings — using raw points`);
            for (const p of batch) {
                results.push({ latitude: p.latitude, longitude: p.longitude, timestamp: p.fixtime });
            }
            continue;
        }

        // Start / end timestamps for this batch (used to distribute timestamps)
        const batchStartMs = new Date(batch[0].fixtime).getTime();
        const batchEndMs = new Date(batch[batch.length - 1].fixtime).getTime();
        const batchDurationMs = batchEndMs - batchStartMs;

        // Collect all geometry coordinates from all matchings
        // (OSRM may split into multiple matchings if there are gaps)
        let allCoords = [];
        let totalGeomDistance = 0;

        for (const matching of data.matchings) {
            if (!matching.geometry?.coordinates) continue;
            const geomCoords = matching.geometry.coordinates; // [[lng, lat], ...]

            // Calculate cumulative distance for proportional timestamp assignment
            let segDist = 0;
            for (let j = 1; j < geomCoords.length; j++) {
                segDist += haversineM(geomCoords[j - 1][1], geomCoords[j - 1][0],
                                      geomCoords[j][1], geomCoords[j][0]);
            }

            for (let j = 0; j < geomCoords.length; j++) {
                allCoords.push({
                    lat: geomCoords[j][1],   // GeoJSON is [lng, lat]
                    lng: geomCoords[j][0],
                    distOffset: totalGeomDistance + (j > 0 ?
                        haversineM(geomCoords[j - 1][1], geomCoords[j - 1][0],
                                   geomCoords[j][1], geomCoords[j][0]) : 0),
                });
                if (j > 0) {
                    totalGeomDistance += haversineM(
                        geomCoords[j - 1][1], geomCoords[j - 1][0],
                        geomCoords[j][1], geomCoords[j][0]
                    );
                }
            }
        }

        // Assign timestamps proportionally based on cumulative distance
        for (const c of allCoords) {
            const frac = totalGeomDistance > 0 ? c.distOffset / totalGeomDistance : 0;
            const ts = new Date(batchStartMs + frac * batchDurationMs);
            results.push({
                latitude: c.lat,
                longitude: c.lng,
                timestamp: ts.toISOString(),
            });
        }
    }

    return results.map((r, i) => ({ ...r, sequence: i }));
}

// ── Get active devices (had positions in last 10 min) ─────────────────────────
async function getActiveDevices() {
    const { rows } = await pool.query(`
        SELECT DISTINCT deviceid
        FROM tc_positions
        WHERE fixtime > NOW() - INTERVAL '10 minutes'
    `);
    return rows.map(r => r.deviceid);
}

// ── Get latest positions for a device ─────────────────────────────────────────
async function getLatestPositions(deviceId, limit = 20) {
    const { rows } = await pool.query(`
        SELECT id, deviceid, fixtime, latitude, longitude, speed, course
        FROM tc_positions
        WHERE deviceid = $1
        ORDER BY fixtime DESC
        LIMIT $2
    `, [deviceId, limit]);
    return rows.reverse(); // oldest first
}

// ── Get positions between two timestamps ──────────────────────────────────────
async function getPositionsBetween(deviceId, from, to) {
    const { rows } = await pool.query(`
        SELECT id, deviceid, fixtime, latitude, longitude, speed, course
        FROM tc_positions
        WHERE deviceid = $1 AND fixtime >= $2 AND fixtime <= $3
        ORDER BY fixtime ASC
    `, [deviceId, from, to]);
    return rows;
}

// ── Find open stop for device ─────────────────────────────────────────────────
async function getOpenStop(deviceId) {
    const { rows } = await pool.query(`
        SELECT * FROM journey_stops
        WHERE device_id = $1 AND departed_at IS NULL
        ORDER BY arrived_at DESC LIMIT 1
    `, [deviceId]);
    return rows[0] || null;
}

// ── Detect stops and handle departures for one device ─────────────────────────
async function processDevice(deviceId) {
    const positions = await getLatestPositions(deviceId, 20);
    if (positions.length < STOP_POINT_COUNT) return;

    const openStop = await getOpenStop(deviceId);

    // Check the latest N points for stop condition
    const tail = positions.slice(-STOP_POINT_COUNT);
    const isStopped = pointsWithinRadius(tail, STOP_RADIUS_M);

    if (isStopped && !openStop) {
        // ── Vehicle just stopped → create stop record ──────────────────────
        const cLat = tail.reduce((s, p) => s + p.latitude, 0) / tail.length;
        const cLon = tail.reduce((s, p) => s + p.longitude, 0) / tail.length;
        const arrivedAt = tail[0].fixtime;

        await pool.query(`
            INSERT INTO journey_stops (device_id, arrived_at, latitude, longitude)
            VALUES ($1, $2, $3, $4)
        `, [deviceId, arrivedAt, cLat, cLon]);

        console.log(`[journey] Device ${deviceId}: STOP detected at ${arrivedAt}`);

    } else if (!isStopped && openStop) {
        // ── Vehicle departed → close stop + create segment ──────────────────
        // Find the first point that moved away from the stop location
        let departedAt = positions[positions.length - 1].fixtime;
        for (const p of positions) {
            if (haversineM(openStop.latitude, openStop.longitude, p.latitude, p.longitude) > STOP_RADIUS_M) {
                departedAt = p.fixtime;
                break;
            }
        }

        const durationSec = Math.round((new Date(departedAt) - new Date(openStop.arrived_at)) / 1000);

        await pool.query(`
            UPDATE journey_stops
            SET departed_at = $1, duration_seconds = $2
            WHERE id = $3
        `, [departedAt, durationSec, openStop.id]);

        // Find the previous closed stop to determine segment start
        const { rows: prevStops } = await pool.query(`
            SELECT * FROM journey_stops
            WHERE device_id = $1 AND departed_at IS NOT NULL AND id != $2
            ORDER BY departed_at DESC LIMIT 1
        `, [deviceId, openStop.id]);

        // Segment starts at the previous stop's departure (or 24h ago fallback)
        const segStart = prevStops[0]?.departed_at || new Date(Date.now() - 86400000).toISOString();
        const segEnd = openStop.arrived_at;

        // Only create segment if there's a meaningful time gap
        if (new Date(segEnd) > new Date(segStart)) {
            // Calculate rough distance from raw positions
            const segPositions = await getPositionsBetween(deviceId, segStart, segEnd);
            const dist = totalDistance(segPositions);

            await pool.query(`
                INSERT INTO journey_segments (device_id, started_at, ended_at, distance_meters, status)
                VALUES ($1, $2, $3, $4, 'pending')
            `, [deviceId, segStart, segEnd, dist]);

            console.log(`[journey] Device ${deviceId}: DEPARTED — segment ${segStart} → ${segEnd}, ${Math.round(dist)}m`);
        }

    } else if (openStop) {
        // ── Still stopped → update duration ──────────────────────────────────
        const now = new Date();
        const durationSec = Math.round((now - new Date(openStop.arrived_at)) / 1000);
        await pool.query(`
            UPDATE journey_stops SET duration_seconds = $1 WHERE id = $2
        `, [durationSec, openStop.id]);
    }
}

// ── Process pending/failed segments: road-snap and insert points ──────────────
async function processSegments() {
    const { rows: segments } = await pool.query(`
        SELECT * FROM journey_segments
        WHERE status IN ('pending', 'failed')
          AND retry_count < $1
        ORDER BY created_at ASC
        LIMIT 5
    `, [MAX_RETRY_COUNT]);

    for (const seg of segments) {
        console.log(`[journey] Processing segment ${seg.id} (${seg.status})...`);

        // Mark as processing
        await pool.query(`UPDATE journey_segments SET status = 'processing' WHERE id = $1`, [seg.id]);

        try {
            // Fetch raw GPS points for this segment's time range
            const rawPoints = await getPositionsBetween(seg.device_id, seg.started_at, seg.ended_at);

            if (rawPoints.length < 2) {
                await pool.query(`
                    UPDATE journey_segments SET status = 'done', distance_meters = 0 WHERE id = $1
                `, [seg.id]);
                console.log(`[journey] Segment ${seg.id}: skipped (< 2 points)`);
                continue;
            }

            // Snap to roads
            const snapped = await snapToRoads(rawPoints);

            // Delete any existing points (in case of retry)
            await pool.query(`DELETE FROM journey_segment_points WHERE segment_id = $1`, [seg.id]);

            // Bulk insert snapped points
            if (snapped.length > 0) {
                const values = [];
                const params = [];
                let idx = 1;
                for (const pt of snapped) {
                    values.push(`($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4})`);
                    params.push(seg.id, pt.sequence, pt.latitude, pt.longitude, pt.timestamp);
                    idx += 5;
                }

                // Insert in batches of 500 points to avoid query param limits
                const BATCH = 500;
                for (let b = 0; b < snapped.length; b += BATCH) {
                    const batchEnd = Math.min(b + BATCH, snapped.length);
                    const batchValues = [];
                    const batchParams = [];
                    let bIdx = 1;
                    for (let j = b; j < batchEnd; j++) {
                        const pt = snapped[j];
                        batchValues.push(`($${bIdx}, $${bIdx + 1}, $${bIdx + 2}, $${bIdx + 3}, $${bIdx + 4})`);
                        batchParams.push(seg.id, pt.sequence, pt.latitude, pt.longitude, pt.timestamp);
                        bIdx += 5;
                    }
                    await pool.query(`
                        INSERT INTO journey_segment_points (segment_id, sequence, latitude, longitude, timestamp)
                        VALUES ${batchValues.join(',')}
                    `, batchParams);
                }
            }

            // Compute distance from snapped points
            const dist = totalDistance(snapped);
            await pool.query(`
                UPDATE journey_segments SET status = 'done', distance_meters = $1 WHERE id = $2
            `, [dist, seg.id]);

            console.log(`[journey] Segment ${seg.id}: DONE — ${snapped.length} points, ${Math.round(dist)}m`);

        } catch (err) {
            const retryCount = (seg.retry_count || 0) + 1;
            await pool.query(`
                UPDATE journey_segments
                SET status = 'failed', error_message = $1, retry_count = $2
                WHERE id = $3
            `, [err.message, retryCount, seg.id]);
            console.error(`[journey] Segment ${seg.id} FAILED (retry ${retryCount}):`, err.message);
        }
    }
}

// ── Main loop ─────────────────────────────────────────────────────────────────
async function tick() {
    try {
        // 1. Detect stops / departures for active devices
        const devices = await getActiveDevices();
        for (const deviceId of devices) {
            try {
                await processDevice(deviceId);
            } catch (err) {
                console.error(`[journey] Device ${deviceId} error:`, err.message);
            }
        }

        // 2. Process pending segments (road snapping)
        await processSegments();

        // 3. Heartbeat
        await redis.set('trackpro:journey:heartbeat', Date.now(), 'EX', 60);

        if (devices.length > 0) {
            console.log(`[journey] Tick complete — ${devices.length} active devices @ ${new Date().toISOString()}`);
        }
    } catch (err) {
        console.error('[journey] Tick error:', err.message);
    }
}

// ── Boot ──────────────────────────────────────────────────────────────────────
console.log('[journey] Starting journey processor...');
console.log(`[journey] Interval: ${PROCESS_INTERVAL}ms, Stop: ${STOP_POINT_COUNT} pts within ${STOP_RADIUS_M}m`);
console.log(`[journey] OSRM endpoint: ${OSRM_URL}`);

tick();
setInterval(tick, PROCESS_INTERVAL);
