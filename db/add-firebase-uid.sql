-- Phase 1: Add firebase_uid column to client_devices
-- Run this migration on TimescaleDB after deploying Firebase auth
-- The old client_id column is preserved for backward compatibility

ALTER TABLE client_devices ADD COLUMN IF NOT EXISTS firebase_uid VARCHAR(128);

-- Index for fast lookups by firebase_uid (used in devices/positions API routes)
CREATE INDEX IF NOT EXISTS idx_client_devices_firebase_uid ON client_devices(firebase_uid);
