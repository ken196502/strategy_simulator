from fastapi import WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from typing import Dict, Set
import json

from database.connection import SessionLocal
from repositories.user_repo import get_or_create_user, get_user
from repositories.order_repo import list_orders
from repositories.position_repo import list_positions
from services.asset_calculator import calc_positions_value
from services.order_executor import place_and_execute
from database.models import Trade


class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[int, Set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket):
        await websocket.accept()

    def register(self, user_id: int, websocket: WebSocket):
        self.active_connections.setdefault(user_id, set()).add(websocket)

    def unregister(self, user_id: int, websocket: WebSocket):
        if user_id in self.active_connections:
            self.active_connections[user_id].discard(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]

    async def send_to_user(self, user_id: int, message: dict):
        if user_id not in self.active_connections:
            return
        payload = json.dumps(message, ensure_ascii=False)
        for ws in list(self.active_connections[user_id]):
            try:
                await ws.send_text(payload)
            except Exception:
                # remove broken connection
                self.active_connections[user_id].discard(ws)


manager = ConnectionManager()


async def _send_snapshot(db: Session, user_id: int):
    user = get_user(db, user_id)
    if not user:
        return
    positions = list_positions(db, user_id)
    orders = list_orders(db, user_id)
    trades = (
        db.query(Trade).filter(Trade.user_id == user_id).order_by(Trade.trade_time.desc()).limit(200).all()
    )
    positions_value = calc_positions_value(db, user_id)
    overview = {
        "user": {
            "id": user.id,
            "username": user.username,
            "initial_capital": float(user.initial_capital),
            "current_cash": float(user.current_cash),
            "frozen_cash": float(user.frozen_cash),
        },
        "positions_value": positions_value,
        "total_assets": positions_value + float(user.current_cash),
    }
    await manager.send_to_user(user_id, {
        "type": "snapshot",
        "overview": overview,
        "positions": [
            {
                "id": p.id,
                "user_id": p.user_id,
                "symbol": p.symbol,
                "name": p.name,
                "market": p.market,
                "quantity": p.quantity,
                "available_quantity": p.available_quantity,
                "avg_cost": float(p.avg_cost),
            }
            for p in positions
        ],
        "orders": [
            {
                "id": o.id,
                "order_no": o.order_no,
                "user_id": o.user_id,
                "symbol": o.symbol,
                "name": o.name,
                "market": o.market,
                "side": o.side,
                "order_type": o.order_type,
                "price": float(o.price) if o.price is not None else None,
                "quantity": o.quantity,
                "filled_quantity": o.filled_quantity,
                "status": o.status,
            }
            for o in orders
        ],
        "trades": [
            {
                "id": t.id,
                "order_id": t.order_id,
                "user_id": t.user_id,
                "symbol": t.symbol,
                "name": t.name,
                "market": t.market,
                "side": t.side,
                "price": float(t.price),
                "quantity": t.quantity,
                "commission": float(t.commission),
                "exchange_rate": float(t.exchange_rate) if t.exchange_rate is not None else 1.0,
                "trade_time": str(t.trade_time),
            }
            for t in trades
        ],
    })


async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    user_id: int | None = None
    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            kind = msg.get("type")
            db: Session = SessionLocal()
            try:
                if kind == "bootstrap":
                    user = get_or_create_user(db, msg.get("username", "demo"), float(msg.get("initial_capital", 100000)))
                    user_id = user.id
                    manager.register(user_id, websocket)
                    await manager.send_to_user(user_id, {"type": "bootstrap_ok", "user": {"id": user.id, "username": user.username}})
                    await _send_snapshot(db, user_id)
                elif kind == "subscribe":
                    # subscribe existing user_id
                    uid = int(msg.get("user_id"))
                    u = get_user(db, uid)
                    if not u:
                        await websocket.send_text(json.dumps({"type": "error", "message": "user not found"}))
                        continue
                    user_id = uid
                    manager.register(user_id, websocket)
                    await _send_snapshot(db, user_id)
                elif kind == "place_order":
                    if user_id is None:
                        await websocket.send_text(json.dumps({"type": "error", "message": "not bootstrapped"}))
                        continue
                    user = get_user(db, user_id)
                    try:
                        order = place_and_execute(
                            db,
                            user,
                            msg["symbol"],
                            msg.get("name", msg["symbol"]),
                            msg["market"],
                            msg["side"],
                            msg.get("order_type", "MARKET"),
                            msg.get("price"),
                            int(msg["quantity"]),
                        )
                        await manager.send_to_user(user_id, {"type": "order_filled", "order_id": order.id})
                        await _send_snapshot(db, user_id)
                    except ValueError as e:
                        await manager.send_to_user(user_id, {"type": "error", "message": str(e)})
                elif kind == "get_snapshot":
                    if user_id is not None:
                        await _send_snapshot(db, user_id)
                elif kind == "get_trades":
                    if user_id is not None:
                        trades = (
                            db.query(Trade).filter(Trade.user_id == user_id).order_by(Trade.trade_time.desc()).limit(200).all()
                        )
                        await manager.send_to_user(user_id, {
                            "type": "trades",
                            "trades": [
                                {
                                    "id": t.id,
                                    "order_id": t.order_id,
                                    "user_id": t.user_id,
                                    "symbol": t.symbol,
                                    "name": t.name,
                                    "market": t.market,
                                    "side": t.side,
                                    "price": float(t.price),
                                    "quantity": t.quantity,
                                    "commission": float(t.commission),
                                    "exchange_rate": float(t.exchange_rate) if t.exchange_rate is not None else 1.0,
                                    "trade_time": str(t.trade_time),
                                }
                                for t in trades
                            ]
                        })
                elif kind == "ping":
                    await websocket.send_text(json.dumps({"type": "pong"}))
                else:
                    await websocket.send_text(json.dumps({"type": "error", "message": "unknown message"}))
            finally:
                db.close()
    except WebSocketDisconnect:
        if user_id is not None:
            manager.unregister(user_id, websocket)
        return
