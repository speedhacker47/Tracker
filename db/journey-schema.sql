-- ============================================
-- TrackPro Journey System: Database Schema
-- Run this against your TimescaleDB (trackerdb).
-- Requires TimescaleDB extension (already installed).
-- ============================================

-- 1. journey_stops — Detected vehicle stop events
CREATE TABLE IF NOT EXISTS journey_stops (
    id            BIGSERIAL PRIMARY KEY,
    device_id     INTEGER NOT NULL,
    arrived_at    TIMESTAMPTZ NOT NULL,
    departed_at   TIMESTAMPTZ,                -- NULL = vehicle still stopped
    latitude      DOUBLE PRECISION NOT NULL,
    longitude     DOUBLE PRECISION NOT NULL,
    duration_seconds INTEGER DEFAULT 0,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_journey_stops_device_date
    ON journey_stops (device_id, arrived_at DESC);

CREATE INDEX IF NOT EXISTS idx_journey_stops_open
    ON journey_stops (device_id) WHERE departed_at IS NULL;


-- 2. journey_segments — Movement periods between stops
CREATE TABLE IF NOT EXISTS journey_segments (
    id              BIGSERIAL PRIMARY KEY,
    device_id       INTEGER NOT NULL,
    started_at      TIMESTAMPTZ NOT NULL,
    ended_at        TIMESTAMPTZ NOT NULL,
    distance_meters DOUBLE PRECISION DEFAULT 0,
    status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','processing','done','failed')),
    error_message   TEXT,
    retry_count     INTEGER DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_journey_segments_device_date
    ON journey_segments (device_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_journey_segments_status
    ON journey_segments (status) WHERE status IN ('pending','failed');


-- 3. journey_segment_points — Road-snapped GPS points (TimescaleDB hypertable)
--    Partitioned by timestamp for fast time-range queries.
CREATE TABLE IF NOT EXISTS journey_segment_points (
    segment_id  BIGINT NOT NULL REFERENCES journey_segments(id) ON DELETE CASCADE,
    sequence    INTEGER NOT NULL,
    latitude    DOUBLE PRECISION NOT NULL,
    longitude   DOUBLE PRECISION NOT NULL,
    timestamp   TIMESTAMPTZ NOT NULL
);

-- Convert to hypertable partitioned by timestamp (7-day chunks)
SELECT create_hypertable('journey_segment_points', 'timestamp',
    chunk_time_interval => INTERVAL '7 days',
    if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS idx_segment_points_segment_seq
    ON journey_segment_points (segment_id, sequence);
