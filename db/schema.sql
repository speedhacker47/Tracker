-- ============================================
-- TrackPro Phase 2: Database Schema
-- Run this against your Neon PostgreSQL database
-- ============================================

-- Clients table (your customers who pay monthly)
CREATE TABLE IF NOT EXISTS clients (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,  -- bcrypt hashed
    company VARCHAR(255),
    phone VARCHAR(50),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Client-Device mapping (which devices belong to which client)
CREATE TABLE IF NOT EXISTS client_devices (
    id SERIAL PRIMARY KEY,
    client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
    traccar_device_id INTEGER NOT NULL,  -- matches Traccar's device.id
    vehicle_name VARCHAR(255),           -- custom name for the vehicle
    vehicle_number VARCHAR(100),         -- e.g., license plate
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(client_id, traccar_device_id)
);

-- Index for fast lookups
CREATE INDEX idx_client_devices_client ON client_devices(client_id);
CREATE INDEX idx_client_devices_device ON client_devices(traccar_device_id);
CREATE INDEX idx_clients_email ON clients(email);

-- ============================================
-- Insert a demo client for testing
-- Password: demo123 (bcrypt hashed)
-- ============================================
-- To generate this hash, run in Node.js:
--   const bcrypt = require('bcryptjs');
--   bcrypt.hashSync('demo123', 10);
-- Result: $2a$10$... (your hash will differ)
-- ============================================

-- INSERT INTO clients (name, email, password, company) VALUES 
-- ('Demo User', 'demo@trackpro.com', '$2a$10$YOUR_BCRYPT_HASH_HERE', 'Demo Company');

-- INSERT INTO client_devices (client_id, traccar_device_id, vehicle_name, vehicle_number) VALUES 
-- (1, 1, 'Truck #1', 'CG-04-AB-1234');
