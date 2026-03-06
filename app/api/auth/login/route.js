import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { query } from '@/lib/db';
import { signToken } from '@/lib/auth';

/**
 * POST /api/auth/login
 *
 * Authenticates a client against the PostgreSQL `clients` table.
 * Returns a JWT token (7-day expiry) on success.
 */
export async function POST(request) {
    try {
        const body = await request.json();
        const { email, password } = body;

        // ── Input validation ──
        if (!email || !password) {
            return NextResponse.json(
                { error: 'Email and password are required' },
                { status: 400 }
            );
        }

        const trimmedEmail = email.trim().toLowerCase();

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
            return NextResponse.json(
                { error: 'Please enter a valid email address' },
                { status: 400 }
            );
        }

        if (password.length < 4) {
            return NextResponse.json(
                { error: 'Password must be at least 4 characters' },
                { status: 400 }
            );
        }

        // ── Find client in database ──
        const result = await query(
            'SELECT id, name, email, password FROM clients WHERE email = $1 AND is_active = true',
            [trimmedEmail]
        );

        if (result.rows.length === 0) {
            return NextResponse.json(
                { error: 'Invalid email or password' },
                { status: 401 }
            );
        }

        const client = result.rows[0];

        // ── Verify password (bcrypt) ──
        const validPassword = await bcrypt.compare(password, client.password);

        if (!validPassword) {
            return NextResponse.json(
                { error: 'Invalid email or password' },
                { status: 401 }
            );
        }

        // ── Generate JWT ──
        const token = signToken({ userId: client.id, email: client.email });

        return NextResponse.json({
            token,
            user: {
                id: client.id,
                name: client.name,
                email: client.email,
            },
        });
    } catch (err) {
        console.error('[Login] Error:', err.message);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
