#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════════
# OSRM Setup Script — India (for t3.medium / 4GB RAM)
#
# Run this ONCE on your EC2 server before starting docker-compose.
# It downloads the India OSM extract, processes it for OSRM (MLD algorithm),
# and leaves the files ready for osrm-routed.
#
# The extraction step needs more RAM than 4GB has, so we temporarily add
# swap space. This is automatically cleaned up after processing.
#
# Usage:
#   chmod +x osrm/setup-osrm.sh
#   sudo ./osrm/setup-osrm.sh
#
# Time estimate: 30-60 minutes (depends on disk speed)
# Disk space needed: ~15 GB temporary, ~8-10 GB final
# ══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

DATA_DIR="$(cd "$(dirname "$0")" && pwd)/data"
SWAP_FILE="/swapfile_osrm"
SWAP_SIZE="4G"
GEOFABRIK_URL="https://download.geofabrik.de/asia/india-latest.osm.pbf"
PBF_FILE="$DATA_DIR/india-latest.osm.pbf"

echo "══════════════════════════════════════════════════════════════════"
echo "  OSRM Setup — India (MLD Algorithm, mmap mode)"
echo "══════════════════════════════════════════════════════════════════"
echo ""

# ── 1. Create data directory ─────────────────────────────────────────────────
echo "📁 Creating data directory: $DATA_DIR"
mkdir -p "$DATA_DIR"

# ── 2. Download India OSM extract ────────────────────────────────────────────
if [ -f "$PBF_FILE" ]; then
    echo "✓ India PBF already exists, skipping download"
else
    echo "⬇️  Downloading India OSM extract from Geofabrik (~1.5 GB)..."
    echo "   URL: $GEOFABRIK_URL"
    wget -c -O "$PBF_FILE" "$GEOFABRIK_URL"
    echo "✓ Download complete: $(du -h "$PBF_FILE" | cut -f1)"
fi

# ── 3. Add temporary swap space (extraction needs >4GB RAM) ──────────────────
SWAP_ADDED=false
if [ ! -f "$SWAP_FILE" ]; then
    echo "💾 Adding ${SWAP_SIZE} temporary swap for extraction..."
    fallocate -l "$SWAP_SIZE" "$SWAP_FILE" || dd if=/dev/zero of="$SWAP_FILE" bs=1M count=4096
    chmod 600 "$SWAP_FILE"
    mkswap "$SWAP_FILE"
    swapon "$SWAP_FILE"
    SWAP_ADDED=true
    echo "✓ Swap enabled ($(swapon --show | tail -1))"
else
    echo "✓ Swap file already exists"
    if ! swapon --show | grep -q "$SWAP_FILE"; then
        swapon "$SWAP_FILE"
        SWAP_ADDED=true
    fi
fi

echo ""
echo "Memory status:"
free -h
echo ""

# ── 4. OSRM Extract ─────────────────────────────────────────────────────────
echo "🔧 Step 1/3: osrm-extract (this takes 15-30 min)..."
docker run --rm -t \
    -v "$DATA_DIR:/data" \
    osrm/osrm-backend:latest \
    osrm-extract -p /opt/car.lua /data/india-latest.osm.pbf

echo "✓ Extract complete"

# ── 5. OSRM Partition (MLD) ─────────────────────────────────────────────────
echo "🔧 Step 2/3: osrm-partition..."
docker run --rm -t \
    -v "$DATA_DIR:/data" \
    osrm/osrm-backend:latest \
    osrm-partition /data/india-latest.osrm

echo "✓ Partition complete"

# ── 6. OSRM Customize (MLD) ─────────────────────────────────────────────────
echo "🔧 Step 3/3: osrm-customize..."
docker run --rm -t \
    -v "$DATA_DIR:/data" \
    osrm/osrm-backend:latest \
    osrm-customize /data/india-latest.osrm

echo "✓ Customize complete"

# ── 7. Cleanup ───────────────────────────────────────────────────────────────
echo ""
echo "🧹 Cleaning up..."

# Remove the original PBF file (saves ~1.5 GB)
rm -f "$PBF_FILE"
echo "  ✓ Removed PBF file"

# Remove temporary swap
if [ "$SWAP_ADDED" = true ]; then
    swapoff "$SWAP_FILE" 2>/dev/null || true
    rm -f "$SWAP_FILE"
    echo "  ✓ Removed temporary swap"
fi

# ── 8. Summary ───────────────────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════════════════"
echo "  ✅ OSRM Setup Complete!"
echo "══════════════════════════════════════════════════════════════════"
echo ""
echo "Data directory: $DATA_DIR"
echo "Files:"
ls -lh "$DATA_DIR"/india-latest.osrm* 2>/dev/null | awk '{print "  " $9 " — " $5}'
echo ""
echo "Total size: $(du -sh "$DATA_DIR" | cut -f1)"
echo ""
echo "Next steps:"
echo "  1. Start the stack:  docker compose up -d"
echo "  2. Check OSRM:       curl http://localhost:5000/match/v1/driving/77.5946,12.9716;77.5950,12.9720"
echo "  3. Check processor:  docker logs -f journey-processor"
echo ""
