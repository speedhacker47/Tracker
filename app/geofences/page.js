'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import NavBar from '@/components/NavBar';
import { apiFetch } from '@/lib/api';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Parse Traccar WKT area string into a human-readable description.
 * Traccar uses:
 *   CIRCLE (lat lon, radius)     — e.g. CIRCLE (28.6139 77.2090, 500)
 *   POLYGON ((lon lat, ...))     — e.g. POLYGON ((77.20 28.61, ...))
 */
function parseArea(area) {
    if (!area) return { type: 'Unknown', display: '—', coords: null, radius: null };

    const circleMatch = area.match(/CIRCLE\s*\(\s*([\d.]+)\s+([\d.]+)\s*,\s*([\d.]+)\s*\)/i);
    if (circleMatch) {
        const lat = parseFloat(circleMatch[1]);
        const lon = parseFloat(circleMatch[2]);
        const radius = parseFloat(circleMatch[3]);
        return {
            type: 'Circle',
            display: `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
            coords: { lat, lon },
            radius: radius >= 1000 ? `${(radius / 1000).toFixed(1)} km` : `${Math.round(radius)} m`,
        };
    }

    const polyMatch = area.match(/POLYGON\s*\(\((.+)\)\)/i);
    if (polyMatch) {
        const points = polyMatch[1].split(',').length;
        return { type: 'Polygon', display: `${points} points`, coords: null, radius: null };
    }

    return { type: 'Custom', display: area.substring(0, 40), coords: null, radius: null };
}

// ── Create geofence modal ─────────────────────────────────────────────────────

function CreateModal({ onClose, onCreate }) {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [mode, setMode] = useState('circle'); // 'circle' | 'coords'
    const [lat, setLat] = useState('');
    const [lon, setLon] = useState('');
    const [radius, setRadius] = useState('500');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async () => {
        setError('');
        if (!name.trim()) { setError('Name is required'); return; }

        let area = '';
        if (mode === 'circle') {
            const latN = parseFloat(lat), lonN = parseFloat(lon), radN = parseFloat(radius);
            if (isNaN(latN) || isNaN(lonN) || isNaN(radN)) { setError('Enter valid coordinates and radius'); return; }
            if (latN < -90 || latN > 90 || lonN < -180 || lonN > 180) { setError('Coordinates out of range'); return; }
            if (radN < 10 || radN > 100000) { setError('Radius must be between 10 and 100,000 meters'); return; }
            area = `CIRCLE (${latN} ${lonN}, ${radN})`;
        }

        setLoading(true);
        try {
            const res = await apiFetch('/api/geofences', {
                method: 'POST',
                body: JSON.stringify({ name: name.trim(), description: description.trim(), area }),
            });
            if (res.ok) {
                const created = await res.json();
                onCreate(created);
                onClose();
            } else {
                const body = await res.json().catch(() => ({}));
                setError(body.error || 'Failed to create geofence');
            }
        } catch (e) {
            setError('Connection error. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const labelStyle = { display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--gray-600)', marginBottom: '0.375rem' };
    const inputStyle = {
        width: '100%', height: 36, padding: '0 0.75rem', fontSize: '0.875rem',
        border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)',
        background: 'white', color: 'var(--gray-800)', fontFamily: 'var(--font-sans)',
        boxSizing: 'border-box',
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: '1rem',
        }}>
            <div style={{
                background: 'white', borderRadius: 'var(--radius-2xl)',
                width: '100%', maxWidth: 480,
                boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
                animation: 'fadeInUp 0.2s ease',
            }}>
                {/* Header */}
                <div style={{
                    padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--gray-100)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                        <div style={{
                            width: 32, height: 32, borderRadius: 'var(--radius-sm)',
                            background: 'var(--primary-50)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--primary-500)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z" />
                                <circle cx="12" cy="10" r="3" />
                            </svg>
                        </div>
                        <span style={{ fontSize: '1rem', fontWeight: 400, color: 'var(--gray-800)' }}>New Geofence</span>
                    </div>
                    <button onClick={onClose} style={{
                        width: 30, height: 30, borderRadius: '50%', border: '1px solid var(--gray-200)',
                        background: 'var(--gray-50)', cursor: 'pointer', color: 'var(--gray-500)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                {/* Body */}
                <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                    {error && (
                        <div style={{ padding: '0.625rem 0.875rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--radius-md)', color: '#b91c1c', fontSize: '0.8125rem', fontWeight: 500 }}>
                            ⚠ {error}
                        </div>
                    )}

                    {/* Name */}
                    <div>
                        <label style={labelStyle}>Zone Name *</label>
                        <input style={inputStyle} placeholder="e.g. Warehouse, Office, Client Site" value={name} onChange={e => setName(e.target.value)} />
                    </div>

                    {/* Description */}
                    <div>
                        <label style={labelStyle}>Description (optional)</label>
                        <input style={inputStyle} placeholder="Short description" value={description} onChange={e => setDescription(e.target.value)} />
                    </div>

                    {/* Type */}
                    <div>
                        <label style={labelStyle}>Zone Type</label>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            {[{ k: 'circle', label: '⭕ Circle (Lat/Lon + Radius)' }].map(opt => (
                                <button key={opt.k} onClick={() => setMode(opt.k)}
                                    style={{
                                        flex: 1, padding: '0.5rem 0.75rem', fontSize: '0.8125rem', fontWeight: 600,
                                        fontFamily: 'var(--font-sans)', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                                        border: mode === opt.k ? '2px solid #0891b2' : '1px solid var(--gray-200)',
                                        background: mode === opt.k ? '#ecfeff' : 'white',
                                        color: mode === opt.k ? '#0891b2' : 'var(--gray-600)',
                                    }}>
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Circle inputs */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
                        <div>
                            <label style={labelStyle}>Latitude *</label>
                            <input style={inputStyle} type="number" step="0.00001" placeholder="28.6139" value={lat} onChange={e => setLat(e.target.value)} />
                        </div>
                        <div>
                            <label style={labelStyle}>Longitude *</label>
                            <input style={inputStyle} type="number" step="0.00001" placeholder="77.2090" value={lon} onChange={e => setLon(e.target.value)} />
                        </div>
                        <div>
                            <label style={labelStyle}>Radius (meters) *</label>
                            <input style={inputStyle} type="number" min="10" max="100000" placeholder="500" value={radius} onChange={e => setRadius(e.target.value)} />
                        </div>
                    </div>

                    <p style={{ fontSize: '0.75rem', color: 'var(--gray-400)', margin: 0 }}>
                        💡 Tip: Open Google Maps, right-click your location, and copy the coordinates shown.
                    </p>
                </div>

                {/* Footer */}
                <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--gray-100)', display: 'flex', gap: '0.625rem', justifyContent: 'flex-end' }}>
                    <button onClick={onClose}
                        style={{
                            height: 36, padding: '0 1rem', fontSize: '0.875rem', fontWeight: 600,
                            fontFamily: 'var(--font-sans)', border: '1px solid var(--gray-200)',
                            borderRadius: 'var(--radius-md)', background: 'white',
                            color: 'var(--gray-600)', cursor: 'pointer',
                        }}>Cancel</button>
                    <button onClick={handleSubmit} disabled={loading}
                        style={{
                            height: 36, padding: '0 1.25rem', fontSize: '0.875rem', fontWeight: 500,
                            fontFamily: 'var(--font-sans)', border: 'none', borderRadius: 'var(--radius-sm)',
                            background: loading ? 'var(--gray-300)' : 'var(--primary-500)',
                            color: 'white', cursor: loading ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', gap: '0.375rem',
                        }}>
                        {loading ? <><div className="map-loading-spinner" style={{ width: 13, height: 13, borderWidth: 2 }} />Creating…</> : 'Create Geofence'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Delete confirm modal ──────────────────────────────────────────────────────

function DeleteModal({ geofence, onClose, onDelete }) {
    const [loading, setLoading] = useState(false);

    const handleDelete = async () => {
        setLoading(true);
        try {
            const res = await apiFetch(`/api/geofences/${geofence.id}`, { method: 'DELETE' });
            if (res.ok || res.status === 204) {
                onDelete(geofence.id);
                onClose();
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: '1rem',
        }}>
            <div style={{ background: 'white', borderRadius: 'var(--radius-2xl)', maxWidth: 400, width: '100%', padding: '1.5rem', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
                <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
                    <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                            <path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                        </svg>
                    </div>
                    <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--gray-900)', marginBottom: '0.375rem' }}>Delete Geofence?</div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--gray-500)' }}>
                        "<strong>{geofence.name}</strong>" will be permanently deleted from Traccar. This cannot be undone.
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '0.625rem' }}>
                    <button onClick={onClose} style={{
                        flex: 1, height: 38, fontSize: '0.875rem', fontWeight: 600,
                        fontFamily: 'var(--font-sans)', border: '1px solid var(--gray-200)',
                        borderRadius: 'var(--radius-md)', background: 'white',
                        color: 'var(--gray-600)', cursor: 'pointer',
                    }}>Cancel</button>
                    <button onClick={handleDelete} disabled={loading} style={{
                        flex: 1, height: 38, fontSize: '0.875rem', fontWeight: 600,
                        fontFamily: 'var(--font-sans)', border: 'none',
                        borderRadius: 'var(--radius-md)',
                        background: loading ? 'var(--gray-200)' : '#dc2626',
                        color: 'white', cursor: loading ? 'not-allowed' : 'pointer',
                    }}>
                        {loading ? 'Deleting…' : 'Delete'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function GeofencesPage() {
    const router = useRouter();

    const [geofences, setGeofences] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [showCreate, setShowCreate] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [search, setSearch] = useState('');

    useEffect(() => {
        const load = async () => {
            const user = await new Promise(resolve => {
                const unsub = onAuthStateChanged(auth, u => { unsub(); resolve(u); });
            });
            if (!user) { router.push('/login'); return; }

            try {
                const res = await apiFetch('/api/geofences');
                if (res.status === 401) { router.push('/login'); return; }
                if (res.ok) {
                    setGeofences(await res.json());
                } else {
                    setError('Failed to load geofences');
                }
            } catch (e) {
                setError('Connection error');
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [router]);

    const filteredGeofences = geofences.filter(g =>
        g.name.toLowerCase().includes(search.toLowerCase()) ||
        (g.description || '').toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="dashboard-shell">
            <NavBar />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--gray-50)' }}>

                {/* ── Header ── */}
                <div style={{
                    background: 'white', borderBottom: '1px solid var(--gray-200)',
                    padding: '0 1.75rem', minHeight: 64, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: '1rem', flexWrap: 'wrap',
                }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                        <h1 style={{ fontSize: '1.125rem', fontWeight: 400, color: 'var(--gray-800)', margin: 0 }}>Geofences</h1>
                        <span style={{ fontSize: '0.8125rem', color: 'var(--gray-500)' }}>
                            {loading ? 'Loading…' : `${geofences.length} zone${geofences.length !== 1 ? 's' : ''} defined`}
                        </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                        {/* Search */}
                        <div style={{ position: 'relative' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--gray-400)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                                style={{ position: 'absolute', left: '0.625rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                            </svg>
                            <input
                                placeholder="Search zones…"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                style={{
                                    height: 34, padding: '0 0.75rem 0 2rem', fontSize: '0.8125rem',
                                    border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)',
                                    background: 'white', color: 'var(--gray-700)', fontFamily: 'var(--font-sans)',
                                    width: 180,
                                }}
                            />
                        </div>

                        {/* Create button */}
                        <button onClick={() => setShowCreate(true)}
                            style={{
                                height: 34, padding: '0 1rem', fontSize: '0.875rem', fontWeight: 500,
                                fontFamily: 'var(--font-sans)', border: 'none', borderRadius: 'var(--radius-sm)',
                                background: 'var(--primary-500)',
                                color: 'white', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '0.375rem',
                                transition: 'background var(--transition-fast)',
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--primary-600)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'var(--primary-500)'}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                            </svg>
                            New Zone
                        </button>
                    </div>
                </div>

                {/* ── Body ── */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem 1.75rem' }}>

                    {error && (
                        <div style={{ marginBottom: '1rem', padding: '0.875rem 1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--radius-lg)', color: '#b91c1c', fontSize: '0.875rem', fontWeight: 500 }}>
                            ⚠ {error}
                        </div>
                    )}

                    {loading && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: '5rem', flexDirection: 'column', gap: '1rem' }}>
                            <div className="map-loading-spinner" style={{ width: 32, height: 32 }} />
                            <span style={{ color: 'var(--gray-400)', fontSize: '0.875rem' }}>Loading geofences…</span>
                        </div>
                    )}

                    {!loading && filteredGeofences.length === 0 && (
                        <div style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center',
                            padding: '5rem 2rem', gap: '1rem',
                            background: 'var(--gray-50)', borderRadius: 'var(--radius-xl)',
                            border: '1.5px dashed var(--gray-200)',
                        }}>
                            <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="var(--gray-200)" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z" />
                                <circle cx="12" cy="10" r="3" />
                            </svg>
                            <p style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--gray-400)' }}>
                                {search ? 'No matching zones' : 'No geofences yet'}
                            </p>
                            {!search && (
                                <p style={{ fontSize: '0.875rem', color: 'var(--gray-400)' }}>
                                    Create your first zone to track vehicle enter/exit events
                                </p>
                            )}
                            {!search && (
                                <button onClick={() => setShowCreate(true)}
                                    style={{
                                        height: 36, padding: '0 1.25rem', fontSize: '0.875rem', fontWeight: 600,
                                        fontFamily: 'var(--font-sans)', border: 'none', borderRadius: 'var(--radius-md)',
                                        background: 'linear-gradient(135deg, #0891b2, #06b6d4)',
                                        color: 'white', cursor: 'pointer', marginTop: '0.5rem',
                                    }}>Create First Zone</button>
                            )}
                        </div>
                    )}

                    {!loading && filteredGeofences.length > 0 && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
                            {filteredGeofences.map(geo => {
                                const parsed = parseArea(geo.area);
                                return (
                                    <div key={geo.id} style={{
                                        background: 'white', border: '1px solid var(--gray-200)',
                                        borderRadius: 'var(--radius-xl)', padding: '1.125rem 1.25rem',
                                        boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                                        display: 'flex', flexDirection: 'column', gap: '0.75rem',
                                    }}>
                                        {/* Top row */}
                                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                                                <div style={{
                                                    width: 36, height: 36, borderRadius: 'var(--radius-md)',
                                                    background: '#ecfeff', color: '#0891b2',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                                }}>
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                        <path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z" />
                                                        <circle cx="12" cy="10" r="3" />
                                                    </svg>
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--gray-900)' }}>{geo.name}</div>
                                                    {geo.description && (
                                                        <div style={{ fontSize: '0.8125rem', color: 'var(--gray-500)', marginTop: '0.1rem' }}>{geo.description}</div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Delete button */}
                                            <button onClick={() => setDeleteTarget(geo)}
                                                style={{
                                                    width: 30, height: 30, borderRadius: 'var(--radius-sm)',
                                                    border: '1px solid var(--gray-200)', background: 'var(--gray-50)',
                                                    color: 'var(--gray-400)', cursor: 'pointer', flexShrink: 0,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    transition: 'all 0.12s',
                                                }}
                                                onMouseEnter={e => { e.currentTarget.style.background = '#fee2e2'; e.currentTarget.style.color = '#dc2626'; e.currentTarget.style.borderColor = '#fecaca'; }}
                                                onMouseLeave={e => { e.currentTarget.style.background = 'var(--gray-50)'; e.currentTarget.style.color = 'var(--gray-400)'; e.currentTarget.style.borderColor = 'var(--gray-200)'; }}
                                            >
                                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                    <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                                    <path d="M10 11v6" /><path d="M14 11v6" />
                                                </svg>
                                            </button>
                                        </div>

                                        {/* Zone info */}
                                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                            <span style={{ padding: '0.2rem 0.6rem', background: '#ecfeff', color: '#0891b2', borderRadius: 'var(--radius-full)', fontSize: '0.75rem', fontWeight: 600 }}>
                                                {parsed.type}
                                            </span>
                                            {parsed.radius && (
                                                <span style={{ padding: '0.2rem 0.6rem', background: 'var(--gray-100)', color: 'var(--gray-600)', borderRadius: 'var(--radius-full)', fontSize: '0.75rem', fontWeight: 500 }}>
                                                    r = {parsed.radius}
                                                </span>
                                            )}
                                            <span style={{ padding: '0.2rem 0.6rem', background: 'var(--gray-100)', color: 'var(--gray-600)', borderRadius: 'var(--radius-full)', fontSize: '0.75rem', fontWeight: 500, fontFamily: 'monospace' }}>
                                                {parsed.display}
                                            </span>
                                        </div>

                                        {/* Traccar ID */}
                                        <div style={{ fontSize: '0.75rem', color: 'var(--gray-400)' }}>ID #{geo.id}</div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Modals */}
            {showCreate && (
                <CreateModal
                    onClose={() => setShowCreate(false)}
                    onCreate={created => setGeofences(prev => [...prev, created])}
                />
            )}
            {deleteTarget && (
                <DeleteModal
                    geofence={deleteTarget}
                    onClose={() => setDeleteTarget(null)}
                    onDelete={id => setGeofences(prev => prev.filter(g => g.id !== id))}
                />
            )}
        </div>
    );
}