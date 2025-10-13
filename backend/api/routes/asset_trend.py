from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database.connection import get_db
from repositories.user_repo import get_user
from services.asset_snapshot_service import generate_daily_snapshot, get_asset_trend

router = APIRouter(prefix="/asset-trend", tags=["asset-trend"])


@router.get("/")
def read_asset_trend(
    user_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    if not get_user(db, user_id):
        raise HTTPException(status_code=404, detail="User not found")

    generate_daily_snapshot(db, user_id)
    snapshots = get_asset_trend(db, user_id)
    return {"snapshots": snapshots}
