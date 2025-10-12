from decimal import Decimal
from sqlalchemy.orm import Session
from database.models import Position
from .market_data import get_last_price

# Simple FX rates for demo purposes
MARKET_TO_USD_RATE = {
    "US": Decimal("1.0"),
    "HK": Decimal("1.0") / Decimal("7.8"),  # HKD -> USD
    "CN": Decimal("1.0") / Decimal("7.2"),  # CNY -> USD
}


def calc_positions_value(db: Session, user_id: int) -> float:
    """Total positions value converted to USD."""
    positions = db.query(Position).filter(Position.user_id == user_id).all()
    total_usd = Decimal("0")
    for p in positions:
        price_native = Decimal(str(get_last_price(p.symbol, p.market)))
        value_native = price_native * Decimal(p.quantity)
        fx = MARKET_TO_USD_RATE.get(p.market, Decimal("1.0"))
        total_usd += value_native * fx
    return float(total_usd)


def calc_positions_value_by_currency(db: Session, user_id: int) -> dict:
    """Positions value grouped by market currency in native currency units."""
    positions = db.query(Position).filter(Position.user_id == user_id).all()
    totals = {"usd": Decimal("0"), "hkd": Decimal("0"), "cny": Decimal("0")}
    for p in positions:
        price_native = Decimal(str(get_last_price(p.symbol, p.market)))
        value_native = price_native * Decimal(p.quantity)
        if p.market == "US":
            totals["usd"] += value_native
        elif p.market == "HK":
            totals["hkd"] += value_native
        elif p.market == "CN":
            totals["cny"] += value_native
    return {k: float(v) for k, v in totals.items()}
