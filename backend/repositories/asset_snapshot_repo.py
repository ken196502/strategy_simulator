from __future__ import annotations

from datetime import date
from typing import List, Optional

from sqlalchemy.orm import Session

from database.models import DailyAssetSnapshot


def upsert_daily_snapshot(
    db: Session,
    user_id: int,
    snapshot_date: date,
    *,
    cash_usd: float,
    cash_hkd: float,
    cash_cny: float,
    positions_usd: float,
    positions_hkd: float,
    positions_cny: float,
    total_assets_usd: float,
) -> DailyAssetSnapshot:
    record = (
        db.query(DailyAssetSnapshot)
        .filter(
            DailyAssetSnapshot.user_id == user_id,
            DailyAssetSnapshot.snapshot_date == snapshot_date,
        )
        .one_or_none()
    )

    if record:
        record.cash_usd = cash_usd
        record.cash_hkd = cash_hkd
        record.cash_cny = cash_cny
        record.positions_usd = positions_usd
        record.positions_hkd = positions_hkd
        record.positions_cny = positions_cny
        record.total_assets_usd = total_assets_usd
    else:
        record = DailyAssetSnapshot(
            version="v1",
            user_id=user_id,
            snapshot_date=snapshot_date,
            cash_usd=cash_usd,
            cash_hkd=cash_hkd,
            cash_cny=cash_cny,
            positions_usd=positions_usd,
            positions_hkd=positions_hkd,
            positions_cny=positions_cny,
            total_assets_usd=total_assets_usd,
        )
        db.add(record)

    db.flush()
    return record


def get_snapshots_for_user(db: Session, user_id: int) -> List[DailyAssetSnapshot]:
    return (
        db.query(DailyAssetSnapshot)
        .filter(DailyAssetSnapshot.user_id == user_id)
        .order_by(DailyAssetSnapshot.snapshot_date.asc())
        .all()
    )


def get_snapshot_for_date(
    db: Session,
    user_id: int,
    snapshot_date: date,
) -> Optional[DailyAssetSnapshot]:
    return (
        db.query(DailyAssetSnapshot)
        .filter(
            DailyAssetSnapshot.user_id == user_id,
            DailyAssetSnapshot.snapshot_date == snapshot_date,
        )
        .one_or_none()
    )
