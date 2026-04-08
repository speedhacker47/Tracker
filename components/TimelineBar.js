'use client';

import { useRef, useEffect, useCallback } from 'react';

/**
 * TimelineBar — 24-hour horizontal timeline showing moving/stopped periods.
 *
 * Props:
 *   segments   — [{ startedAt, endedAt, points }]
 *   stops      — [{ arrivedAt, departedAt, durationSeconds }]
 *   currentTime — current playback timestamp (ISO string or Date)
 *   onSeek     — (timestamp: Date) => void — user clicked to seek
 *   isPlaying  — boolean
 *   date       — 'YYYY-MM-DD' string for the day being shown
 */
export default function TimelineBar({ segments, stops, currentTime, onSeek, isPlaying, date }) {
    const canvasRef = useRef(null);
    const containerRef = useRef(null);

    // Day boundaries
    const dayStart = new Date(date + 'T00:00:00Z');
    const dayEnd = new Date(date + 'T23:59:59.999Z');
    const DAY_MS = dayEnd - dayStart;

    const timeToFrac = useCallback((t) => {
        const d = new Date(t);
        return Math.max(0, Math.min(1, (d - dayStart) / DAY_MS));
    }, [dayStart, DAY_MS]);

    // ── Draw ──────────────────────────────────────────────────────────────────
    useEffect(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;

        const dpr = window.devicePixelRatio || 1;
        const w = container.clientWidth;
        const h = 52;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';

        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, w, h);

        const PAD_X = 0;
        const trackY = 20;
        const trackH = 16;
        const barW = w - PAD_X * 2;

        // ── Background track ──────────────────────────────────────────────
        ctx.fillStyle = '#f1f3f5';
        ctx.beginPath();
        ctx.roundRect(PAD_X, trackY, barW, trackH, 4);
        ctx.fill();

        // ── Moving segments (green) ───────────────────────────────────────
        for (const seg of segments) {
            const x1 = PAD_X + timeToFrac(seg.startedAt) * barW;
            const x2 = PAD_X + timeToFrac(seg.endedAt) * barW;
            const sw = Math.max(2, x2 - x1);
            ctx.fillStyle = '#34a853';
            ctx.beginPath();
            ctx.roundRect(x1, trackY, sw, trackH, 3);
            ctx.fill();
        }

        // ── Stop segments (red-orange) ────────────────────────────────────
        for (const st of stops) {
            if (!st.departedAt) continue;
            const x1 = PAD_X + timeToFrac(st.arrivedAt) * barW;
            const x2 = PAD_X + timeToFrac(st.departedAt) * barW;
            const sw = Math.max(3, x2 - x1);
            ctx.fillStyle = '#ea4335';
            ctx.beginPath();
            ctx.roundRect(x1, trackY, sw, trackH, 3);
            ctx.fill();
        }

        // Open stops (still stopped — draw to current time)
        for (const st of stops) {
            if (st.departedAt) continue;
            const x1 = PAD_X + timeToFrac(st.arrivedAt) * barW;
            const x2 = PAD_X + timeToFrac(currentTime || new Date()) * barW;
            const sw = Math.max(3, x2 - x1);
            ctx.fillStyle = 'rgba(234, 67, 53, 0.5)';
            ctx.beginPath();
            ctx.roundRect(x1, trackY, sw, trackH, 3);
            ctx.fill();
        }

        // ── Stop markers (circles on top edge) ───────────────────────────
        for (const st of stops) {
            const x = PAD_X + timeToFrac(st.arrivedAt) * barW;
            ctx.fillStyle = '#d93025';
            ctx.beginPath();
            ctx.arc(x, trackY, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(x, trackY, 2, 0, Math.PI * 2);
            ctx.fill();
        }

        // ── Playhead ──────────────────────────────────────────────────────
        if (currentTime) {
            const px = PAD_X + timeToFrac(currentTime) * barW;
            // Vertical line
            ctx.strokeStyle = '#1a73e8';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(px, trackY - 4);
            ctx.lineTo(px, trackY + trackH + 4);
            ctx.stroke();
            // Triangle head
            ctx.fillStyle = '#1a73e8';
            ctx.beginPath();
            ctx.moveTo(px - 5, trackY - 4);
            ctx.lineTo(px + 5, trackY - 4);
            ctx.lineTo(px, trackY + 2);
            ctx.closePath();
            ctx.fill();
        }

        // ── Time labels ───────────────────────────────────────────────────
        ctx.font = '10px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#9aa0a6';
        for (let hr = 0; hr <= 24; hr += 3) {
            const frac = hr / 24;
            const x = PAD_X + frac * barW;
            const label = hr === 0 ? '12a' : hr === 12 ? '12p' : hr === 24 ? '12a' :
                          hr < 12 ? `${hr}a` : `${hr - 12}p`;
            ctx.fillText(label, x, h - 2);

            // Tick mark
            ctx.strokeStyle = '#dadce0';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, trackY + trackH);
            ctx.lineTo(x, trackY + trackH + 4);
            ctx.stroke();
        }
    }, [segments, stops, currentTime, timeToFrac, date]);

    // ── Click to seek ─────────────────────────────────────────────────────────
    const handleClick = useCallback((e) => {
        const canvas = canvasRef.current;
        if (!canvas || !onSeek) return;
        const rect = canvas.getBoundingClientRect();
        const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const ts = new Date(dayStart.getTime() + frac * DAY_MS);
        onSeek(ts);
    }, [onSeek, dayStart, DAY_MS]);

    // ── Resize ────────────────────────────────────────────────────────────────
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const ro = new ResizeObserver(() => {
            // Trigger a re-render by dispatching a custom event
            const canvas = canvasRef.current;
            if (canvas) canvas.dispatchEvent(new Event('resize'));
        });
        ro.observe(container);
        return () => ro.disconnect();
    }, []);

    return (
        <div
            ref={containerRef}
            onClick={handleClick}
            style={{
                width: '100%',
                cursor: 'pointer',
                background: 'white',
                borderRadius: 8,
                padding: '6px 12px',
                boxSizing: 'border-box',
                userSelect: 'none',
            }}
        >
            <canvas ref={canvasRef} style={{ display: 'block', width: '100%' }} />
        </div>
    );
}
