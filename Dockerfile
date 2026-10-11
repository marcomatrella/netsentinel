# NetSentinel Multi-Stage Dockerfile
# Stage 1: Build Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /build

COPY frontend/package*.json ./
RUN if [ -f package.json ]; then npm ci || npm install; fi

COPY frontend/ ./
RUN if [ -f package.json ] && grep -q '"build"' package.json; then npm run build; else mkdir -p dist && echo '<html><body>NetSentinel</body></html>' > dist/index.html; fi

# Stage 2: Python Backend Runtime
FROM python:3.12-slim AS runner

# Install system dependencies (curl for healthcheck, libcap2-bin for NET_RAW capabilities)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    iputils-ping \
    libcap2-bin \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install uv for ultra-fast dependency management
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

# Copy dependency definition
COPY pyproject.toml uv.lock* ./

# Install Python dependencies into system Python
RUN uv pip install --system --no-cache -r pyproject.toml

# Copy backend code
COPY backend/app ./app

# Copy built frontend assets from stage 1
COPY --from=frontend-builder /build/dist ./frontend/dist

# Create data directory and non-root user
RUN groupadd -g 1000 netsentinel && \
    useradd -u 1000 -g netsentinel -m -s /bin/bash netsentinel && \
    mkdir -p /data && \
    chown -R netsentinel:netsentinel /app /data

# Grant NET_RAW capability to python binary for raw ICMP ping without root
RUN setcap cap_net_raw+ep $(readlink -f $(which python3)) || true

USER netsentinel

ENV PYTHONUNBUFFERED=1 \
    NETSENTINEL_DATA_DIR=/data \
    NETSENTINEL_HOST=0.0.0.0 \
    NETSENTINEL_PORT=8080 \
    TZ=Europe/Rome

VOLUME ["/data"]
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8080/healthz || exit 1

CMD ["python3", "-m", "app.main"]

