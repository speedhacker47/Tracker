import { NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/firebase-admin';
import { userOwnsTraccarDevice } from '@/lib/ownership';

const TRACCAR_URL = process.env.TRACCAR_INTERNAL_URL || 'http://traccar:8082';
const TRACCAR_USER = process.env.TRACCAR_USER;
const TRACCAR_PASS = process.env.TRACCAR_PASS;

function getAuthHeader() {
    return 'Basic ' + Buffer.from(`${TRACCAR_USER}:${TRACCAR_PASS}`).toString('base64');
}

const TRACCAR_HEADERS = {
    Authorization: getAuthHeader(),
    Accept: 'application/json',
    'Content-Type': 'application/json',
};

/** Fetch raw positions from Traccar for a device in a date range */
async function fetchPositions(deviceId, from, to) {
    const params = new URLSearchParams({
        deviceId: String(deviceId),
        from: from.toISOString(),
        to: to.toISOString(),
    });
    const res = await fetch(`${TRACCAR_URL}/api/positions?${params}`, {
        headers: TRACCAR_HEADERS,
        cache: 'no-store',
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Traccar positions failed (${res.status}): ${text.slice(0, 200)}`);
    }
    return res.json();
}

/** Fetch Traccar summary report (has distance, fuel, etc.) */
async function fetchSummary(deviceId, from, to) {
    const params = new URLSearchParams({
        deviceId: String(deviceId),
        from: from.toISOString(),
        to: to.toISOString(),
    });
    const res = await fetch(`${TRACCAR_URL}/api/reports/summary?${params}`, {
        headers: TRACCAR_HEADERS,
        cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) ? (data[0] || null) : data;
}

/** Haversine distance in meters between two lat/lng points */
function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const KMH_FROM_KNOTS = 1.852;

/**
 * Compute trips and stops from raw positions.
 * A trip starts when speed > TRIP_SPEED_THRESHOLD and ends when speed = 0 for STOP_THRESHOLD_SEC seconds.
 * A stop is a period of zero-speed lasting > MIN_STOP_SEC (e.g., 2 minutes).
 */
function computeTripsAndStops(positions) {
    const TRIP_SPEED_THRESHOLD_KNOTS = 0.5; // ~1 km/h
    const MIN_STOP_MS = 120_000;            // 2 min minimum stop
    const MIN_TRIP_DISTANCE_M = 50;         // at least 50m to be a trip

    const valid = positions.filter(p => p.fixTime && p.latitude != null && p.longitude != null);
    if (valid.length < 2) return { trips: [], stops: [] };

    const trips = [];
    const stops = [];

    let tripStart = null;
    let tripPoints = [];
    let stopStart = null;

    for (let i = 0; i < valid.length; i++) {
        const pos = valid[i];
        const speed = pos.speed || 0; // knots
        const isMoving = speed > TRIP_SPEED_THRESHOLD_KNOTS;
        const time = new Date(pos.fixTime).getTime();

        if (isMoving) {
            // End any stop
            if (stopStart !== null) {
                const stopDuration = time - stopStart;
                if (stopDuration >= MIN_STOP_MS) {
                    const stopPos = valid[i - 1] || valid[0];
                    stops.push({
                        startTime: new Date(stopStart).toISOString(),
                        endTime: new Date(time).toISOString(),
                        duration: stopDuration,
                        latitude: stopPos.latitude,
                        longitude: stopPos.longitude,
                        address: stopPos.address || null,
                    });
                }
                stopStart = null;
            }
            // Start trip if not already in one
            if (tripStart === null) {
                tripStart = time;
                tripPoints = [pos];
            } else {
                tripPoints.push(pos);
            }
        } else {
            // End trip if was moving
            if (tripStart !== null && tripPoints.length >= 2) {
                const endPos = tripPoints[tripPoints.length - 1];
                const startPos = tripPoints[0];
                // Compute actual distance from position totalDistance if available
                let dist = 0;
                const startTot = startPos.attributes?.totalDistance || 0;
                const endTot = endPos.attributes?.totalDistance || 0;
                dist = endTot > startTot ? (endTot - startTot) : 0;
                // Fallback to haversine if no totalDistance
                if (dist === 0) {
                    for (let j = 1; j < tripPoints.length; j++) {
                        dist += haversine(
                            tripPoints[j - 1].latitude, tripPoints[j - 1].longitude,
                            tripPoints[j].latitude, tripPoints[j].longitude,
                        );
                    }
                }
                const duration = time - tripStart;
                const maxSpeed = Math.max(...tripPoints.map(p => (p.speed || 0) * KMH_FROM_KNOTS));
                const avgSpeed = dist > 0 && duration > 0
                    ? (dist / 1000) / (duration / 3_600_000)
                    : 0;

                if (dist >= MIN_TRIP_DISTANCE_M) {
                    trips.push({
                        startTime: new Date(tripStart).toISOString(),
                        endTime: endPos.fixTime,
                        duration,
                        distanceM: dist,
                        maxSpeedKmh: Math.round(maxSpeed),
                        avgSpeedKmh: Math.round(avgSpeed),
                        startLat: startPos.latitude,
                        startLon: startPos.longitude,
                        endLat: endPos.latitude,
                        endLon: endPos.longitude,
                        startAddress: startPos.address || null,
                        endAddress: endPos.address || null,
                        pointCount: tripPoints.length,
                    });
                }
            }
            tripStart = null;
            tripPoints = [];

            // Start stop
            if (stopStart === null) stopStart = time;
        }
    }

    // Close final trip if device was moving at end of period
    if (tripStart !== null && tripPoints.length >= 2) {
        const endPos = tripPoints[tripPoints.length - 1];
        const startPos = tripPoints[0];
        let dist = 0;
        const startTot = startPos.attributes?.totalDistance || 0;
        const endTot = endPos.attributes?.totalDistance || 0;
        dist = endTot > startTot ? (endTot - startTot) : 0;
        if (dist === 0) {
            for (let j = 1; j < tripPoints.length; j++) {
                dist += haversine(
                    tripPoints[j - 1].latitude, tripPoints[j - 1].longitude,
                    tripPoints[j].latitude, tripPoints[j].longitude,
                );
            }
        }
        const duration = new Date(endPos.fixTime).getTime() - tripStart;
        const maxSpeed = Math.max(...tripPoints.map(p => (p.speed || 0) * KMH_FROM_KNOTS));
        const avgSpeed = dist > 0 && duration > 0
            ? (dist / 1000) / (duration / 3_600_000)
            : 0;
        if (dist >= 50) {
            trips.push({
                startTime: new Date(tripStart).toISOString(),
                endTime: endPos.fixTime,
                duration,
                distanceM: dist,
                maxSpeedKmh: Math.round(maxSpeed),
                avgSpeedKmh: Math.round(avgSpeed),
                startLat: startPos.latitude,
                startLon: startPos.longitude,
                endLat: endPos.latitude,
                endLon: endPos.longitude,
                startAddress: startPos.address || null,
                endAddress: endPos.address || null,
                pointCount: tripPoints.length,
            });
        }
    }

    return { trips, stops };
}

/** Group positions by local date (YYYY-MM-DD) and compute per-day stats */
function computeDailyBreakdown(positions, trips) {
    const byDay = new Map();

    for (const pos of positions) {
        if (!pos.fixTime) continue;
        const d = new Date(pos.fixTime);
        const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
        if (!byDay.has(key)) byDay.set(key, { positions: [], maxSpeed: 0, totalDist: 0 });
        const day = byDay.get(key);
        day.positions.push(pos);
        if ((pos.speed || 0) * KMH_FROM_KNOTS > day.maxSpeed) day.maxSpeed = (pos.speed || 0) * KMH_FROM_KNOTS;
    }

    // Group trips by day
    const tripsByDay = new Map();
    for (const trip of trips) {
        const d = new Date(trip.startTime);
        const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
        if (!tripsByDay.has(key)) tripsByDay.set(key, []);
        tripsByDay.get(key).push(trip);
    }

    const days = [];
    for (const [date, data] of byDay) {
        const dayTrips = tripsByDay.get(date) || [];
        const totalDistM = dayTrips.reduce((s, t) => s + t.distanceM, 0);
        const totalDriveMs = dayTrips.reduce((s, t) => s + t.duration, 0);
        const maxSpeed = Math.round(data.maxSpeed);
        const avgSpeed = dayTrips.length > 0
            ? Math.round(dayTrips.reduce((s, t) => s + t.avgSpeedKmh, 0) / dayTrips.length)
            : 0;
        const firstPos = data.positions[0];
        const lastPos = data.positions[data.positions.length - 1];
        const activeMin = lastPos && firstPos
            ? Math.round((new Date(lastPos.fixTime) - new Date(firstPos.fixTime)) / 60000)
            : 0;
        days.push({
            date,
            tripCount: dayTrips.length,
            distanceKm: parseFloat((totalDistM / 1000).toFixed(2)),
            driveTimeMin: Math.round(totalDriveMs / 60000),
            maxSpeedKmh: maxSpeed,
            avgSpeedKmh: avgSpeed,
            positionCount: data.positions.length,
            activeMinutes: activeMin,
        });
    }

    return days.sort((a, b) => a.date.localeCompare(b.date));
}

/** Build speed distribution histogram (bins of 10 km/h) */
function computeSpeedHistogram(positions) {
    const bins = {};
    for (const pos of positions) {
        const kmh = Math.round((pos.speed || 0) * KMH_FROM_KNOTS);
        if (kmh < 1) continue; // skip stopped
        const bin = Math.floor(kmh / 10) * 10;
        bins[bin] = (bins[bin] || 0) + 1;
    }
    return Object.entries(bins)
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([speed, count]) => ({ speedBin: Number(speed), count }));
}

/** Ignition / battery analytics from attributes */
function computeDeviceStats(positions) {
    let ignitionOnCount = 0;
    let ignitionOffCount = 0;
    let lowBatteryCount = 0;
    let validGPSCount = 0;
    let minBattery = 100;
    let maxBattery = 0;

    for (const pos of positions) {
        if (pos.attributes?.ignition === true) ignitionOnCount++;
        else if (pos.attributes?.ignition === false) ignitionOffCount++;
        if ((pos.attributes?.batteryLevel ?? 100) < 20) lowBatteryCount++;
        if (pos.valid) validGPSCount++;
        const bat = pos.attributes?.batteryLevel;
        if (bat != null) {
            if (bat < minBattery) minBattery = bat;
            if (bat > maxBattery) maxBattery = bat;
        }
    }

    return {
        ignitionOnCount,
        ignitionOffCount,
        lowBatteryCount,
        validGPSCount,
        totalPositions: positions.length,
        gpsAccuracy: positions.length > 0 ? Math.round((validGPSCount / positions.length) * 100) : 0,
        minBattery: minBattery < 100 ? minBattery : null,
        maxBattery: maxBattery > 0 ? maxBattery : null,
    };
}

/**
 * GET /api/reports/analytics
 * Query params: deviceId, from, to (ISO strings)
 * Returns comprehensive analytics computed from raw positions + Traccar summary.
 */
export async function GET(request) {
    try {
        // Auth
        let decodedToken;
        try {
            decodedToken = await verifyFirebaseToken(request);
        } catch (authErr) {
            return NextResponse.json({ error: authErr.message }, { status: authErr.status || 401 });
        }

        // Params
        const { searchParams } = new URL(request.url);
        const deviceId = searchParams.get('deviceId');
        const from = searchParams.get('from');
        const to = searchParams.get('to');

        if (!deviceId || !from || !to) {
            return NextResponse.json({ error: 'Missing required params: deviceId, from, to' }, { status: 400 });
        }
        const deviceIdNum = parseInt(deviceId, 10);
        if (isNaN(deviceIdNum)) {
            return NextResponse.json({ error: 'deviceId must be a number' }, { status: 400 });
        }

        const fromDate = new Date(from);
        const toDate = new Date(to);
        if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
            return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });
        }
        if (toDate < fromDate) {
            return NextResponse.json({ error: 'End date must be after start date' }, { status: 400 });
        }
        const diffDays = (toDate - fromDate) / (1000 * 60 * 60 * 24);
        if (diffDays > 62) {
            return NextResponse.json({ error: 'Date range cannot exceed 62 days' }, { status: 400 });
        }

        // Auth check - user must own the device
        const owns = await userOwnsTraccarDevice(decodedToken.uid, deviceIdNum);
        if (!owns) {
            return NextResponse.json({ error: 'Access denied to this device' }, { status: 403 });
        }

        // Fetch positions and traccar summary in parallel
        const [positions, traccarSummary] = await Promise.allSettled([
            fetchPositions(deviceIdNum, fromDate, toDate),
            fetchSummary(deviceIdNum, fromDate, toDate),
        ]);

        const rawPositions = positions.status === 'fulfilled' ? positions.value : [];
        const summary = traccarSummary.status === 'fulfilled' ? traccarSummary.value : null;
        const positionError = positions.status === 'rejected' ? positions.reason?.message : null;

        // Compute analytics from positions
        const { trips, stops } = computeTripsAndStops(rawPositions);
        const dailyBreakdown = computeDailyBreakdown(rawPositions, trips);
        const speedHistogram = computeSpeedHistogram(rawPositions);
        const deviceStats = computeDeviceStats(rawPositions);

        // Aggregate stats
        const totalDistM = summary?.distance
            ?? trips.reduce((s, t) => s + t.distanceM, 0);
        const totalDriveMs = trips.reduce((s, t) => s + t.duration, 0);
        const totalStopMs = stops.reduce((s, t) => s + t.duration, 0);
        const maxSpeedKmh = rawPositions.length > 0
            ? Math.round(Math.max(...rawPositions.map(p => (p.speed || 0) * KMH_FROM_KNOTS)))
            : 0;
        const movingPositions = rawPositions.filter(p => (p.speed || 0) * KMH_FROM_KNOTS > 1);
        const avgSpeedKmh = movingPositions.length > 0
            ? Math.round(movingPositions.reduce((s, p) => s + (p.speed || 0) * KMH_FROM_KNOTS, 0) / movingPositions.length)
            : 0;

        return NextResponse.json({
            deviceId: deviceIdNum,
            from: fromDate.toISOString(),
            to: toDate.toISOString(),
            generatedAt: new Date().toISOString(),
            hasData: rawPositions.length > 0,
            positionError,
            // Overall summary
            overall: {
                totalDistanceKm: parseFloat((totalDistM / 1000).toFixed(2)),
                totalDriveMinutes: Math.round(totalDriveMs / 60000),
                totalStopMinutes: Math.round(totalStopMs / 60000),
                maxSpeedKmh,
                avgSpeedKmh,
                tripCount: trips.length,
                stopCount: stops.length,
                totalPositions: rawPositions.length,
                daysActive: dailyBreakdown.filter(d => d.tripCount > 0).length,
                // From Traccar summary if available
                fuelConsumed: summary?.spentFuel ?? null,
                engineHoursMin: summary?.engineHours
                    ? Math.round(summary.engineHours / 60000)
                    : null,
                startOdometer: summary?.startOdometer
                    ? parseFloat((summary.startOdometer / 1000).toFixed(1))
                    : null,
                endOdometer: summary?.endOdometer
                    ? parseFloat((summary.endOdometer / 1000).toFixed(1))
                    : null,
            },
            // Per-day breakdown
            dailyBreakdown,
            // Trip list
            trips,
            // Stop list
            stops,
            // Speed distribution
            speedHistogram,
            // Device health
            deviceStats,
        });

    } catch (err) {
        console.error('[Analytics] Error:', err.message, err.stack);
        return NextResponse.json({ error: 'Failed to generate analytics. Please try again.' }, { status: 500 });
    }
}
