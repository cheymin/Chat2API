# Dockerfile for Chat2API Manager - Headless Node.js Server
# Produces a self-contained image: FROM ghcr.io/cheymin/chat2api:latest && run
#
# Build:  docker build -t chat2api .
# Run:    docker run -d -p 8080:8080 -v chat2api-data:/root/.chat2api chat2api

# ============================================================
# Stage 1: Build (compile TypeScript -> JS via electron-vite)
# ============================================================
FROM node:20-bookworm AS builder

WORKDIR /app

# Copy package manifests first for better layer caching
COPY package*.json ./
COPY electron.vite.config.ts ./
COPY tsconfig*.json ./

# Install ALL dependencies (including devDeps needed for the build)
RUN npm ci --no-audit --no-fund

# Copy source
COPY src ./src
COPY build ./build
COPY scripts ./scripts
COPY sha3_wasm_bg.7b9ca65ddd.wasm* ./

# Build the main process bundle (includes index-docker.js)
RUN npx electron-vite build

# Prune dev dependencies so the runtime image only carries production deps
RUN npm prune --omit=dev --no-audit --no-fund || true

# ============================================================
# Stage 2: Runtime (plain Node.js, no Electron, no Xvfb)
# ============================================================
FROM node:20-bookworm-slim AS runtime

WORKDIR /app

# Install minimal runtime libs (no GUI/X11 needed for headless Node server)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy built main bundle + renderer (renderer is unused in headless but kept for parity)
COPY --from=builder /app/out ./out
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/build ./build
COPY --from=builder /app/sha3_wasm_bg.7b9ca65ddd.wasm ./sha3_wasm_bg.7b9ca65ddd.wasm

# Data directory (mounted as a volume for persistence)
RUN mkdir -p /root/.chat2api
VOLUME /root/.chat2api

# Environment
ENV NODE_ENV=production
ENV DOCKER=true
ENV DISABLE_AUTO_UPDATER=true
ENV PORT=8080
ENV HOST=0.0.0.0

# Expose proxy port
EXPOSE 8080

# Health check hits the models endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||8080)+'/v1/models',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# Labels for GHCR
LABEL org.opencontainers.image.title="Chat2API Manager"
LABEL org.opencontainers.image.description="OpenAI-compatible API proxy for multiple AI service providers (headless)"
LABEL org.opencontainers.image.version="1.4.0"
LABEL org.opencontainers.image.authors="Chat2API Team"
LABEL org.opencontainers.image.url="https://github.com/cheymin/Chat2API"
LABEL org.opencontainers.image.source="https://github.com/cheymin/Chat2API"
LABEL org.opencontainers.image.licenses="GPL-3.0"

# Start the headless Node.js server (no Electron runtime required)
CMD ["node", "out/main/index-docker.js"]
