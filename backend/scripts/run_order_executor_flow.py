"""Manual integration check for services.order_executor using live Snowball pricing."""

from __future__ import annotations

import argparse
import sys
import uuid

from database.connection import SessionLocal
from repositories.user_repo import get_or_create_user
from services.order_executor import place_and_execute
from services.xueqiu import (
    XueqiuMarketDataError,
    set_xueqiu_cookie_string,
)


def _format_order(order) -> str:
    return (
        f"Order(id={order.id}, no={order.order_no}, side={order.side}, market={order.market}, "
        f"symbol={order.symbol}, qty={order.quantity}, price={order.price}, status={order.status})"
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("cookie", help="Snowball cookie string")
    parser.add_argument("symbol", help="Trading symbol, e.g. AAPL or 0700")
    parser.add_argument("market", help="Market code, e.g. US or HK")
    parser.add_argument("quantity", type=int, help="Order quantity for both buy and sell legs")
    parser.add_argument(
        "--name",
        default=None,
        help="Display name for the security (defaults to symbol)",
    )
    parser.add_argument(
        "--username",
        default=None,
        help="Username for the integration test account (new user will be created if missing)",
    )

    args = parser.parse_args()

    username = args.username or f"xq_tester_{uuid.uuid4().hex[:8]}"
    security_name = args.name or args.symbol

    set_xueqiu_cookie_string(args.cookie)

    db = SessionLocal()
    try:
        user = get_or_create_user(db, username)
        print(f"Using user #{user.id} ({user.username})")

        buy_order = place_and_execute(
            db,
            user,
            args.symbol,
            security_name,
            args.market,
            "BUY",
            "MARKET",
            None,
            args.quantity,
        )
        print("BUY ->", _format_order(buy_order))

        sell_order = place_and_execute(
            db,
            user,
            args.symbol,
            security_name,
            args.market,
            "SELL",
            "MARKET",
            None,
            args.quantity,
        )
        print("SELL ->", _format_order(sell_order))

    except XueqiuMarketDataError as exc:
        print(f"Market data failure: {exc}")
        return 2
    except Exception as exc:  # pragma: no cover - manual diagnostics
        print(f"Unexpected error: {exc}")
        return 1
    finally:
        db.close()

    return 0


if __name__ == "__main__":
    sys.exit(main())
