from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from database.connection import engine, Base, SessionLocal
from database.models import TradingConfig, User
from config.settings import DEFAULT_TRADING_CONFIGS
app = FastAPI(title="Simulated US/HK Trading API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:2414"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    # Create tables
    Base.metadata.create_all(bind=engine)
    # Seed trading configs if empty
    db: Session = SessionLocal()
    try:
        if db.query(TradingConfig).count() == 0:
            for cfg in DEFAULT_TRADING_CONFIGS.values():
                db.add(
                    TradingConfig(
                        version="v1",
                        market=cfg.market,
                        min_commission=cfg.min_commission,
                        commission_rate=cfg.commission_rate,
                        exchange_rate=cfg.exchange_rate,
                        min_order_quantity=cfg.min_order_quantity,
                        lot_size=cfg.lot_size,
                    )
                )
            db.commit()
        # Ensure a demo user exists
        if db.query(User).count() == 0:
            demo = User(
                version="v1",
                username="demo",
                # USD fields
                initial_capital_usd=100000.0,
                current_cash_usd=100000.0,
                frozen_cash_usd=0.0,
                # HKD fields
                initial_capital_hkd=780000.0,
                current_cash_hkd=780000.0,
                frozen_cash_hkd=0.0,
                # CNY fields
                initial_capital_cny=720000.0,
                current_cash_cny=720000.0,
                frozen_cash_cny=0.0,
            )
            db.add(demo)
            db.commit()
    finally:
        db.close()


# WS-only runtime (HTTP routers not registered)
from api.ws import websocket_endpoint
app.add_api_websocket_route("/ws", websocket_endpoint)
