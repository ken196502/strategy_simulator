# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY hono-backend/package*.json ./
COPY pnpm-lock.yaml ./

# Install dependencies
RUN npm install -g pnpm
RUN pnpm install

# Copy source code
COPY hono-backend/src ./src
COPY hono-backend/tsconfig.json ./

# Build the application
RUN pnpm build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodejs

# Copy built application
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./package.json

USER nodejs

# Expose the WebSocket port (2314)
EXPOSE 2314

ENV NODE_ENV=production
ENV HONO_PORT=2314

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD nc -z localhost 2314 || exit 1

CMD ["node", "dist/server.js"]