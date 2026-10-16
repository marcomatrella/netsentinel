ARG BUILD_FROM=ghcr.io/marcomatrella/netsentinel:1.1.8
FROM ${BUILD_FROM}

USER root

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8080

ENTRYPOINT ["/entrypoint.sh"]
