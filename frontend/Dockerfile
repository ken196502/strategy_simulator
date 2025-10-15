# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY frontend/package*.json ./
COPY pnpm-lock.yaml ./

# Install dependencies
RUN npm install -g pnpm
RUN pnpm install
RUN npm install -g serve

# Copy source code and config files
COPY frontend/app ./app
COPY frontend/package.json ./
COPY frontend/vite.config.ts ./
COPY frontend/tailwind.config.js ./
COPY frontend/index.html ./
COPY frontend/postcss.config.js ./
COPY frontend/tsconfig.json ./

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

EXPOSE 2414

ENV NODE_ENV=production

CMD ["node", "-e", "require('http').createServer((req, res) => { require('fs').createReadStream(require('path').join(__dirname, 'dist', 'index.html')).pipe(res); }).listen(2414)"]