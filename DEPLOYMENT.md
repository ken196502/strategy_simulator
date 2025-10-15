# Trading App - Single Service Deployment

This project has been restructured to build the frontend into the backend as static files, creating a single deployable service.

## Architecture Changes

### Before
- Frontend served on port 2414 (React/Vite dev server)
- Backend served on port 2314 (Hono API server)
- Two separate Docker containers

### After
- Single service on port 2314
- Frontend built as static files served by the backend
- API routes available under `/api` prefix
- Single Docker container

## Development

```bash
# Install dependencies
pnpm run install:all

# Development mode (runs both frontend dev server and backend)
pnpm dev

# Build frontend and backend
pnpm build

# Start production server (backend serves static frontend)
pnpm start
```

## Production Deployment

### Docker

```bash
# Build the Docker image
docker build -t trading-app .

# Run the container
docker run -d --name trading-app -p 8314:2314 trading-app

# Access the application
curl http://localhost:8314/api/health  # API health check
curl http://localhost:8314/            # Frontend application
```

### Docker Compose

```bash
# Start with docker-compose
docker-compose up -d

# Access the application
http://localhost:8314
```

## API Endpoints

All API endpoints are now prefixed with `/api`:

- `GET /api/health` - Health check
- `GET /api/overview` - Trading overview
- `GET /api/orders` - Get orders
- `GET /api/positions` - Get positions
- `GET /api/trades` - Get trades
- `POST /api/orders` - Place order
- `GET /api/market/last-price` - Get latest price
- `GET /api/market/kline` - Get K-line data
- `GET /api/market/status` - Get market status

## File Structure

```
├── frontend/           # React frontend source
│   ├── app/           # Application code
│   ├── vite.config.ts # Configured to build to ../hono-backend/public
│   └── package.json
├── hono-backend/      # Hono backend source
│   ├── src/           # Backend source code
│   ├── public/        # Built frontend files (generated)
│   └── package.json
├── Dockerfile         # Single-stage Docker build
├── docker-compose.yml # Simplified single service
└── package.json       # Root workspace configuration
```

## Benefits

1. **Simplified Deployment**: Only one service to deploy and manage
2. **Reduced Infrastructure**: No need for separate frontend hosting
3. **Better Performance**: No CORS issues, faster API calls
4. **Cost Effective**: Single container reduces resource usage
5. **Easier SSL/TLS**: Only one service needs certificates