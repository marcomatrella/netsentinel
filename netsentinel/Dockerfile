ARG BUILD_FROM=ghcr.io/marcomatrella/netsentinel:latest
FROM ${BUILD_FROM}

USER root

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8080

ENTRYPOINT ["/entrypoint.sh"]
