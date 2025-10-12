from fastapi import WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from typing import Dict, Set
import json

from database.connection import SessionLocal
from repositories.user_repo import get_or_create_user, get_user
from repositories.order_repo import list_orders
from repositories.position_repo import list_positions
from services.asset_calculator import calc_positions_value, calc_positions_value_by_currency
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
    positions_value_usd = calc_positions_value(db, user_id)
    positions_value_by_currency = calc_positions_value_by_currency(db, user_id)

    # 构建多币种余额信息
    balances_by_currency = {
        "usd": {
            "initial_capital": float(user.initial_capital_usd),
            "current_cash": float(user.current_cash_usd),
            "frozen_cash": float(user.frozen_cash_usd)
        },
        "hkd": {
            "initial_capital": float(user.initial_capital_hkd),
            "current_cash": float(user.current_cash_hkd),
            "frozen_cash": float(user.frozen_cash_hkd)
        },
        "cny": {
            "initial_capital": float(user.initial_capital_cny),
            "current_cash": float(user.current_cash_cny),
            "frozen_cash": float(user.frozen_cash_cny)
        }
    }
    
    # 计算总资产（折算为USD）- 暂时简化处理，后续可以加入汇率换算
    total_cash_usd = (float(user.current_cash_usd) + 
                     float(user.current_cash_hkd) / 7.8 +  # 简化汇率 HKD->USD
                     float(user.current_cash_cny) / 7.2)   # 简化汇率 CNY->USD
    
    overview = {
        "user": {
            "id": user.id,
            "username": user.username,
            "initial_capital_usd": float(user.initial_capital_usd),
            "current_cash_usd": float(user.current_cash_usd),
            "frozen_cash_usd": float(user.frozen_cash_usd),
            "initial_capital_hkd": float(user.initial_capital_hkd),
            "current_cash_hkd": float(user.current_cash_hkd),
            "frozen_cash_hkd": float(user.frozen_cash_hkd),
            "initial_capital_cny": float(user.initial_capital_cny),
            "current_cash_cny": float(user.current_cash_cny),
            "frozen_cash_cny": float(user.frozen_cash_cny),
        },
        "balances_by_currency": balances_by_currency,
        "positions_value_by_currency": positions_value_by_currency,
        "total_assets_usd": positions_value_usd + total_cash_usd,
        "positions_value_usd": positions_value_usd,
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
                    user = get_or_create_user(
                        db, 
                        msg.get("username", "demo"),
                        float(msg.get("initial_capital_usd", 100000)),
                        float(msg.get("initial_capital_hkd", 780000)),
                        float(msg.get("initial_capital_cny", 720000))
                    )
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
