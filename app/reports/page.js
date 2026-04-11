'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import NavBar from '@/components/NavBar';
import { apiFetch } from '@/lib/api';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';

// ─── Formatters ──────────────────────────────────────────────────────────────
const fmt = {
    km: v => v == null ? '—' : `${Number(v).toFixed(1)} km`,
    kmh: v => v == null ? '—' : `${Math.round(v)} km/h`,
    mins: (v) => {
        if (v == null || v === 0) return '0 min';
        if (v < 60) return `${v} min`;
        const h = Math.floor(v / 60), m = v % 60;
        return m === 0 ? `${h}h` : `${h}h ${m}m`;
    },
    fuel: v => v == null || v === 0 ? '—' : `${Number(v).toFixed(1)} L`,
    date: (iso) => {
        if (!iso) return '—';
        const d = new Date(iso);
        return d.toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
    },
    shortDate: (s) => {
        const [, mo, dd] = s.split('-');
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        return `${months[parseInt(mo)-1]} ${parseInt(dd)}`;
    },
    pct: v => `${v}%`,
};

// ─── Sparkline bar chart (pure SVG, no libs) ──────────────────────────────────
function BarChart({ data, valueKey, labelKey, color = '#6366f1', height = 120, unit = '' }) {
    if (!data || data.length === 0) return null;
    const max = Math.max(...data.map(d => d[valueKey] || 0), 1);
    const BAR_GAP = 6;
    const barW = Math.max(12, Math.min(40, (600 - BAR_GAP * data.length) / data.length));
    const svgW = data.length * (barW + BAR_GAP);

    return (
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <svg width={svgW} height={height + 36} style={{ display: 'block', minWidth: '100%' }}>
                {data.map((d, i) => {
                    const val = d[valueKey] || 0;
                    const barH = Math.max(2, (val / max) * height);
                    const x = i * (barW + BAR_GAP);
                    const y = height - barH;
                    return (
                        <g key={i}>
                            <rect
                                x={x} y={y} width={barW} height={barH}
                                fill={color} rx={3} opacity={0.85}
                            />
                            {val > 0 && (
                                <text x={x + barW / 2} y={y - 3} textAnchor="middle"
                                    fontSize={9} fill="#6b7280">
                                    {val}{unit}
                                </text>
                            )}
                            <text x={x + barW / 2} y={height + 16} textAnchor="middle"
                                fontSize={9} fill="#9ca3af" transform={`rotate(-30, ${x + barW / 2}, ${height + 16})`}>
                                {d[labelKey]}
                            </text>
                        </g>
                    );
                })}
            </svg>
        </div>
    );
}

// ─── Mini line sparkline ──────────────────────────────────────────────────────
function Sparkline({ data, valueKey, color = '#6366f1', height = 48 }) {
    if (!data || data.length < 2) return null;
    const vals = data.map(d => d[valueKey] || 0);
    const max = Math.max(...vals, 1);
    const min = 0;
    const W = 200;
    const step = W / (vals.length - 1);
    const pts = vals.map((v, i) => {
        const x = i * step;
        const y = height - ((v - min) / (max - min)) * height;
        return `${x},${y}`;
    }).join(' ');
    return (
        <svg width={W} height={height} style={{ display: 'block' }}>
            <polyline points={pts} fill="none" stroke={color} strokeWidth={2} />
            <circle cx={vals.length > 1 ? (vals.length - 1) * step : 0} cy={height - ((vals[vals.length - 1] - min) / (max - min)) * height} r={3} fill={color} />
        </svg>
    );
}

// ─── Speed histogram ─────────────────────────────────────────────────────────
function SpeedHistogram({ data }) {
    if (!data || data.length === 0) return <p style={{ color: 'var(--gray-400)', fontSize: '0.8rem', padding: '1rem 0' }}>No speed data</p>;
    const max = Math.max(...data.map(d => d.count), 1);
    const total = data.reduce((s, d) => s + d.count, 0);
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {data.map((bin) => {
                const pct = Math.round((bin.count / max) * 100);
                const share = ((bin.count / total) * 100).toFixed(1);
                const color = bin.speedBin < 40 ? '#22c55e' : bin.speedBin < 80 ? '#f59e0b' : '#ef4444';
                return (
                    <div key={bin.speedBin} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 58, fontSize: '0.72rem', color: 'var(--gray-500)', textAlign: 'right', flexShrink: 0 }}>
                            {bin.speedBin}–{bin.speedBin + 9} km/h
                        </div>
                        <div style={{ flex: 1, background: 'var(--gray-100)', borderRadius: 99, height: 14, overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 99, transition: 'width 0.4s' }} />
                        </div>
                        <div style={{ width: 46, fontSize: '0.72rem', color: 'var(--gray-500)', textAlign: 'right' }}>{share}%</div>
                    </div>
                );
            })}
        </div>
    );
}

// ─── Date Mode Selector ───────────────────────────────────────────────────────
function DateModeSelector({ mode, onChange }) {
    const modes = [
        { key: 'single', label: 'Single Day' },
        { key: 'range', label: 'Date Range' },
        { key: 'multi', label: 'Multiple Dates' },
    ];
    return (
        <div style={{ display: 'flex', background: 'var(--gray-100)', borderRadius: 8, padding: 3, gap: 2 }}>
            {modes.map(m => (
                <button key={m.key} onClick={() => onChange(m.key)}
                    style={{
                        padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                        fontSize: '0.78rem', fontWeight: mode === m.key ? 600 : 400,
                        background: mode === m.key ? 'white' : 'transparent',
                        color: mode === m.key ? 'var(--gray-900)' : 'var(--gray-500)',
                        boxShadow: mode === m.key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                        transition: 'all 0.15s', fontFamily: 'inherit',
                    }}>
                    {m.label}
                </button>
            ))}
        </div>
    );
}

// ─── Multi-date picker (calendar-style checkboxes) ───────────────────────────
function MultiDatePicker({ selectedDates, onChange }) {
    const today = new Date();
    const [viewYear, setViewYear] = useState(today.getFullYear());
    const [viewMonth, setViewMonth] = useState(today.getMonth());

    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

    const prevMonth = () => {
        if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
        else setViewMonth(m => m - 1);
    };
    const nextMonth = () => {
        if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
        else setViewMonth(m => m + 1);
    };

    const toggleDate = (dateStr) => {
        const set = new Set(selectedDates);
        if (set.has(dateStr)) set.delete(dateStr);
        else set.add(dateStr);
        onChange([...set].sort());
    };

    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];

    return (
        <div style={{ background: 'white', border: '1px solid var(--gray-200)', borderRadius: 12, padding: '1rem', width: 280 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <button onClick={prevMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', color: 'var(--gray-600)', padding: '0 4px' }}>‹</button>
                <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--gray-800)' }}>{monthNames[viewMonth]} {viewYear}</span>
                <button onClick={() => { if (viewYear < today.getFullYear() || viewMonth < today.getMonth()) nextMonth(); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', color: 'var(--gray-600)', padding: '0 4px' }}>›</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
                {['S','M','T','W','T','F','S'].map((d, i) => (
                    <div key={i} style={{ textAlign: 'center', fontSize: '0.7rem', fontWeight: 600, color: 'var(--gray-400)', paddingBottom: 4 }}>{d}</div>
                ))}
                {Array.from({ length: firstDayOfWeek }, (_, i) => <div key={`e${i}`} />)}
                {Array.from({ length: daysInMonth }, (_, i) => {
                    const day = i + 1;
                    const dateStr = `${viewYear}-${String(viewMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                    const isFuture = dateStr > todayStr;
                    const isSelected = selectedDates.includes(dateStr);
                    const isToday = dateStr === todayStr;
                    return (
                        <button
                            key={day}
                            disabled={isFuture}
                            onClick={() => toggleDate(dateStr)}
                            style={{
                                width: '100%', aspectRatio: '1', borderRadius: 6, border: 'none',
                                cursor: isFuture ? 'not-allowed' : 'pointer',
                                background: isSelected ? 'var(--primary-500)' : isToday ? 'var(--gray-100)' : 'transparent',
                                color: isSelected ? 'white' : isFuture ? 'var(--gray-300)' : 'var(--gray-700)',
                                fontWeight: isSelected || isToday ? 600 : 400,
                                fontSize: '0.78rem', fontFamily: 'inherit',
                                outline: isToday && !isSelected ? '2px solid var(--primary-200)' : 'none',
                            }}>
                            {day}
                        </button>
                    );
                })}
            </div>
            {selectedDates.length > 0 && (
                <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>{selectedDates.length} date{selectedDates.length !== 1 ? 's' : ''} selected</span>
                    <button onClick={() => onChange([])} style={{ fontSize: '0.72rem', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Clear</button>
                </div>
            )}
        </div>
    );
}

// ─── Stat Tile ────────────────────────────────────────────────────────────────
function StatTile({ icon, label, value, sub, accent = '#6366f1', trend }) {
    return (
        <div style={{
            background: 'white', border: '1px solid var(--gray-200)', borderRadius: 14,
            padding: '1.1rem 1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            display: 'flex', flexDirection: 'column', gap: 4,
        }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: '1.1rem' }}>{icon}</div>
                {trend != null && (
                    <span style={{ fontSize: '0.68rem', padding: '2px 6px', borderRadius: 99,
                        background: trend > 0 ? '#dcfce7' : trend < 0 ? '#fee2e2' : 'var(--gray-100)',
                        color: trend > 0 ? '#16a34a' : trend < 0 ? '#dc2626' : 'var(--gray-500)',
                        fontWeight: 600,
                    }}>
                        {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}
                    </span>
                )}
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: accent, lineHeight: 1.1 }}>{value}</div>
            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--gray-700)' }}>{label}</div>
            {sub && <div style={{ fontSize: '0.72rem', color: 'var(--gray-400)' }}>{sub}</div>}
        </div>
    );
}

// ─── Section Header ───────────────────────────────────────────────────────────
function SectionHeader({ title, subtitle }) {
    return (
        <div style={{ marginBottom: '0.875rem' }}>
            <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--gray-800)' }}>{title}</div>
            {subtitle && <div style={{ fontSize: '0.78rem', color: 'var(--gray-400)', marginTop: 2 }}>{subtitle}</div>}
        </div>
    );
}

// ─── Card wrapper ─────────────────────────────────────────────────────────────
function Card({ children, style = {} }) {
    return (
        <div style={{
            background: 'white', border: '1px solid var(--gray-200)', borderRadius: 14,
            padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            ...style,
        }}>
            {children}
        </div>
    );
}

// ─── Trip card ────────────────────────────────────────────────────────────────
function TripRow({ trip, index }) {
    const [open, setOpen] = useState(false);
    return (
        <div style={{ border: '1px solid var(--gray-200)', borderRadius: 12, overflow: 'hidden', background: 'white' }}>
            <div
                onClick={() => setOpen(o => !o)}
                style={{ padding: '0.875rem 1.1rem', display: 'grid', gridTemplateColumns: '2rem 1fr auto', gap: '0.75rem', alignItems: 'center', cursor: 'pointer' }}>
                <div style={{
                    width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700, color: 'white', flexShrink: 0,
                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                }}>
                    {index + 1}
                </div>
                <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--gray-800)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {fmt.date(trip.startTime)}
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', marginTop: 3, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.72rem', color: '#6366f1', fontWeight: 600 }}>{fmt.km(trip.distanceM / 1000)}</span>
                        <span style={{ fontSize: '0.72rem', color: 'var(--gray-400)' }}>{fmt.mins(Math.round(trip.duration / 60000))}</span>
                        <span style={{ fontSize: '0.72rem', color: 'var(--gray-400)' }}>Max {fmt.kmh(trip.maxSpeedKmh)}</span>
                        <span style={{ fontSize: '0.72rem', color: 'var(--gray-400)' }}>Avg {fmt.kmh(trip.avgSpeedKmh)}</span>
                    </div>
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--gray-400)' }}>{open ? '▲' : '▼'}</div>
            </div>
            {open && (
                <div style={{ padding: '0 1.1rem 1rem', borderTop: '1px solid var(--gray-100)', paddingTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {[
                        ['Start Time', fmt.date(trip.startTime)],
                        ['End Time', fmt.date(trip.endTime)],
                        ['Distance', fmt.km(trip.distanceM / 1000)],
                        ['Duration', fmt.mins(Math.round(trip.duration / 60000))],
                        ['Max Speed', fmt.kmh(trip.maxSpeedKmh)],
                        ['Avg Speed', fmt.kmh(trip.avgSpeedKmh)],
                        ['GPS Points', trip.pointCount],
                    ].map(([l, v]) => (
                        <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                            <span style={{ color: 'var(--gray-500)' }}>{l}</span>
                            <span style={{ fontWeight: 600, color: 'var(--gray-800)' }}>{v}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════
export default function ReportsPage() {
    const router = useRouter();

    // — Devices —
    const [devices, setDevices] = useState([]);
    const [selectedDevice, setSelectedDevice] = useState('');
    const [devicesLoading, setDevicesLoading] = useState(true);

    // — Date mode —
    const [dateMode, setDateMode] = useState('range'); // 'single' | 'range' | 'multi'
    const today = useMemo(() => {
        const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }, []);
    const yesterday = useMemo(() => {
        const d = new Date(); d.setDate(d.getDate()-1);
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }, []);
    const [singleDate, setSingleDate] = useState(today);
    const [rangeFrom, setRangeFrom] = useState(yesterday);
    const [rangeTo, setRangeTo] = useState(today);
    const [multiDates, setMultiDates] = useState([today]);

    // — Report state —
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [report, setReport] = useState(null);
    const [activeTab, setActiveTab] = useState('overview');

    // — Auth / load devices —
    useEffect(() => {
        const loadDevices = async () => {
            const user = await new Promise(resolve => {
                const unsub = onAuthStateChanged(auth, u => { unsub(); resolve(u); });
            });
            if (!user) { router.push('/login'); return; }
            try {
                const res = await apiFetch('/api/devices');
                if (res.status === 401) { router.push('/login'); return; }
                if (res.ok) {
                    const data = await res.json();
                    setDevices(data);
                    if (data.length > 0) setSelectedDevice(String(data[0].id));
                }
            } catch { /* silent */ }
            finally { setDevicesLoading(false); }
        };
        loadDevices();
    }, [router]);

    // — Compute from/to from selected mode —
    const getFromTo = useCallback(() => {
        if (dateMode === 'single') {
            return { from: `${singleDate}T00:00:00`, to: `${singleDate}T23:59:59` };
        }
        if (dateMode === 'range') {
            return { from: `${rangeFrom}T00:00:00`, to: `${rangeTo}T23:59:59` };
        }
        // multi — use min/max of selected dates
        if (multiDates.length === 0) return null;
        const sorted = [...multiDates].sort();
        return { from: `${sorted[0]}T00:00:00`, to: `${sorted[sorted.length - 1]}T23:59:59` };
    }, [dateMode, singleDate, rangeFrom, rangeTo, multiDates]);

    // — Run Report —
    const runReport = useCallback(async () => {
        if (!selectedDevice) return;
        const range = getFromTo();
        if (!range) { setError('Please select at least one date.'); return; }
        const { from, to } = range;
        if (new Date(to) < new Date(from)) { setError('End date must be after start date.'); return; }

        setLoading(true);
        setError('');
        setReport(null);

        try {
            const params = new URLSearchParams({
                deviceId: selectedDevice,
                from: new Date(from).toISOString(),
                to: new Date(to).toISOString(),
            });
            const res = await apiFetch(`/api/reports/analytics?${params}`);
            const data = await res.json().catch(() => ({}));
            if (!res.ok) { setError(data.error || 'Failed to generate report.'); return; }
            setReport(data);
            setActiveTab('overview');
        } catch {
            setError('Connection error. Please try again.');
        } finally {
            setLoading(false);
        }
    }, [selectedDevice, getFromTo]);

    const vehicle = devices.find(d => String(d.id) === selectedDevice);
    const r = report;

    // — Filter daily breakdown for multi-date mode —
    const filteredDaily = useMemo(() => {
        if (!r?.dailyBreakdown) return [];
        if (dateMode === 'multi' && multiDates.length > 0) {
            const set = new Set(multiDates);
            return r.dailyBreakdown.filter(d => set.has(d.date));
        }
        return r.dailyBreakdown;
    }, [r, dateMode, multiDates]);

    // Tab definitions
    const tabs = r ? [
        { key: 'overview', label: 'Overview' },
        { key: 'daily', label: `Daily (${filteredDaily.length})` },
        { key: 'trips', label: `Trips (${r.trips?.length ?? 0})` },
        { key: 'stops', label: `Stops (${r.stops?.length ?? 0})` },
        { key: 'speed', label: 'Speed' },
        { key: 'device', label: 'Device' },
    ] : [];

    const inp = { height: 34, padding: '0 10px', border: '1.5px solid var(--gray-200)', borderRadius: 8, background: 'white', fontSize: '0.85rem', fontFamily: 'inherit', color: 'var(--gray-800)', outline: 'none' };

    return (
        <div className="dashboard-shell">
            <NavBar />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--gray-50)' }}>

                {/* ───── Header ───── */}
                <div style={{ background: 'white', borderBottom: '1px solid var(--gray-200)', padding: '0.75rem 1.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                    <div>
                        <h1 style={{ fontSize: '1.0625rem', fontWeight: 700, color: 'var(--gray-900)', margin: 0 }}>Analytics &amp; Reports</h1>
                        <div style={{ fontSize: '0.78rem', color: 'var(--gray-400)', marginTop: 2 }}>
                            {vehicle ? `${vehicle.name} · ` : ''}{r ? `${r.overall?.tripCount} trips, ${fmt.km(r.overall?.totalDistanceKm)} total` : 'Select a vehicle and date to generate'}
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexWrap: 'wrap' }}>
                        {devicesLoading ? (
                            <div style={{ width: 160, height: 34, background: 'var(--gray-100)', borderRadius: 8 }} />
                        ) : (
                            <select value={selectedDevice} onChange={e => setSelectedDevice(e.target.value)} style={{ ...inp, width: 'auto', maxWidth: 200, cursor: 'pointer' }}>
                                {devices.map(d => <option key={d.id} value={String(d.id)}>{d.name || d.uniqueId}</option>)}
                            </select>
                        )}
                        <button
                            onClick={runReport}
                            disabled={loading || !selectedDevice || devicesLoading}
                            style={{
                                height: 34, padding: '0 1.1rem', border: 'none', borderRadius: 8,
                                background: loading ? 'var(--gray-200)' : 'var(--primary-500)',
                                color: loading ? 'var(--gray-500)' : 'white',
                                fontWeight: 600, fontSize: '0.85rem', fontFamily: 'inherit',
                                cursor: loading ? 'not-allowed' : 'pointer',
                                display: 'flex', alignItems: 'center', gap: 6,
                            }}>
                            {loading ? (
                                <><div className="map-loading-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Generating…</>
                            ) : '⚡ Generate Report'}
                        </button>
                    </div>
                </div>

                {/* ───── Date config bar ───── */}
                <div style={{ background: 'white', borderBottom: '1px solid var(--gray-200)', padding: '0.625rem 1.75rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                    <DateModeSelector mode={dateMode} onChange={m => setDateMode(m)} />

                    {dateMode === 'single' && (
                        <input type="date" value={singleDate} max={today} onChange={e => setSingleDate(e.target.value)} style={inp} />
                    )}
                    {dateMode === 'range' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <input type="date" value={rangeFrom} max={today} onChange={e => setRangeFrom(e.target.value)} style={inp} />
                            <span style={{ fontSize: '0.8rem', color: 'var(--gray-400)' }}>→</span>
                            <input type="date" value={rangeTo} max={today} onChange={e => setRangeTo(e.target.value)} style={inp} />
                        </div>
                    )}
                    {dateMode === 'multi' && (
                        <div style={{ fontSize: '0.8rem', color: 'var(--gray-500)' }}>
                            {multiDates.length === 0 ? 'No dates selected' : `${multiDates.length} date${multiDates.length > 1 ? 's' : ''}: ${multiDates.slice(0,3).map(fmt.shortDate).join(', ')}${multiDates.length > 3 ? ` +${multiDates.length - 3} more` : ''}`}
                        </div>
                    )}

                    {/* Quick range buttons */}
                    {dateMode === 'range' && (
                        <div style={{ display: 'flex', gap: 4 }}>
                            {[
                                { label: 'Today', from: today, to: today },
                                { label: '7 days', from: (() => { const d = new Date(); d.setDate(d.getDate()-6); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })(), to: today },
                                { label: '14 days', from: (() => { const d = new Date(); d.setDate(d.getDate()-13); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })(), to: today },
                                { label: '30 days', from: (() => { const d = new Date(); d.setDate(d.getDate()-29); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })(), to: today },
                            ].map(q => (
                                <button key={q.label} onClick={() => { setRangeFrom(q.from); setRangeTo(q.to); }}
                                    style={{ height: 28, padding: '0 10px', border: '1px solid var(--gray-200)', borderRadius: 6, background: 'white', fontSize: '0.72rem', fontFamily: 'inherit', cursor: 'pointer', color: 'var(--gray-600)' }}>
                                    {q.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* ───── Multi-date calendar (slide-in) ───── */}
                {dateMode === 'multi' && (
                    <div style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--gray-200)', padding: '1rem 1.75rem', display: 'flex', gap: '1.25rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                        <MultiDatePicker selectedDates={multiDates} onChange={setMultiDates} />
                        <div style={{ fontSize: '0.82rem', color: 'var(--gray-500)', maxWidth: 260, lineHeight: 1.6 }}>
                            <p style={{ margin: '0 0 8px', fontWeight: 600, color: 'var(--gray-700)' }}>How it works:</p>
                            <p style={{ margin: 0 }}>Select individual dates on the calendar. The report will fetch data across all selected dates. Useful for comparing specific days like weekdays only.</p>
                        </div>
                    </div>
                )}

                {/* ───── Error ───── */}
                {error && (
                    <div style={{ margin: '1rem 1.75rem 0', padding: '0.75rem 1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, color: '#b91c1c', fontSize: '0.875rem' }}>
                        ⚠ {error}
                    </div>
                )}

                {/* ───── Body ───── */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.75rem' }}>

                    {/* Empty state */}
                    {!loading && !r && !error && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '5rem', gap: '1rem', color: 'var(--gray-400)' }}>
                            <div style={{ fontSize: '3rem' }}>📊</div>
                            <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--gray-600)' }}>No report generated yet</div>
                            <div style={{ fontSize: '0.85rem', textAlign: 'center', maxWidth: 380 }}>
                                Select a vehicle{dateMode === 'multi' ? ', pick dates on the calendar,' : ' and date range,'} then click <strong>Generate Report</strong> to view detailed analytics.
                            </div>
                        </div>
                    )}

                    {/* Loading skeleton */}
                    {loading && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.875rem' }}>
                                {[...Array(6)].map((_, i) => (
                                    <div key={i} style={{ height: 90, background: 'var(--gray-200)', borderRadius: 14, animation: 'pulse 1.5s ease-in-out infinite' }} />
                                ))}
                            </div>
                            <div style={{ height: 200, background: 'var(--gray-200)', borderRadius: 14 }} />
                        </div>
                    )}

                    {/* Report content */}
                    {!loading && r && (
                        <>
                            {/* No data warning */}
                            {!r.hasData && (
                                <div style={{ marginBottom: '1rem', padding: '0.875rem 1rem', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, color: '#92400e', fontSize: '0.875rem' }}>
                                    ⚠ No position data found for the selected date range. The device may have been offline.
                                </div>
                            )}
                            {r.positionError && (
                                <div style={{ marginBottom: '1rem', padding: '0.875rem 1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, color: '#b91c1c', fontSize: '0.875rem' }}>
                                    ⚠ Position fetch error: {r.positionError}
                                </div>
                            )}

                            {/* ── Stat tiles ── */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
                                <StatTile icon="🛣️" label="Total Distance" value={fmt.km(r.overall?.totalDistanceKm)} sub={`${r.overall?.tripCount} trips`} accent="#6366f1" />
                                <StatTile icon="⏱️" label="Drive Time" value={fmt.mins(r.overall?.totalDriveMinutes)} sub={`${r.overall?.stopCount} stops`} accent="#0ea5e9" />
                                <StatTile icon="⚡" label="Max Speed" value={fmt.kmh(r.overall?.maxSpeedKmh)} sub={`Avg ${fmt.kmh(r.overall?.avgSpeedKmh)}`} accent="#f59e0b" />
                                <StatTile icon="🅿️" label="Total Stopped" value={fmt.mins(r.overall?.totalStopMinutes)} sub={`${r.overall?.stopCount} stop events`} accent="#10b981" />
                                <StatTile icon="📍" label="GPS Points" value={(r.overall?.totalPositions || 0).toLocaleString()} sub={`${r.deviceStats?.gpsAccuracy ?? 0}% valid`} accent="#8b5cf6" />
                                <StatTile icon="📅" label="Active Days" value={r.overall?.daysActive ?? 0} sub={`of ${filteredDaily.length} days`} accent="#ec4899" />
                                {r.overall?.startOdometer != null && (
                                    <StatTile icon="🔢" label="Odometer" value={`${fmt.km(r.overall.startOdometer)} → ${fmt.km(r.overall.endOdometer)}`} sub="Start → End" accent="#64748b" />
                                )}
                                {r.overall?.fuelConsumed > 0 && (
                                    <StatTile icon="⛽" label="Fuel Used" value={fmt.fuel(r.overall.fuelConsumed)} accent="#f97316" />
                                )}
                            </div>

                            {/* ── Tab bar ── */}
                            <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--gray-200)', marginBottom: '1.25rem', overflowX: 'auto' }}>
                                {tabs.map(tab => (
                                    <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                                        style={{
                                            padding: '8px 16px', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit',
                                            fontSize: '0.8125rem', fontWeight: activeTab === tab.key ? 700 : 400, whiteSpace: 'nowrap',
                                            color: activeTab === tab.key ? 'var(--primary-500)' : 'var(--gray-600)',
                                            borderBottom: activeTab === tab.key ? '2px solid var(--primary-500)' : '2px solid transparent',
                                            marginBottom: -1,
                                        }}>
                                        {tab.label}
                                    </button>
                                ))}
                            </div>

                            {/* ══ TAB: OVERVIEW ══ */}
                            {activeTab === 'overview' && (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>

                                    {/* Distance chart */}
                                    <Card style={{ gridColumn: filteredDaily.length > 0 ? '1 / -1' : undefined }}>
                                        <SectionHeader title="📊 Distance per Day (km)" subtitle="Bar height = km driven that day" />
                                        {filteredDaily.length > 0 ? (
                                            <BarChart data={filteredDaily} valueKey="distanceKm" labelKey="date" color="#6366f1" height={120} unit="" />
                                        ) : <p style={{ color: 'var(--gray-400)', fontSize: '0.82rem' }}>No daily data</p>}
                                    </Card>

                                    {/* Trips per day */}
                                    <Card>
                                        <SectionHeader title="🚗 Trips per Day" />
                                        {filteredDaily.length > 0 ? (
                                            <BarChart data={filteredDaily} valueKey="tripCount" labelKey="date" color="#0ea5e9" height={100} />
                                        ) : <p style={{ color: 'var(--gray-400)', fontSize: '0.82rem' }}>No data</p>}
                                    </Card>

                                    {/* Speed per day */}
                                    <Card>
                                        <SectionHeader title="⚡ Max Speed per Day (km/h)" />
                                        {filteredDaily.length > 0 ? (
                                            <BarChart data={filteredDaily} valueKey="maxSpeedKmh" labelKey="date" color="#f59e0b" height={100} unit="" />
                                        ) : <p style={{ color: 'var(--gray-400)', fontSize: '0.82rem' }}>No data</p>}
                                    </Card>

                                    {/* Summary card */}
                                    <Card>
                                        <SectionHeader title="📋 Report Summary" />
                                        {[
                                            ['Vehicle', vehicle?.name || '—'],
                                            ['Period', `${r.from?.slice(0,10)} → ${r.to?.slice(0,10)}`],
                                            ['Total Distance', fmt.km(r.overall?.totalDistanceKm)],
                                            ['Total Trips', r.overall?.tripCount],
                                            ['Total Stops', r.overall?.stopCount],
                                            ['Drive Time', fmt.mins(r.overall?.totalDriveMinutes)],
                                            ['Idle / Stop Time', fmt.mins(r.overall?.totalStopMinutes)],
                                            ['Avg Speed (moving)', fmt.kmh(r.overall?.avgSpeedKmh)],
                                            ['Max Speed', fmt.kmh(r.overall?.maxSpeedKmh)],
                                            ['Engine Hours', r.overall?.engineHoursMin != null ? fmt.mins(r.overall.engineHoursMin) : '—'],
                                            ['Fuel Consumed', fmt.fuel(r.overall?.fuelConsumed)],
                                        ].map(([l, v]) => (
                                            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.55rem 0', borderBottom: '1px solid var(--gray-100)', fontSize: '0.8rem' }}>
                                                <span style={{ color: 'var(--gray-500)' }}>{l}</span>
                                                <span style={{ fontWeight: 600, color: 'var(--gray-800)' }}>{v}</span>
                                            </div>
                                        ))}
                                    </Card>
                                </div>
                            )}

                            {/* ══ TAB: DAILY ══ */}
                            {activeTab === 'daily' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    {filteredDaily.length === 0 ? (
                                        <div style={{ textAlign: 'center', color: 'var(--gray-400)', padding: '3rem 0', fontSize: '0.9rem' }}>No daily data</div>
                                    ) : filteredDaily.map(day => (
                                        <Card key={day.date}>
                                            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '1.25rem', alignItems: 'center' }}>
                                                <div>
                                                    <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--gray-900)' }}>{fmt.shortDate(day.date)}</div>
                                                    <div style={{ fontSize: '0.72rem', color: 'var(--gray-400)', marginTop: 2 }}>{day.date}</div>
                                                    <div style={{ marginTop: 8 }}>
                                                        <Sparkline data={[{ v: 0 }, { v: day.distanceKm }, { v: 0 }]} valueKey="v" color="#6366f1" height={32} />
                                                    </div>
                                                </div>
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '0.625rem' }}>
                                                    {[
                                                        { label: 'Distance', value: fmt.km(day.distanceKm), color: '#6366f1' },
                                                        { label: 'Trips', value: day.tripCount, color: '#0ea5e9' },
                                                        { label: 'Drive Time', value: fmt.mins(day.driveTimeMin), color: '#10b981' },
                                                        { label: 'Max Speed', value: fmt.kmh(day.maxSpeedKmh), color: '#f59e0b' },
                                                        { label: 'Avg Speed', value: fmt.kmh(day.avgSpeedKmh), color: '#8b5cf6' },
                                                        { label: 'GPS Points', value: day.positionCount, color: '#64748b' },
                                                    ].map(s => (
                                                        <div key={s.label} style={{ background: 'var(--gray-50)', borderRadius: 8, padding: '0.5rem 0.75rem' }}>
                                                            <div style={{ fontSize: '1rem', fontWeight: 700, color: s.color }}>{s.value}</div>
                                                            <div style={{ fontSize: '0.68rem', color: 'var(--gray-400)', marginTop: 1 }}>{s.label}</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </Card>
                                    ))}
                                </div>
                            )}

                            {/* ══ TAB: TRIPS ══ */}
                            {activeTab === 'trips' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    {r.trips?.length === 0 ? (
                                        <div style={{ textAlign: 'center', color: 'var(--gray-400)', padding: '4rem 0' }}>
                                            <div style={{ fontSize: '2rem', marginBottom: 8 }}>🚗</div>
                                            <div style={{ fontWeight: 600, color: 'var(--gray-600)' }}>No trips detected</div>
                                            <div style={{ fontSize: '0.82rem', marginTop: 4 }}>The vehicle may not have moved or had GPS signal during this period.</div>
                                        </div>
                                    ) : r.trips.map((trip, i) => <TripRow key={i} trip={trip} index={i} />)}
                                </div>
                            )}

                            {/* ══ TAB: STOPS ══ */}
                            {activeTab === 'stops' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    {r.stops?.length === 0 ? (
                                        <div style={{ textAlign: 'center', color: 'var(--gray-400)', padding: '4rem 0' }}>
                                            <div style={{ fontSize: '2rem', marginBottom: 8 }}>🅿️</div>
                                            <div style={{ fontWeight: 600, color: 'var(--gray-600)' }}>No stops detected</div>
                                        </div>
                                    ) : r.stops.map((stop, i) => (
                                        <div key={i} style={{ background: 'white', border: '1px solid var(--gray-200)', borderRadius: 12, padding: '0.875rem 1.1rem', display: 'grid', gridTemplateColumns: '1fr auto', gap: '1rem', alignItems: 'center' }}>
                                            <div>
                                                <div style={{ fontSize: '0.72rem', color: 'var(--gray-400)', marginBottom: 3 }}>Stop #{i + 1}</div>
                                                <div style={{ fontSize: '0.82rem', color: 'var(--gray-700)', fontWeight: 500, marginBottom: 4 }}>
                                                    {stop.address || `${stop.latitude?.toFixed(5)}, ${stop.longitude?.toFixed(5)}`}
                                                </div>
                                                <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem', color: 'var(--gray-500)' }}>
                                                    <span>🕐 {fmt.date(stop.startTime)}</span>
                                                    <span>→</span>
                                                    <span>{fmt.date(stop.endTime)}</span>
                                                </div>
                                            </div>
                                            <div style={{ background: '#dcfce7', color: '#15803d', padding: '4px 12px', borderRadius: 99, fontWeight: 700, fontSize: '0.82rem', textAlign: 'center' }}>
                                                {fmt.mins(Math.round(stop.duration / 60000))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* ══ TAB: SPEED ══ */}
                            {activeTab === 'speed' && (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                    <Card>
                                        <SectionHeader title="🚀 Speed Distribution" subtitle="How much time spent at each speed range" />
                                        <SpeedHistogram data={r.speedHistogram} />
                                    </Card>
                                    <Card>
                                        <SectionHeader title="📊 Speed Stats" />
                                        {[
                                            ['Maximum Speed', fmt.kmh(r.overall?.maxSpeedKmh), '#ef4444'],
                                            ['Average Moving Speed', fmt.kmh(r.overall?.avgSpeedKmh), '#f59e0b'],
                                            ['Speeding Positions (>80)', `${r.speedHistogram?.filter(b => b.speedBin >= 80).reduce((s,b) => s+b.count,0) ?? 0} pts`, '#ef4444'],
                                            ['Moderate Speed (40–80)', `${r.speedHistogram?.filter(b => b.speedBin >= 40 && b.speedBin < 80).reduce((s,b) => s+b.count,0) ?? 0} pts`, '#f59e0b'],
                                            ['Safe Speed (<40)', `${r.speedHistogram?.filter(b => b.speedBin < 40).reduce((s,b) => s+b.count,0) ?? 0} pts`, '#22c55e'],
                                        ].map(([l, v, c]) => (
                                            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.6rem 0', borderBottom: '1px solid var(--gray-100)', fontSize: '0.82rem' }}>
                                                <span style={{ color: 'var(--gray-600)' }}>{l}</span>
                                                <span style={{ fontWeight: 700, color: c }}>{v}</span>
                                            </div>
                                        ))}
                                    </Card>
                                </div>
                            )}

                            {/* ══ TAB: DEVICE ══ */}
                            {activeTab === 'device' && (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                    <Card>
                                        <SectionHeader title="📡 GPS Signal Quality" />
                                        <div style={{ marginBottom: 16 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: '0.82rem' }}>
                                                <span style={{ color: 'var(--gray-500)' }}>Valid GPS Fixes</span>
                                                <span style={{ fontWeight: 700, color: '#22c55e' }}>{r.deviceStats?.gpsAccuracy}%</span>
                                            </div>
                                            <div style={{ background: 'var(--gray-100)', borderRadius: 99, height: 10, overflow: 'hidden' }}>
                                                <div style={{ width: `${r.deviceStats?.gpsAccuracy}%`, height: '100%', background: 'linear-gradient(90deg, #22c55e, #86efac)', borderRadius: 99, transition: 'width 0.4s' }} />
                                            </div>
                                        </div>
                                        {[
                                            ['Total Positions', r.deviceStats?.totalPositions?.toLocaleString()],
                                            ['Valid GPS Fixes', r.deviceStats?.validGPSCount?.toLocaleString()],
                                            ['Invalid Positions', (r.deviceStats?.totalPositions - r.deviceStats?.validGPSCount)?.toLocaleString()],
                                        ].map(([l, v]) => (
                                            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--gray-100)', fontSize: '0.82rem' }}>
                                                <span style={{ color: 'var(--gray-500)' }}>{l}</span>
                                                <span style={{ fontWeight: 600, color: 'var(--gray-800)' }}>{v}</span>
                                            </div>
                                        ))}
                                    </Card>

                                    <Card>
                                        <SectionHeader title="🔋 Battery &amp; Ignition" />
                                        {r.deviceStats?.minBattery != null && (
                                            <div style={{ marginBottom: 16 }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: '0.82rem' }}>
                                                    <span style={{ color: 'var(--gray-500)' }}>Battery Range</span>
                                                    <span style={{ fontWeight: 700, color: r.deviceStats.minBattery < 20 ? '#ef4444' : '#22c55e' }}>
                                                        {r.deviceStats.minBattery}% – {r.deviceStats.maxBattery}%
                                                    </span>
                                                </div>
                                                <div style={{ background: 'var(--gray-100)', borderRadius: 99, height: 10, overflow: 'hidden' }}>
                                                    <div style={{ width: `${r.deviceStats.maxBattery}%`, height: '100%', background: 'linear-gradient(90deg, #3b82f6, #06b6d4)', borderRadius: 99 }} />
                                                </div>
                                            </div>
                                        )}
                                        {[
                                            ['Ignition ON events', r.deviceStats?.ignitionOnCount],
                                            ['Ignition OFF events', r.deviceStats?.ignitionOffCount],
                                            ['Low Battery Events', r.deviceStats?.lowBatteryCount],
                                        ].map(([l, v]) => (
                                            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--gray-100)', fontSize: '0.82rem' }}>
                                                <span style={{ color: 'var(--gray-500)' }}>{l}</span>
                                                <span style={{ fontWeight: 600, color: 'var(--gray-800)' }}>{v ?? '—'}</span>
                                            </div>
                                        ))}
                                    </Card>

                                    <Card style={{ gridColumn: '1 / -1' }}>
                                        <SectionHeader title="🚗 Vehicle Info" />
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem' }}>
                                            {[
                                                ['Vehicle Name', vehicle?.name || '—'],
                                                ['IMEI / Unique ID', vehicle?.imei || vehicle?.uniqueId || '—'],
                                                ['Vehicle Number', vehicle?.vehicleNumber || '—'],
                                                ['Traccar ID', r.deviceId],
                                                ['Status', vehicle?.status || '—'],
                                                ['Report Generated', fmt.date(r.generatedAt)],
                                            ].map(([l, v]) => (
                                                <div key={l} style={{ background: 'var(--gray-50)', borderRadius: 8, padding: '0.65rem 0.875rem' }}>
                                                    <div style={{ fontSize: '0.68rem', color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{l}</div>
                                                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--gray-800)' }}>{v}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </Card>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
