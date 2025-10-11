from sqlalchemy.orm import Session
from database.models import Position
from typing import List, Optional


def list_positions(db: Session, user_id: int) -> List[Position]:
    return db.query(Position).filter(Position.user_id == user_id).all()


def get_position(db: Session, user_id: int, symbol: str, market: str) -> Optional[Position]:
    return (
        db.query(Position)
        .filter(
            Position.user_id == user_id,
            Position.symbol == symbol,
            Position.market == market,
        )
        .first()
    )


def upsert_position(db: Session, position: Position) -> Position:
    db.add(position)
    db.commit()
    db.refresh(position)
    return position
