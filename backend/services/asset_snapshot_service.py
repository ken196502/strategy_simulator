from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Dict, List

from sqlalchemy.orm import Session

from database.models import Trade, User
from repositories.asset_snapshot_repo import (
    get_snapshots_for_user,
    upsert_daily_snapshot,
)
from repositories.daily_price_repo import get_price_for_date
from repositories.user_repo import convert_currency, get_user
from services.market_data import get_last_price
from services.xueqiu import XueqiuMarketDataError

MARKET_TO_CURRENCY = {
    "US": "usd",
    "HK": "hkd",
    "CN": "cny",
}


@dataclass
class Holding:
    quantity: Decimal
    currency: str
    last_price: Decimal | None = None


def _ensure_rate(db: Session, amount: Decimal, currency: str) -> Decimal:
    if amount == 0:
        return Decimal("0")
    converted = convert_currency(db, float(amount), currency.upper(), "USD")
    if converted is None:
        raise RuntimeError(f"Missing exchange rate for {currency.upper()} -> USD")
    return Decimal(str(converted))


def _initial_cash(user: User) -> Dict[str, Decimal]:
    return {
        "usd": Decimal(user.initial_capital_usd or 0),
        "hkd": Decimal(user.initial_capital_hkd or 0),
        "cny": Decimal(user.initial_capital_cny or 0),
    }


def _gather_trades(db: Session, user_id: int, target_date: date) -> List[Trade]:
    return (
        db.query(Trade)
        .filter(Trade.user_id == user_id)
        .order_by(Trade.trade_time.asc())
        .all()
    )


def _trade_date(trade: Trade) -> date | None:
    if not trade.trade_time:
        return None
    if trade.trade_time.tzinfo is None:
        return trade.trade_time.date()
    return trade.trade_time.astimezone(timezone.utc).date()


def _position_valuation(
    db: Session,
    holdings: Dict[str, Holding],
    as_of: date,
) -> Dict[str, Decimal]:
    totals = {"usd": Decimal("0"), "hkd": Decimal("0"), "cny": Decimal("0")}
    for symbol_market, holding in holdings.items():
        quantity = holding.quantity
        if quantity == 0:
            continue
        symbol, market = symbol_market.split("::", 1)
        stored_price = get_price_for_date(db, symbol, market, as_of)
        if stored_price is None:
            if holding.last_price is not None:
                price_value = holding.last_price
            else:
                try:
                    price_value = Decimal(
                        str(get_last_price(symbol, market, db=db, price_date=as_of))
                    )
                except XueqiuMarketDataError:
                    continue
        else:
            price_value = stored_price
        totals[holding.currency] += price_value * quantity
    return totals


def generate_daily_snapshot(db: Session, user_id: int, snapshot_date: date | None = None):
    target_date = snapshot_date or datetime.now(timezone.utc).date()
    user = get_user(db, user_id)
    if not user:
        raise RuntimeError(f"User {user_id} not found")

    trades = _gather_trades(db, user_id, target_date)

    dates_to_process = {target_date}
    for trade in trades:
        trade_day = _trade_date(trade)
        if trade_day and trade_day <= target_date:
            dates_to_process.add(trade_day)

    if not dates_to_process:
        dates_to_process.add(target_date)

    ordered_dates = sorted(dates_to_process)

    cash_by_currency = _initial_cash(user)
    holdings: Dict[str, Holding] = {}

    trade_index = 0
    total_trades = len(trades)
    last_snapshot = None

    for current_date in ordered_dates:
        while trade_index < total_trades:
            trade = trades[trade_index]
            trade_day = _trade_date(trade)
            if not trade_day or trade_day > current_date:
                break
            currency = MARKET_TO_CURRENCY.get(trade.market)
            if not currency:
                trade_index += 1
                continue

            price = Decimal(str(trade.price))
            quantity = Decimal(trade.quantity or 0)
            commission = Decimal(trade.commission or 0)

            if trade.side == "BUY":
                cash_by_currency[currency] -= price * quantity + commission
                delta_qty = quantity
            else:
                cash_by_currency[currency] += price * quantity - commission
                delta_qty = -quantity

            symbol_key = f"{trade.symbol.upper()}::{trade.market.upper()}"
            current = holdings.get(symbol_key)
            if current is None:
                current = Holding(quantity=Decimal("0"), currency=currency, last_price=None)
            current.quantity += delta_qty
            current.currency = currency
            current.last_price = price
            if current.quantity == 0:
                holdings.pop(symbol_key, None)
            else:
                holdings[symbol_key] = current

            trade_index += 1

        positions_by_currency = _position_valuation(db, holdings, current_date)

        cash_usd = sum(
            _ensure_rate(db, amount, currency)
            for currency, amount in cash_by_currency.items()
        )
        positions_usd = sum(
            _ensure_rate(db, amount, currency)
            for currency, amount in positions_by_currency.items()
        )

        total_assets_usd = cash_usd + positions_usd

        snapshot = upsert_daily_snapshot(
            db,
            user_id,
            current_date,
            cash_usd=float(cash_by_currency["usd"]),
            cash_hkd=float(cash_by_currency["hkd"]),
            cash_cny=float(cash_by_currency["cny"]),
            positions_usd=float(positions_by_currency["usd"]),
            positions_hkd=float(positions_by_currency["hkd"]),
            positions_cny=float(positions_by_currency["cny"]),
            total_assets_usd=float(total_assets_usd),
        )

        last_snapshot = snapshot

    db.commit()
    if last_snapshot:
        db.refresh(last_snapshot)
    return last_snapshot


def get_asset_trend(db: Session, user_id: int) -> List[Dict[str, float]]:
    snapshots = get_snapshots_for_user(db, user_id)
    if not snapshots:
        return []

    initial_total = Decimal(snapshots[0].total_assets_usd or 0)
    previous_total = None
    trend: List[Dict[str, float]] = []

    for record in snapshots:
        total = Decimal(record.total_assets_usd or 0)
        cash_total = _ensure_rate(
            db,
            Decimal(record.cash_usd or 0),
            "USD",
        ) + _ensure_rate(db, Decimal(record.cash_hkd or 0), "HKD") + _ensure_rate(
            db,
            Decimal(record.cash_cny or 0),
            "CNY",
        )

        positions_total = _ensure_rate(db, Decimal(record.positions_usd or 0), "USD") + _ensure_rate(
            db,
            Decimal(record.positions_hkd or 0),
            "HKD",
        ) + _ensure_rate(db, Decimal(record.positions_cny or 0), "CNY")

        daily_change = total - (previous_total if previous_total is not None else total)
        cumulative_change = total - initial_total

        trend.append(
            {
                "date": record.snapshot_date.isoformat(),
                "daily_change_usd": float(daily_change),
                "total_assets_usd": float(total),
                "cumulative_change_usd": float(cumulative_change),
                "cash_usd": float(cash_total),
                "cash_breakdown": {
                    "usd": float(record.cash_usd or 0),
                    "hkd": float(record.cash_hkd or 0),
                    "cny": float(record.cash_cny or 0),
                },
                "positions_usd": float(positions_total),
                "positions_breakdown": {
                    "usd": float(record.positions_usd or 0),
                    "hkd": float(record.positions_hkd or 0),
                    "cny": float(record.positions_cny or 0),
                },
            }
        )

        previous_total = total

    return trend
