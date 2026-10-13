#!/usr/bin/env bash
set -e

# Read options from Home Assistant supervisor options.json if present
if [ -f /data/options.json ]; then
    SUBNET=$(python3 -c "import json; print(json.load(open('/data/options.json')).get('subnet', ''))" 2>/dev/null || true)
    if [ -n "$SUBNET" ]; then
        export NETSENTINEL_SUBNET="$SUBNET"
    fi

    PORT=$(python3 -c "import json; print(json.load(open('/data/options.json')).get('port', ''))" 2>/dev/null || true)
    if [ -n "$PORT" ]; then
        export NETSENTINEL_PORT="$PORT"
    fi

    TIMEZONE=$(python3 -c "import json; print(json.load(open('/data/options.json')).get('timezone', ''))" 2>/dev/null || true)
    if [ -n "$TIMEZONE" ]; then
        export TZ="$TIMEZONE"
    fi
fi

mkdir -p /data/netsentinel
export NETSENTINEL_DATA_DIR=/data/netsentinel

echo "[NetSentinel Add-on] Avvio NetSentinel su porta ${NETSENTINEL_PORT:-8080}..."
exec python3 -m app.main

