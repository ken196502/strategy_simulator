# Strategy Simulator (PNPM + UV)

A fullstack demo for a simulated US/HK trading app. The runtime is WebSocket-only: the frontend communicates with the backend exclusively via a single WS endpoint.

## Stack
- Backend: FastAPI + Uvicorn, SQLAlchemy, SQLite (managed with UV)
- Frontend: React + Vite + Tailwind + Shadcn UI (managed with pnpm)
- Realtime: WebSocket at `ws://localhost:2314/ws`

## Project Structure
- `backend/`: Python backend (WebSocket endpoint only)
- `frontend/`: React frontend (pure WS client)

## Getting Started

### Prerequisites
- Node.js (with pnpm installed)
- Python (with UV installed)

### Install
```bash
pnpm run install:all
```

### Develop
Run both dev servers concurrently:
```bash
pnpm run dev
```
Then open the app at:
- Frontend: http://localhost:2414
- Backend WS: ws://localhost:2314/ws

### Build
```bash
pnpm run build
```
This builds the frontend for production. (The backend has no separate build step.)

## WebSocket Protocol
The app is WS-only. On load, the client opens `ws://localhost:2314/ws` and sends a bootstrap message:

Client → Server
```json
{ "type": "bootstrap", "username": "demo", "initial_capital": 100000 }
```

Server replies with user and an initial snapshot stream:
```json
{ "type": "bootstrap_ok", "user": { "id": 1, "username": "demo" } }
{ "type": "snapshot", "overview": { "user": {"id": 1, "username": "demo", "initial_capital": 100000, "current_cash": 100000, "frozen_cash": 0 }, "positions_value": 0, "total_assets": 100000 }, "positions": [], "orders": [], "trades": [] }
```

Supported client messages:
- `bootstrap` — create or load a user and register the socket
- `subscribe` — register the socket for an existing `user_id`
- `place_order` — place an order and trigger execution
  - payload: `{ symbol, name, market, side, order_type, price?, quantity }`
- `get_snapshot` — request the latest snapshot
- `get_trades` — request the latest trades
- `ping` — liveness check (server responds `pong`)

Selected server messages:
- `bootstrap_ok` — `{ user: { id, username } }`
- `snapshot` — `{ overview, positions, orders, trades }`
- `trades` — latest trades list
- `order_filled` — order fill notification (a fresh `snapshot` follows)
- `error` — `{ message }`

## Frontend Behavior
- Uses a module-level WebSocket singleton to avoid duplicate connections in React StrictMode.
- UI is fully driven by WS messages (`snapshot`, `trades`, etc.).
- No HTTP fetch/axios calls; Vite proxy to `/api` has been removed.

## Ports
- Backend WS: `ws://localhost:2314/ws`
- Frontend: `http://localhost:2414`

## Troubleshooting
- Multiple connect/disconnect in logs during development: React StrictMode mounts twice; we use a WS singleton to prevent duplicate connections. If the server closes the socket, the singleton resets and the client will establish a new connection on next interaction.
- Database state: The SQLite file is `demo_trading.db`. Delete it to reset demo data if needed.

## Notes
- The backend currently exposes only the `/ws` route; there are no HTTP routes.
- CORS middleware is present but not required for WS-only usage; it can be removed if desired.
