# Multi-stage build for full-stack application
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy workspace files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# Copy frontend package files
COPY frontend/package.json ./frontend/
COPY hono-backend/package.json ./hono-backend/

# Install all dependencies
RUN pnpm install

# Copy frontend source code and config files
COPY frontend/app ./frontend/app
COPY frontend/vite.config.ts ./frontend/
COPY frontend/tailwind.config.js ./frontend/
COPY frontend/index.html ./frontend/
COPY frontend/postcss.config.js ./frontend/
COPY frontend/tsconfig.json ./frontend/
COPY frontend/components.json ./frontend/
COPY frontend/doc.md ./frontend/

# Copy backend source code
COPY hono-backend/src ./hono-backend/src
COPY hono-backend/tsconfig.json ./hono-backend/

# Build frontend first (outputs to hono-backend/public)
WORKDIR /app/frontend
RUN pnpm build

# Copy doc.md to public directory
RUN cp doc.md ../hono-backend/public/doc.md

# Build backend
WORKDIR /app/hono-backend
RUN pnpm build

# Production stage
FROM node:18-alpine AS runner

WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodejs

# Install production dependencies first
COPY --from=builder --chown=nodejs:nodejs /app/hono-backend/package.json ./package.json
RUN npm install --production

# Copy built application from builder stage
COPY --from=builder --chown=nodejs:nodejs /app/hono-backend/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/hono-backend/public ./public

USER nodejs

# Expose the application port
EXPOSE 2314

ENV NODE_ENV=production
ENV HONO_PORT=2314

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD nc -z localhost 2314 || exit 1

CMD ["node", "dist/server.js"]