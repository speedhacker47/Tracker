'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import NavBar from '@/components/NavBar';
import { apiFetch } from '@/lib/api';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';

function parseArea(area) {
    if (!area) return { type: 'Unknown', display: '—', radius: null };
    const circleMatch = area.match(/CIRCLE\s*\(\s*([\d.]+)\s+([\d.]+)\s*,\s*([\d.]+)\s*\)/i);
    if (circleMatch) return { type: 'Circle', display: `${parseFloat(circleMatch[1]).toFixed(5)}, ${parseFloat(circleMatch[2]).toFixed(5)}`, radius: parseFloat(circleMatch[3]) };
    const polyMatch = area.match(/POLYGON\s*\(\((.+)\)\)/i);
    if (polyMatch) return { type: 'Polygon', display: `${polyMatch[1].split(',').length} points`, radius: null };
    return { type: 'Custom', display: area.substring(0, 40), radius: null };
}

function CreateModal({ onClose, onCreate }) {
    const [name, setName] = useState('');
    const [lat, setLat] = useState('');
    const [lon, setLon] = useState('');
    const [radius, setRadius] = useState('500');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async () => {
        setError('');
        if (!name.trim()) { setError('Name is required'); return; }
        const latN = parseFloat(lat), lonN = parseFloat(lon), radN = parseFloat(radius);
        if (isNaN(latN) || isNaN(lonN) || isNaN(radN)) { setError('Enter valid coordinates and radius'); return; }

        setLoading(true);
        try {
            const res = await apiFetch('/api/geofences', {
                method: 'POST', body: JSON.stringify({ name: name.trim(), area: `CIRCLE (${latN} ${lonN}, ${radN})` }),
            });
            if (res.ok) { onCreate(await res.json()); onClose(); }
            else { setError((await res.json().catch(() => ({}))).error || 'Failed to create'); }
        } catch (e) { setError('Connection error.'); } finally { setLoading(false); }
    };

    const inputStyle = { width: '100%', padding: '8px 12px', fontSize: '0.875rem', border: '1px solid var(--gray-300)', borderRadius: '4px', background: 'white', color: 'var(--gray-900)', outline: 'none', marginBottom: '16px' };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ background: 'white', borderRadius: '8px', width: '400px', boxShadow: 'var(--shadow-lg)' }}>
                <div style={{ padding: '24px', borderBottom: '1px solid var(--gray-200)' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 400, color: 'var(--gray-900)', margin: 0 }}>Create Geofence</h2>
                </div>
                <div style={{ padding: '24px' }}>
                    {error && <div style={{ color: 'var(--danger-600)', fontSize: '0.875rem', marginBottom: '16px' }}>{error}</div>}
                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--gray-600)', marginBottom: '4px' }}>Name</label>
                    <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} onFocus={e => e.target.style.border = '2px solid var(--primary-500)'} onBlur={e => e.target.style.border = '1px solid var(--gray-300)'} />

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div><label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--gray-600)', marginBottom: '4px' }}>Latitude</label><input type="number" style={inputStyle} value={lat} onChange={e => setLat(e.target.value)} onFocus={e => e.target.style.border = '2px solid var(--primary-500)'} onBlur={e => e.target.style.border = '1px solid var(--gray-300)'} /></div>
                        <div><label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--gray-600)', marginBottom: '4px' }}>Longitude</label><input type="number" style={inputStyle} value={lon} onChange={e => setLon(e.target.value)} onFocus={e => e.target.style.border = '2px solid var(--primary-500)'} onBlur={e => e.target.style.border = '1px solid var(--gray-300)'} /></div>
                    </div>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--gray-600)', marginBottom: '4px' }}>Radius (meters)</label>
                    <input type="number" style={inputStyle} value={radius} onChange={e => setRadius(e.target.value)} onFocus={e => e.target.style.border = '2px solid var(--primary-500)'} onBlur={e => e.target.style.border = '1px solid var(--gray-300)'} />
                </div>
                <div style={{ padding: '16px 24px', display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid var(--gray-200)' }}>
                    <button onClick={onClose} style={{ padding: '8px 16px', background: 'transparent', border: 'none', color: 'var(--primary-600)', fontWeight: 500, cursor: 'pointer', borderRadius: '4px' }} onMouseOver={e => e.target.style.background = 'var(--primary-50)'} onMouseOut={e => e.target.style.background = 'transparent'}>Cancel</button>
                    <button onClick={handleSubmit} disabled={loading} style={{ padding: '8px 16px', background: 'var(--primary-500)', border: 'none', color: 'white', fontWeight: 500, cursor: 'pointer', borderRadius: '4px' }} onMouseOver={e => e.target.style.background = 'var(--primary-600)'} onMouseOut={e => e.target.style.background = 'var(--primary-500)'}>Save</button>
                </div>
            </div>
        </div>
    );
}

export default function GeofencesPage() {
    const router = useRouter();
    const [geofences, setGeofences] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);

    useEffect(() => {
        const load = async () => {
            const user = await new Promise(res => onAuthStateChanged(auth, u => res(u)));
            if (!user) { router.push('/login'); return; }
            try {
                const res = await apiFetch('/api/geofences');
                if (res.ok) setGeofences(await res.json());
            } catch (e) { console.error(e); } finally { setLoading(false); }
        };
        load();
    }, [router]);

    const deleteGeo = async (id) => {
        if (!confirm('Delete geofence?')) return;
        await apiFetch(`/api/geofences/${id}`, { method: 'DELETE' });
        setGeofences(prev => prev.filter(g => g.id !== id));
    };

    return (
        <div className="dashboard-shell">
            <NavBar />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--gray-50)' }}>
                <div style={{ background: 'white', borderBottom: '1px solid var(--gray-300)', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h1 style={{ fontSize: '1.25rem', fontWeight: 400, color: 'var(--gray-800)', margin: 0 }}>Geofences</h1>
                    <button onClick={() => setShowCreate(true)} style={{ padding: '8px 16px', background: 'var(--primary-500)', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 500, cursor: 'pointer' }}>Create Geofence</button>
                </div>

                <div style={{ padding: '24px', flex: 1, overflowY: 'auto' }}>
                    {loading ? <div style={{ textAlign: 'center', marginTop: '48px', color: 'var(--gray-500)' }}>Loading...</div> : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
                            {geofences.map(geo => {
                                const parsed = parseArea(geo.area);
                                return (
                                    <div key={geo.id} style={{ background: 'white', border: '1px solid var(--gray-300)', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                            <div style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--gray-900)' }}>{geo.name}</div>
                                            <button onClick={() => deleteGeo(geo.id)} style={{ background: 'transparent', border: 'none', color: 'var(--gray-500)', cursor: 'pointer' }}>✕</button>
                                        </div>
                                        <div style={{ fontSize: '0.875rem', color: 'var(--gray-600)', marginBottom: '4px' }}>{parsed.type} ({parsed.radius ? `${parsed.radius}m` : 'N/A'})</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>{parsed.display}</div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
            {showCreate && <CreateModal onClose={() => setShowCreate(false)} onCreate={g => setGeofences([...geofences, g])} />}
        </div>
    );
}