import { NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/firebase-admin';
import { userOwnsTraccarDevice } from '@/lib/ownership';
import { getTrips, getStops, getSummary, getEvents } from '@/lib/traccar';
import { parseReportParams, summarizeDetailedReport } from '@/lib/report-utils';

export async function GET(request) {
    try {
        let decodedToken;
        try {
            decodedToken = await verifyFirebaseToken(request);
        } catch (authErr) {
            return NextResponse.json({ error: authErr.message }, { status: authErr.status || 401 });
        }

        let parsed;
        try {
            parsed = parseReportParams(request);
        } catch (paramErr) {
            return NextResponse.json({ error: paramErr.message }, { status: paramErr.status || 400 });
        }

        const { searchParams, deviceIdNum, fromDate, toDate } = parsed;
        const owns = await userOwnsTraccarDevice(decodedToken.uid, deviceIdNum);
        if (!owns) return NextResponse.json({ error: 'Access denied to this device' }, { status: 403 });

        const includeEvents = searchParams.get('includeEvents') !== 'false';
        const tasks = [
            { key: 'trips', run: () => getTrips(deviceIdNum, fromDate, toDate) },
            { key: 'stops', run: () => getStops(deviceIdNum, fromDate, toDate) },
            { key: 'summary', run: () => getSummary(deviceIdNum, fromDate, toDate) },
        ];
        if (includeEvents) tasks.push({ key: 'events', run: () => getEvents(deviceIdNum, fromDate, toDate) });

        const settled = await Promise.allSettled(tasks.map((task) => task.run()));
        const errors = {};
        const payload = { trips: [], stops: [], summary: null, events: [] };

        settled.forEach((result, index) => {
            const key = tasks[index].key;
            if (result.status === 'fulfilled') {
                if (key === 'summary') payload.summary = Array.isArray(result.value) ? (result.value[0] || null) : result.value;
                else payload[key] = Array.isArray(result.value) ? result.value : [];
            } else {
                errors[key] = result.reason?.message || 'Failed to load section';
            }
        });

        if (payload.events.length > 0) payload.events.sort((a, b) => new Date(b.eventTime) - new Date(a.eventTime));

        return NextResponse.json({
            deviceId: deviceIdNum,
            from: fromDate.toISOString(),
            to: toDate.toISOString(),
            generatedAt: new Date().toISOString(),
            hasAnyData: payload.trips.length > 0 || payload.stops.length > 0 || payload.events.length > 0 || !!payload.summary,
            partial: Object.keys(errors).length > 0,
            errors,
            summary: summarizeDetailedReport(payload),
            sections: payload,
        });
    } catch (err) {
        console.error('[Reports/Detailed] Error:', err.message);
        return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 });
    }
}
