# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a simulated US/HK trading application built as a full-stack real-time system. The entire application runs exclusively through WebSocket communication - there are no HTTP endpoints. The frontend connects to the backend via WebSocket at `ws://localhost:2314/ws` and all state updates flow through this connection.

## Commands

### Development
```bash
# Install all dependencies
pnpm run install:all

# Run both frontend and backend concurrently
pnpm run dev
```

### Testing & Linting (Backend)
```bash
cd backend
# Run tests
uv run pytest

# Format code with black
uv run black .

# Lint with ruff
uv run ruff check .
uv run ruff check . --fix
```

### Building
```bash
# Build frontend for production
pnpm run build

# Frontend development server
cd frontend && pnpm dev --port 2414
```

## Architecture

### Backend (TypeScript/Hono + Node.js)
- **WebSocket-Only Runtime**: Only the `/ws` endpoint is exposed via WebSocket - no HTTP routes
- **Connection Management**: Uses a `ConnectionManager` singleton to manage multiple WebSocket connections per user
- **Services**: In-memory state management for users, orders, positions, and trades with multi-currency support
- **Real-time Services**: Order execution, market data (via Xueqiu API), asset calculations, order monitoring
- **Multi-Currency Support**: USD, HKD, and CNY with exchange rate management

### Frontend (React/Vite)
- **WebSocket Singleton**: Module-level WebSocket instance to avoid duplicate connections in React StrictMode
- **State Management**: All UI state driven by WebSocket messages (`snapshot`, `trades`, etc.)
- **No HTTP Calls**: Pure WebSocket client - fetch/axios removed, proxy to `/api` disabled
- **Internationalization**: i18n support for Chinese/English UI strings
- **Theme**: Shadcn UI components with Tailwind CSS

### Key Services

#### Backend Services ([hono-backend/src/](hono-backend/src/)):
- **orderService.ts**: Order placement and execution logic
- **xueqiu.ts**: Snowball market data integration with cookie authentication
- **hk_stock_info.ts**: Hong Kong stock information service

#### HTTP-based API Routes ([hono-backend/src/app.ts](hono-backend/src/app.ts)):
- **asset_trend**: Asset trend reporting endpoints (HTTP-based)

#### Frontend Services ([frontend/app/lib/](frontend/app/lib/)):
- **tradingLogic.ts**: Automated trading strategies and order management
- **websocketHandler.ts**: WebSocket message processing and state updates
- **marketData.ts**: Market data management and quote updates
- **storage.ts**: Local data persistence and state management

### WebSocket Protocol

The app follows a strict WebSocket protocol documented in [README.md](README.md#websocket-protocol). Key message types:
- `bootstrap` - User creation/connection
- `place_order` - Order placement and immediate execution
- `get_snapshot` - Request portfolio snapshot
- `get_trades` - Request trade history
- `set_xueqiu_cookie` - Configure market data authentication
- `ping/pong` - Connection health check

### Data Models
In-memory data structures (no database):
- **User**: Multi-currency balance management (USD, HKD, CNY)
- **Order**: Trading orders with execution logic
- **Position**: Portfolio positions with market value tracking
- **Trade**: Executed trades with commission tracking
- **ExchangeRate**: Currency conversion rates

### Frontend Structure
See [frontend/app/main.tsx](frontend/app/main.tsx:1) for the WebSocket client architecture:
- Singleton WebSocket connection to prevent duplicates
- Message handlers for all server-specified event types
- Real-time state updates through React setState hooks
- Cookie management for Xueqiu API authentication

## Ports
- Backend WebSocket: `ws://localhost:2314/ws`
- Frontend: `http://localhost:2414`
- Backend HTTP API: `http://localhost:2314` (for asset trends only)

## Development Notes
- The application uses in-memory state management - restart the backend to reset demo data
- Multiple connect/disconnect logs are expected due to React StrictMode behavior
- CORS middleware is present but not required for WebSocket-only usage
- Market data requires valid Xueqiu cookies for real-time price updates
- The backend uses Hono framework with WebSocket support and HTTP API endpoints

## Testing
Backend tests can be run with:
```bash
cd hono-backend && pnpm test
```