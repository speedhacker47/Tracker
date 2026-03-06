import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { getDevices } from '@/lib/traccar';

const JWT_SECRET = process.env.JWT_SECRET || 'trackpro-dev-secret-change-in-production';

/**
 * GET /api/devices
 * 
 * Proxies to Traccar /api/devices.
 * Requires valid JWT in Authorization header.
 * 
 * Phase 2: Filter devices by client's assigned devices from client_devices table.
 */
export async function GET(request) {
    try {
        // Verify JWT
        const authHeader = request.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.split(' ')[1];
        try {
            jwt.verify(token, JWT_SECRET);
        } catch {
            return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
        }

        // Fetch devices from Traccar
        const devices = await getDevices();

        // ============================================
        // Phase 2: Filter by client's devices
        // ============================================
        // const decoded = jwt.verify(token, JWT_SECRET);
        // const { Pool } = require('pg');
        // const pool = new Pool({ connectionString: process.env.DATABASE_URL });
        // 
        // const result = await pool.query(
        //   'SELECT traccar_device_id, vehicle_name, vehicle_number FROM client_devices WHERE client_id = $1',
        //   [decoded.userId]
        // );
        // 
        // const clientDeviceIds = result.rows.map(r => r.traccar_device_id);
        // const filteredDevices = devices.filter(d => clientDeviceIds.includes(d.id));
        // 
        // // Merge in custom vehicle names
        // const enrichedDevices = filteredDevices.map(d => {
        //   const mapping = result.rows.find(r => r.traccar_device_id === d.id);
        //   return {
        //     ...d,
        //     name: mapping?.vehicle_name || d.name,
        //     vehicleNumber: mapping?.vehicle_number || d.uniqueId,
        //   };
        // });
        // 
        // return NextResponse.json(enrichedDevices);
        // ============================================

        return NextResponse.json(devices);
    } catch (err) {
        console.error('Devices API error:', err);
        return NextResponse.json(
            { error: 'Failed to fetch devices' },
            { status: 500 }
        );
    }
}
