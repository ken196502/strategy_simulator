from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from database.connection import engine, Base, SessionLocal
from database.models import TradingConfig, User, ExchangeRate
from config.settings import DEFAULT_TRADING_CONFIGS

DEFAULT_EXCHANGE_RATES = [
    ("HKD", "USD", 0.1289),
    ("CNY", "USD", 0.1380),
    ("USD", "HKD", 7.7585),
    ("CNY", "HKD", 1.0705),
    ("HKD", "CNY", 0.9342),
    ("USD", "CNY", 7.2468),
]
from services.order_monitor import start_order_monitor, stop_order_monitor
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
        for from_currency, to_currency, rate in DEFAULT_EXCHANGE_RATES:
            record = (
                db.query(ExchangeRate)
                .filter(
                    ExchangeRate.from_currency == from_currency,
                    ExchangeRate.to_currency == to_currency,
                )
                .one_or_none()
            )
            if record:
                record.rate = rate
            else:
                db.add(
                    ExchangeRate(
                        version="v1",
                        from_currency=from_currency,
                        to_currency=to_currency,
                        rate=rate,
                    )
                )
        db.commit()
        # Ensure a demo user exists
        if db.query(User).count() == 0:
            demo = User(
                version="v1",
                username="demo",
                # USD fields
                initial_capital_usd=10000.0,
                current_cash_usd=10000.0,
                frozen_cash_usd=0.0,
                # HKD fields
                initial_capital_hkd=78000.0,
                current_cash_hkd=78000.0,
                frozen_cash_hkd=0.0,
                # CNY fields
                initial_capital_cny=72000.0,
                current_cash_cny=72000.0,
                frozen_cash_cny=0.0,
            )
            db.add(demo)
            db.commit()
    finally:
        db.close()
    
    # Start order monitor for background order processing
    start_order_monitor(check_interval=5.0)


@app.on_event("shutdown")
def on_shutdown():
    # Stop order monitor on application shutdown
    stop_order_monitor()


# WS-only runtime (HTTP routers not registered)
from api.ws import websocket_endpoint
from api.routes.asset_trend import router as asset_trend_router

app.add_api_websocket_route("/ws", websocket_endpoint)
app.include_router(asset_trend_router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=2314)
