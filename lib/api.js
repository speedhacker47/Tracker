/**
 * Frontend API Client
 *
 * All client-side fetch calls use relative URLs (/api/...).
 *
 * - Local dev: calls go to the Next.js dev server directly
 * - Vercel: Next.js rewrites proxy /api/* to the EC2 backend (server-side)
 * - EC2 Docker: API routes run locally in the same container
 *
 * This avoids CORS and mixed-content issues entirely.
 */

import { getFirebaseToken } from '@/lib/firebase';

/**
 * Authenticated fetch — automatically attaches Firebase ID Token.
 *
 * @param {string} path - API path, e.g. '/api/devices'
 * @param {RequestInit} options - fetch options
 * @returns {Promise<Response>}
 */
export async function apiFetch(path, options = {}) {
    const token = typeof window !== 'undefined'
        ? await getFirebaseToken()
        : null;

    const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
    };

    return fetch(path, { ...options, headers });
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
