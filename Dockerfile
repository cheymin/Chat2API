# Dockerfile for Chat2API Manager - Web Server with WebUI
#
# Build:  docker build -t chat2api .
# Run:    docker run -d -p 8080:8080 -v chat2api-data:/data chat2api

# ============================================================
# Stage 1: Build (install all deps, compile backend + frontend)
# ============================================================
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Copy package manifests first for better layer caching
COPY package.json package-lock.json* ./

# Install ALL dependencies (devDeps needed for TypeScript / Vite build)
RUN npm ci --no-audit --no-fund

# Copy source
COPY tsconfig*.json vite.config.ts postcss.config.mjs tailwind.config.mjs components.json ./
COPY sha3_wasm_bg.*.wasm ./
COPY backend ./backend
COPY frontend ./frontend
COPY scripts ./scripts

# Build backend (TypeScript) and frontend (Vite)
RUN npm run build

# Prune dev dependencies so the runtime image only carries production deps
RUN npm prune --omit=dev --no-audit --no-fund && npm cache clean --force || true

# ============================================================
# Stage 2: Runtime (lean production image)
# ============================================================
FROM node:22-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    CHAT2API_DATA_DIR=/data

# Install minimal system deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy production dependencies from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Copy compiled output
COPY --from=builder /app/dist ./dist

# DeepSeek challenge WASM file (needed at runtime by the proxy adapter)
COPY --from=builder /app/sha3_wasm_bg.*.wasm ./
COPY --from=builder /app/sha3_wasm_bg.*.wasm ./dist/backend/lib/

# Persist user data (provider accounts, logs, encryption key) on a volume
RUN mkdir -p /data
VOLUME ["/data"]

EXPOSE 8080

# Drop to a non-root user for safety
RUN groupadd -r chat2api && useradd -r -g chat2api chat2api && \
    chown -R chat2api:chat2api /app /data
USER chat2api

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||8080)+'/v1/models',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "dist/backend/index.js"]
