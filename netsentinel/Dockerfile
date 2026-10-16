ARG BUILD_FROM=ghcr.io/marcomatrella/netsentinel:1.1.6
FROM ${BUILD_FROM}

USER root

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8080

HEALTHCHECK NONE

ENTRYPOINT ["/entrypoint.sh"]
