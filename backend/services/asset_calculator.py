from decimal import Decimal
from sqlalchemy.orm import Session
from database.models import Position
from .market_data import get_last_price


def calc_positions_value(db: Session, user_id: int) -> float:
    positions = db.query(Position).filter(Position.user_id == user_id).all()
    total = Decimal("0")
    for p in positions:
        price = Decimal(str(get_last_price(p.symbol, p.market)))
        total += price * Decimal(p.quantity)
    return float(total)
