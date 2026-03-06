import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'trackpro-dev-secret-change-in-production';

/**
 * POST /api/auth/login
 * 
 * For Phase 1: Simple demo login. 
 * Accepts any email with password "demo123" OR validates against Neon DB (Phase 2).
 * 
 * In production (Phase 2), this will check `clients` table in Neon with bcrypt.
 * For now, we use a simple demo mode so you can test the UI immediately.
 */
export async function POST(request) {
    try {
        const { email, password } = await request.json();

        if (!email || !password) {
            return NextResponse.json(
                { error: 'Email and password are required' },
                { status: 400 }
            );
        }

        // ============================================
        // Phase 1: Demo login (for development/testing)
        // Accept demo password to test the frontend
        // ============================================
        const DEMO_PASSWORD = 'demo123';

        let user = null;

        if (password === DEMO_PASSWORD) {
            user = {
                id: 1,
                name: email.split('@')[0],
                email: email,
            };
        }

        // ============================================
        // Phase 2: Real DB authentication (uncomment later)
        // ============================================
        // const { Pool } = require('pg');
        // const bcrypt = require('bcryptjs');
        // 
        // const pool = new Pool({ connectionString: process.env.DATABASE_URL });
        // 
        // const result = await pool.query(
        //   'SELECT id, name, email, password FROM clients WHERE email = $1 AND is_active = true',
        //   [email.toLowerCase()]
        // );
        // 
        // if (result.rows.length === 0) {
        //   return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
        // }
        // 
        // const client = result.rows[0];
        // const validPassword = await bcrypt.compare(password, client.password);
        // 
        // if (!validPassword) {
        //   return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
        // }
        // 
        // user = { id: client.id, name: client.name, email: client.email };
        // ============================================

        if (!user) {
            return NextResponse.json(
                { error: 'Invalid email or password' },
                { status: 401 }
            );
        }

        // Generate JWT
        const token = jwt.sign(
            { userId: user.id, email: user.email },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        return NextResponse.json({
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
            },
        });
    } catch (err) {
        console.error('Login error:', err);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
