from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Optional

from sqlalchemy.orm import Session

from database.models import DailyStockPrice


def get_price_for_date(
    db: Session,
    symbol: str,
    market: str,
    price_date: date,
) -> Optional[Decimal]:
    record = (
        db.query(DailyStockPrice)
        .filter(
            DailyStockPrice.symbol == symbol.upper(),
            DailyStockPrice.market == market.upper(),
            DailyStockPrice.price_date == price_date,
        )
        .one_or_none()
    )
    if not record:
        return None
    return Decimal(record.price)


def upsert_daily_price(
    db: Session,
    symbol: str,
    market: str,
    price_date: date,
    price: float,
) -> DailyStockPrice:
    record = (
        db.query(DailyStockPrice)
        .filter(
            DailyStockPrice.symbol == symbol.upper(),
            DailyStockPrice.market == market.upper(),
            DailyStockPrice.price_date == price_date,
        )
        .one_or_none()
    )

    if record:
        record.price = price
    else:
        record = DailyStockPrice(
            version="v1",
            symbol=symbol.upper(),
            market=market.upper(),
            price_date=price_date,
            price=price,
        )
        db.add(record)

    db.flush()
    return record
