ARG BUILD_FROM=ghcr.io/marcomatrella/netsentinel:latest
FROM ${BUILD_FROM}

USER root

# Create startup script to optionally read options from /data/options.json
RUN echo '#!/bin/bash\n\
if [ -f /data/options.json ]; then\n\
  SUBNET=$(grep -o '"'"'"subnet": "[^"]*"' "'" /data/options.json | cut -d'"'"'"'"'"' -f4)\n\
  if [ -n "$SUBNET" ]; then\n\
    export NETSENTINEL_SUBNET="$SUBNET"\n\
  fi\n\
  TIMEZONE=$(grep -o '"'"'"timezone": "[^"]*"' "'" /data/options.json | cut -d'"'"'"'"'"' -f4)\n\
  if [ -n "$TIMEZONE" ]; then\n\
    export TZ="$TIMEZONE"\n\
  fi\n\
fi\n\
mkdir -p /data/netsentinel\n\
export NETSENTINEL_DATA_DIR=/data/netsentinel\n\
exec python3 -m app.main\n' > /entrypoint.sh && chmod +x /entrypoint.sh

EXPOSE 8080

ENTRYPOINT ["/entrypoint.sh"]

