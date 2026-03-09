/**
 * Frontend API Client
 *
 * All client-side fetch calls go through this helper.
 * In development: calls go to /api/... (same Next.js dev server)
 * On Vercel (production frontend): calls go to http://13.205.187.228/api/...
 *
 * Set NEXT_PUBLIC_API_URL in your Vercel project environment variables.
 * Leave it empty for local dev (relative URLs work fine).
 */

// Pulls from the build-time baked env var. Empty string = use relative URLs.
const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

/**
 * Authenticated fetch — automatically attaches JWT token from localStorage.
 *
 * @param {string} path - API path, e.g. '/api/devices'
 * @param {RequestInit} options - fetch options
 * @returns {Promise<Response>}
 */
export async function apiFetch(path, options = {}) {
    const token = typeof window !== 'undefined'
        ? localStorage.getItem('token')
        : null;

    const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
    };

    return fetch(`${API_BASE}${path}`, { ...options, headers });
}

/**
 * Convenience: fetch JSON and return parsed body.
 * Throws an Error if the response is not ok.
 */
export async function apiGet(path) {
    const res = await apiFetch(path);
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `API error ${res.status}`);
    }
    return res.json();
}

/**
 * Convenience: POST JSON body and return parsed response.
 */
export async function apiPost(path, body) {
    const res = await apiFetch(path, {
        method: 'POST',
        body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(data.error || `API error ${res.status}`);
    }
    return data;
}
