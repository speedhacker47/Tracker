/**
 * GET /api/live
 *
 * Server-Sent Events (SSE) endpoint that proxies Traccar's WebSocket
 * into a browser-friendly event stream.
 *
 * Authentication:
 *   Firebase ID Token is passed as `?token=<idToken>` query parameter
 *   because the browser EventSource API does not support custom headers.
 *
 * Each SSE client spawns its own Traccar WebSocket connection.
 * Filtering: only positions belonging to the requesting user are emitted.
 *
 * Events emitted to client:
 *   data: { ...position }           — a Traccar position update
 *   data: { type: "reconnecting" }  — Traccar WS dropped, retrying in 3s
 *   data: { type: "connected" }     — Traccar WS connected/reconnected
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';

// Firebase Admin token verification
import { verifyFirebaseToken } from '@/lib/firebase-admin';

// User device ownership
import { getUserTraccarIds } from '@/lib/ownership';

// Node.js ws package for server-side WebSocket
import WebSocket from 'ws';

// TRACCAR_INTERNAL_URL is for Docker-internal access (e.g. http://traccar:8082)
// TRACCAR_URL is the public URL used from Vercel / external servers
// If running on Vercel, set TRACCAR_URL to http://<EC2_PUBLIC_IP>:8082
const TRACCAR_INTERNAL_URL =
    process.env.TRACCAR_INTERNAL_URL ||
    process.env.TRACCAR_URL ||
    'http://traccar:8082';
const TRACCAR_USER = process.env.TRACCAR_USER || '';
const TRACCAR_PASS = process.env.TRACCAR_PASS || '';
const RECONNECT_DELAY_MS = 3000;

/**
 * Build the Traccar WebSocket URL from the HTTP internal URL.
 * e.g. "http://traccar:8082" → "ws://traccar:8082"
 *      "https://traccar:8082" → "wss://traccar:8082"
 */
function getTraccarWsUrl() {
    return TRACCAR_INTERNAL_URL
        .replace(/^https:\/\//, 'wss://')
        .replace(/^http:\/\//, 'ws://');
}

/** Build Basic auth header value for Traccar. */
function getBasicAuth() {
    const credentials = Buffer.from(`${TRACCAR_USER}:${TRACCAR_PASS}`).toString('base64');
    return `Basic ${credentials}`;
}

/**
 * Format a single SSE data line.
 * @param {object} payload
 * @returns {string}
 */
function sseEvent(payload) {
    return `data: ${JSON.stringify(payload)}\n\n`;
}

// ── Route Handler ─────────────────────────────────────────────────────────────

export async function GET(request) {
    // ── 1. Authenticate via token query param ──────────────────────────────
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
        return NextResponse.json({ error: 'Missing token' }, { status: 401 });
    }

    let uid;
    try {
        // verifyFirebaseToken reads from Authorization header normally, so we
        // synthesise a fake request-like object with the Bearer header set.
        const fakeRequest = {
            headers: {
                get(name) {
                    if (name.toLowerCase() === 'authorization') return `Bearer ${token}`;
                    return null;
                },
            },
        };
        const decoded = await verifyFirebaseToken(fakeRequest);
        uid = decoded.uid;
    } catch (err) {
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // ── 2. Load user's allowed device IDs ──────────────────────────────────
    let allowedDeviceIds;
    try {
        allowedDeviceIds = await getUserTraccarIds(uid);
    } catch (err) {
        console.error('[SSE] Failed to load user device IDs:', err.message);
        return NextResponse.json({ error: 'Failed to load device list' }, { status: 500 });
    }

    if (allowedDeviceIds.size === 0) {
        // No devices — return empty SSE stream that immediately ends
        const empty = new ReadableStream({
            start(controller) {
                controller.enqueue(
                    new TextEncoder().encode(sseEvent({ type: 'no_devices' }))
                );
                controller.close();
            },
        });
        return new Response(empty, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            },
        });
    }

    // ── 3. Create SSE stream ───────────────────────────────────────────────
    const encoder = new TextEncoder();
    let traccarWs = null;
    let closed = false;

    const stream = new ReadableStream({
        start(controller) {
            /**
             * Send an SSE event to the browser.
             * Returns false if the stream is already closed.
             */
            function send(payload) {
                if (closed) return false;
                try {
                    controller.enqueue(encoder.encode(sseEvent(payload)));
                    return true;
                } catch {
                    closed = true;
                    return false;
                }
            }

            /**
             * Connect (or reconnect) to Traccar WebSocket.
             * The function is called recursively on close/error until
             * the browser disconnects (aborted = true).
             */
            function connectTraccar() {
                if (closed) return;

                const wsUrl = `${getTraccarWsUrl()}/api/socket`;

                traccarWs = new WebSocket(wsUrl, {
                    headers: {
                        Authorization: getBasicAuth(),
                    },
                    // Reject self-signed certs in production; allow in dev
                    rejectUnauthorized: false,
                });

                traccarWs.on('open', () => {
                    console.log(`[SSE] Traccar WS connected for uid=${uid}`);
                    send({ type: 'connected' });
                });

                traccarWs.on('message', (data) => {
                    if (closed) return;

                    let msg;
                    try {
                        msg = JSON.parse(data.toString());
                    } catch {
                        return; // Ignore non-JSON frames
                    }

                    // Traccar sends: { positions: [...], devices: [...], events: [...] }
                    if (!msg.positions || !Array.isArray(msg.positions)) return;

                    for (const pos of msg.positions) {
                        // Filter to user's devices only
                        if (!allowedDeviceIds.has(Number(pos.deviceId))) continue;

                        send({
                            type: 'position',
                            deviceId: pos.deviceId,
                            lat: pos.latitude,
                            lng: pos.longitude,
                            speed: pos.speed,        // knots
                            course: pos.course,      // degrees 0-360
                            fixTime: pos.fixTime,
                            serverTime: pos.serverTime,
                            address: pos.address,
                            attributes: pos.attributes || {},
                        });
                    }
                });

                traccarWs.on('close', (code, reason) => {
                    if (closed) return;
                    console.warn(`[SSE] Traccar WS closed (${code}), reconnecting in ${RECONNECT_DELAY_MS}ms`);
                    send({ type: 'reconnecting' });
                    setTimeout(connectTraccar, RECONNECT_DELAY_MS);
                });

                traccarWs.on('error', (err) => {
                    console.error('[SSE] Traccar WS error:', err.message);
                    // The 'close' event will fire after an error — reconnect handled there.
                });
            }

            // Kick off the first Traccar WS connection
            connectTraccar();
        },

        cancel() {
            // Browser client disconnected — clean up Traccar WS
            closed = true;
            if (traccarWs) {
                traccarWs.removeAllListeners();
                if (
                    traccarWs.readyState === WebSocket.OPEN ||
                    traccarWs.readyState === WebSocket.CONNECTING
                ) {
                    traccarWs.close();
                }
                traccarWs = null;
            }
        },
    });

    // ── 4. Also clean up if request is aborted (e.g. tab close) ──────────
    request.signal?.addEventListener('abort', () => {
        closed = true;
        if (traccarWs) {
            traccarWs.removeAllListeners();
            try { traccarWs.close(); } catch {}
            traccarWs = null;
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            // Prevent buffering in reverse proxies (nginx, etc.)
            'X-Accel-Buffering': 'no',
        },
    });
}
