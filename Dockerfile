# Dockerfile for Chat2API Manager
# Multi-stage build for optimized image size

# Stage 1: Build stage
FROM node:20-bookworm AS builder

# Install build dependencies
RUN apt-get update && apt-get install -y \
    git \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build application
RUN npm run build

# Stage 2: Production stage
FROM node:20-bookworm-slim

# Install runtime dependencies and Xvfb for headless mode
RUN apt-get update && apt-get install -y \
    xvfb \
    libgtk-3-0 \
    libnotify4 \
    libnss3 \
    libxss1 \
    libxtst6 \
    xdg-utils \
    libatspi2.0-0 \
    libuuid1 \
    libappindicator3-1 \
    libasound2 \
    libdrm2 \
    libgbm1 \
    libxkbcommon0 \
    libxshmfence1 \
    libglu1-mesa \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy built application from builder stage
COPY --from=builder /app/out ./out
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/build ./build
COPY --from=builder /app/sha3_wasm_bg.7b9ca65ddd.wasm ./sha3_wasm_bg.7b9ca65ddd.wasm

# Create data directory for persistent storage
RUN mkdir -p /root/.chat2api

# Set environment variables
ENV NODE_ENV=production
ENV DISPLAY=:99

# Create startup script
RUN echo '#!/bin/bash\n\
Xvfb :99 -screen 0 1024x768x24 > /dev/null 2>&1 &\n\
sleep 1\n\
node ./out/main/index.js --no-sandbox\n\
' > /app/start.sh && chmod +x /app/start.sh

# Expose proxy port (default: 8080)
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:8080/v1/models', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Labels for GitHub Packages
LABEL org.opencontainers.image.title="Chat2API Manager"
LABEL org.opencontainers.image.description="OpenAI-compatible API proxy for multiple AI service providers"
LABEL org.opencontainers.image.version="1.4.0"
LABEL org.opencontainers.image.authors="Chat2API Team <support@chat2api.com>"
LABEL org.opencontainers.image.url="https://github.com/xiaoY233/Chat2API"
LABEL org.opencontainers.image.source="https://github.com/xiaoY233/Chat2API"
LABEL org.opencontainers.image.licenses="GPL-3.0"

# Default command
CMD ["/app/start.sh"]