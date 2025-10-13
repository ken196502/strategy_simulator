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

### Backend (Python/FastAPI)
- **WebSocket-Only Runtime**: Only the `/ws` endpoint is exposed via WebSocket - no HTTP routes
- **Connection Management**: Uses a `ConnectionManager` singleton to manage multiple WebSocket connections per user
- **Database**: SQLite with SQLAlchemy ORM, models include User, Order, Position, Trade, ExchangeRate
- **Real-time Services**: Order execution, market data (via Xueqiu API), asset calculations, background order monitoring
- **Multi-Currency Support**: USD, HKD, and CNY with exchange rate management

### Frontend (React/Vite)
- **WebSocket Singleton**: Module-level WebSocket instance to avoid duplicate connections in React StrictMode
- **State Management**: All UI state driven by WebSocket messages (`snapshot`, `trades`, etc.)
- **No HTTP Calls**: Pure WebSocket client - fetch/axios removed, proxy to `/api` disabled
- **Internationalization**: i18n support for Chinese/English UI strings
- **Theme**: Shadcn UI components with Tailwind CSS

### Key Services

#### Backend Services ([backend/services/](backend/services/)):
- **order_service.py**: Order placement and execution logic
- **market_data.py**: Real-time price data from Xueqiu API
- **asset_calculator.py**: Multi-currency portfolio valuation
- **order_monitor.py**: Background order execution monitoring
- **xueqiu.py**: Snowball market data integration with cookie authentication
- **hk_stock_info.py**: Hong Kong stock information service

#### Repositories ([backend/repositories/](backend/repositories/)):
- **user_repo.py**: User management
- **order_repo.py**: Order CRUD operations
- **position_repo.py**: Position tracking
- **asset_snapshot_repo.py**: Asset snapshot generation
- **daily_price_repo.py**: Daily price data management

#### API Routes ([backend/api/routes/](backend/api/routes/)):
- **asset_trend.py**: Asset trend reporting endpoints (HTTP-based)

### WebSocket Protocol

The app follows a strict WebSocket protocol documented in [README.md](README.md#websocket-protocol). Key message types:
- `bootstrap` - User creation/connection
- `place_order` - Order placement and immediate execution
- `get_snapshot` - Request portfolio snapshot
- `get_trades` - Request trade history
- `set_xueqiu_cookie` - Configure market data authentication
- `ping/pong` - Connection health check

### Data Models
See [backend/database/models.py](backend/database/models.py) for comprehensive data structure:
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
- Backend management UI: Not implemented (WS-only)

## Development Notes
- The backend database file `demo_trading.db` can be deleted to reset demo data
- Multiple connect/disconnect logs are expected due to React StrictMode behavior
- CORS middleware is present but not required for WebSocket-only usage
- Market data requires valid Xueqiu cookies for real-time price updates