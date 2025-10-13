import logging
from datetime import datetime, timezone, date
from typing import Optional

from services.xueqiu import (
    XueqiuMarketDataError,
    get_last_price_from_xueqiu,
    xueqiu_client,
)

from database.connection import SessionLocal
from repositories.daily_price_repo import upsert_daily_price
from sqlalchemy.orm import Session


logger = logging.getLogger(__name__)

def get_last_price(
    symbol: str,
    market: str,
    *,
    db: Optional[Session] = None,
    price_date: Optional[date] = None,
    skip_cookie_check: bool = False,
) -> float:
    if not skip_cookie_check and not xueqiu_client.has_any_cookie():
        raise XueqiuMarketDataError(
            "Snowball cookie not configured. Please set the cookie string from the settings panel."
        )

    try:
        price = get_last_price_from_xueqiu(symbol, market)
        session_provided = db is not None
        session = db or SessionLocal()
        target_date = price_date or datetime.now(timezone.utc).date()
        try:
            upsert_daily_price(session, symbol, market, target_date, price)
            if session_provided:
                session.flush()
            else:
                session.commit()
        finally:
            if not session_provided:
                session.close()
        return price
    except Exception as exc:
        logger.error("Snowball price fetch failed for %s.%s: %s", symbol, market, exc)
        raise
