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

    SSL=$(python3 -c "import json; print(json.load(open('/data/options.json')).get('ssl', False))" 2>/dev/null || true)
    if [ "$SSL" = "True" ] || [ "$SSL" = "true" ]; then
        export NETSENTINEL_SSL_ENABLED="true"
    fi

    CERTFILE=$(python3 -c "import json; print(json.load(open('/data/options.json')).get('certfile', ''))" 2>/dev/null || true)
    if [ -n "$CERTFILE" ]; then
        export NETSENTINEL_SSL_CERTFILE="$CERTFILE"
    fi

    KEYFILE=$(python3 -c "import json; print(json.load(open('/data/options.json')).get('keyfile', ''))" 2>/dev/null || true)
    if [ -n "$KEYFILE" ]; then
        export NETSENTINEL_SSL_KEYFILE="$KEYFILE"
    fi

    TIMEZONE=$(python3 -c "import json; print(json.load(open('/data/options.json')).get('timezone', ''))" 2>/dev/null || true)
    if [ -n "$TIMEZONE" ]; then
        export TZ="$TIMEZONE"
    fi
fi

export NETSENTINEL_INGRESS_PORT="${NETSENTINEL_INGRESS_PORT:-8099}"
mkdir -p /data/netsentinel
export NETSENTINEL_DATA_DIR=/data/netsentinel

echo "[NetSentinel Add-on] Ingress HTTP attivo su porta interna ${NETSENTINEL_INGRESS_PORT}"
if [ "$NETSENTINEL_SSL_ENABLED" = "true" ]; then
    echo "[NetSentinel Add-on] Web UI esterna attiva in HTTPS su porta ${NETSENTINEL_PORT:-8181}..."
else
    echo "[NetSentinel Add-on] Web UI esterna attiva in HTTP su porta ${NETSENTINEL_PORT:-8181}..."
fi

exec python3 -m app.main

