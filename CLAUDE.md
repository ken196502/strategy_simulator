# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a full-stack simulated trading application with a WebSocket-only architecture. It simulates US/HK stock trading with real-time order execution and portfolio management. The system uses a single WebSocket endpoint for all communication between frontend and backend.

## Architecture

### Backend Architecture
- **Framework**: FastAPI with Uvicorn (managed by UV package manager)
- **Database**: SQLite with SQLAlchemy ORM
- **Real-time**: WebSocket-only communication (no HTTP endpoints)
- **Pattern**: Repository pattern with service layer for business logic

Key backend components:
- `main.py`: FastAPI app setup and WebSocket routing
- `database/`: SQLAlchemy models, connection management, migrations
- `repositories/`: Data access layer (User, Order, Position repositories)
- `services/`: Business logic (order execution, asset calculation, market data)
- `api/ws.py`: WebSocket handler and connection management
- `config/settings.py`: Trading configuration for different markets

### Frontend Architecture
- **Framework**: React 18 with Vite build system
- **UI**: Tailwind CSS with Shadcn UI components
- **Real-time**: WebSocket-only communication (no HTTP API calls)
- **Pattern**: Module-level WebSocket singleton to prevent duplicate connections

Key frontend components:
- `app/main.tsx`: Main application with WebSocket connection management
- `app/components/layout/`: Header and Sidebar navigation
- `app/components/trading/`: Market status and trading interface
- `app/components/portfolio/`: Portfolio overview and charts
- `app/components/ui/`: Reusable UI components from Shadcn UI

## Development Commands

### Install Dependencies
```bash
pnpm run install:all
```

### Development
```bash
pnpm run dev
```
This runs both frontend (http://localhost:2414) and backend (ws://localhost:2314/ws) concurrently.

### Build
```bash
pnpm run build
```
Builds the frontend for production. The backend has no separate build step.

### Backend Development Commands
```bash
cd backend
uv sync --quiet          # Install dependencies
uv run uvicorn main:app --reload --port 2314  # Run dev server
uv run pytest           # Run tests
uv run black            # Format code
uv run ruff             # Lint code
```

### Frontend Development Commands
```bash
cd frontend
pnpm dev                # Run dev server (port 2414)
pnpm build              # Build for production
pnpm preview            # Preview production build
```

## WebSocket Protocol

The application uses a single WebSocket endpoint (`ws://localhost:2314/ws`) for all communication.

### Client Messages
- `bootstrap` - Create/load user and initialize session
- `subscribe` - Register existing user_id for updates
- `place_order` - Submit order for execution
- `get_snapshot` - Request latest portfolio snapshot
- `get_trades` - Request trade history
- `ping` - Liveness check

### Server Messages
- `bootstrap_ok` - User initialization confirmation
- `snapshot` - Portfolio, positions, orders, trades data
- `trades` - Latest trades list
- `order_filled` - Order execution notification
- `error` - Error messages

## Database Structure

Core models:
- `User`: User account with cash balances
- `Position`: Holdings for each user/symbol
- `Order`: Pending and executed orders
- `Trade`: Executed trade records
- `TradingConfig`: Market-specific configuration (US/HK)

Database file: `demo_trading.db` (delete to reset demo data)

## Key Technical Patterns

### Frontend
- WebSocket singleton pattern prevents duplicate connections in React StrictMode
- UI is entirely driven by WebSocket messages
- No HTTP API calls - pure WebSocket client

### Backend
- Connection manager tracks active WebSocket connections per user
- Repository pattern separates data access from business logic
- Service layer handles order execution and portfolio calculations
- Automatic database seeding on startup

## Troubleshooting

- **Multiple connect/disconnect logs**: React StrictMode mounts twice, but WebSocket singleton prevents duplicate connections
- **Database reset**: Delete `demo_trading.db` file to reset demo data
- **Connection issues**: Ensure backend is running on port 2314 before starting frontend