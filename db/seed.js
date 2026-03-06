/**
 * Seed script for TrackPro Phase 2
 * 
 * Creates a demo client in the Neon database.
 * Run with: node db/seed.js
 * 
 * Prerequisites:
 * - DATABASE_URL must be set in .env.local
 * - Schema must be created first (run schema.sql)
 */

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

// Load env from .env.local
require('dotenv').config({ path: '.env.local' });

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL not found in .env.local');
    console.error('   Please uncomment and set your Neon connection string.');
    process.exit(1);
}

async function seed() {
    const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

    try {
        console.log('🌱 Seeding TrackPro database...\n');

        // Create tables
        console.log('📋 Creating tables...');
        await pool.query(`
      CREATE TABLE IF NOT EXISTS clients (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        company VARCHAR(255),
        phone VARCHAR(50),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

        await pool.query(`
      CREATE TABLE IF NOT EXISTS client_devices (
        id SERIAL PRIMARY KEY,
        client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
        traccar_device_id INTEGER NOT NULL,
        vehicle_name VARCHAR(255),
        vehicle_number VARCHAR(100),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(client_id, traccar_device_id)
      );
    `);
        console.log('   ✅ Tables created\n');

        // Hash password
        const demoPassword = 'demo123';
        const hashedPassword = await bcrypt.hash(demoPassword, 10);

        // Create demo client
        console.log('👤 Creating demo client...');
        const existing = await pool.query('SELECT id FROM clients WHERE email = $1', ['demo@trackpro.com']);

        let clientId;
        if (existing.rows.length > 0) {
            clientId = existing.rows[0].id;
            await pool.query(
                'UPDATE clients SET password = $1, name = $2 WHERE id = $3',
                [hashedPassword, 'Demo User', clientId]
            );
            console.log('   ✅ Demo client updated (already existed)');
        } else {
            const result = await pool.query(
                'INSERT INTO clients (name, email, password, company) VALUES ($1, $2, $3, $4) RETURNING id',
                ['Demo User', 'demo@trackpro.com', hashedPassword, 'Demo Company']
            );
            clientId = result.rows[0].id;
            console.log('   ✅ Demo client created');
        }

        console.log(`   📧 Email: demo@trackpro.com`);
        console.log(`   🔑 Password: ${demoPassword}`);
        console.log(`   🆔 Client ID: ${clientId}\n`);

        // Assign device (Traccar device ID 1 = Device01)
        console.log('🚗 Assigning Device01 to demo client...');
        const deviceExists = await pool.query(
            'SELECT id FROM client_devices WHERE client_id = $1 AND traccar_device_id = $2',
            [clientId, 1]
        );

        if (deviceExists.rows.length === 0) {
            await pool.query(
                'INSERT INTO client_devices (client_id, traccar_device_id, vehicle_name, vehicle_number) VALUES ($1, $2, $3, $4)',
                [clientId, 1, 'Truck #1', 'CG-04-AB-1234']
            );
            console.log('   ✅ Device01 assigned as "Truck #1"');
        } else {
            console.log('   ✅ Device01 already assigned');
        }

        console.log('\n🎉 Seed complete! You can now log in with:');
        console.log('   Email: demo@trackpro.com');
        console.log('   Password: demo123');

    } catch (err) {
        console.error('❌ Seed error:', err.message);
    } finally {
        await pool.end();
    }
}

seed();
