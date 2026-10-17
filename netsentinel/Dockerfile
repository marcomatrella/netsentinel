ARG BUILD_FROM=ghcr.io/marcomatrella/netsentinel:1.2.0
FROM ${BUILD_FROM}

USER root

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8080

ENTRYPOINT ["/entrypoint.sh"]
