export function parseReportParams(request) {
    const { searchParams } = new URL(request.url);
    const deviceId = searchParams.get('deviceId');
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    if (!deviceId || !from || !to) {
        const err = new Error('Missing required params: deviceId, from, to');
        err.status = 400;
        throw err;
    }

    const deviceIdNum = parseInt(deviceId, 10);
    if (Number.isNaN(deviceIdNum)) {
        const err = new Error('deviceId must be a number');
        err.status = 400;
        throw err;
    }

    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
        const err = new Error('Invalid date format. Use ISO 8601.');
        err.status = 400;
        throw err;
    }

    if (toDate < fromDate) {
        const err = new Error('The end date must be after the start date');
        err.status = 400;
        throw err;
    }

    const diffDays = (toDate - fromDate) / (1000 * 60 * 60 * 24);
    if (diffDays > 31) {
        const err = new Error('Date range cannot exceed 31 days');
        err.status = 400;
        throw err;
    }

    return { searchParams, deviceIdNum, fromDate, toDate };
}

export function kmFromMeters(meters) {
    return Number(((meters || 0) / 1000).toFixed(2));
}

export function kmhFromKnots(knots) {
    return Math.round((knots || 0) * 1.852);
}

export function minutesFromMs(ms) {
    return Math.round((ms || 0) / 60000);
}

export function summarizeDetailedReport({ trips = [], stops = [], summary = null, events = [] }) {
    const totalDistanceMeters = summary?.distance ?? trips.reduce((sum, trip) => sum + (trip.distance || 0), 0);
    const totalDriveMs = trips.reduce((sum, trip) => sum + (trip.duration || 0), 0);
    const totalStopMs = stops.reduce((sum, stop) => sum + (stop.duration || 0), 0);
    const maxSpeedKnots = summary?.maxSpeed ?? trips.reduce((max, trip) => Math.max(max, trip.maxSpeed || 0), 0);
    const avgSpeedKnots = summary?.averageSpeed ?? (trips.length > 0 ? trips.reduce((sum, trip) => sum + (trip.averageSpeed || 0), 0) / trips.length : 0);

    const alarmCount = events.filter((event) => event.type === 'alarm').length;
    const overspeedCount = events.filter((event) => event.type === 'overspeed' || event.attributes?.alarm === 'overspeed').length;
    const geofenceCount = events.filter((event) => event.type === 'geofenceEnter' || event.type === 'geofenceExit').length;
    const ignitionOnCount = events.filter((event) => event.type === 'ignitionOn').length;
    const ignitionOffCount = events.filter((event) => event.type === 'ignitionOff').length;

    const totalStoppedMinutes = minutesFromMs(totalStopMs);
    const totalDriveMinutes = minutesFromMs(totalDriveMs);
    const avgTripDistanceKm = trips.length ? kmFromMeters(totalDistanceMeters / trips.length) : 0;
    const avgStopMinutes = stops.length ? Math.round(totalStoppedMinutes / stops.length) : 0;
    const longestStopMinutes = stops.length ? Math.max(...stops.map((stop) => minutesFromMs(stop.duration || 0))) : 0;

    return {
        totalDistanceKm: kmFromMeters(totalDistanceMeters),
        totalDriveMinutes,
        totalStoppedMinutes,
        maxSpeedKmh: kmhFromKnots(maxSpeedKnots),
        averageSpeedKmh: kmhFromKnots(avgSpeedKnots),
        engineHoursMinutes: minutesFromMs(summary?.engineHours || 0),
        fuelConsumed: summary?.fuelConsumed != null ? Number(summary.fuelConsumed) : null,
        tripCount: trips.length,
        stopCount: stops.length,
        eventCount: events.length,
        alarmCount,
        overspeedCount,
        geofenceCount,
        ignitionOnCount,
        ignitionOffCount,
        avgTripDistanceKm,
        avgStopMinutes,
        longestStopMinutes,
    };
}
