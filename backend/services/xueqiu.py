"""Snowball (Xueqiu) market data integration for real-time order validation."""

from __future__ import annotations

import logging
import os
import time
from datetime import datetime
from typing import Any, Dict, List

import requests

logger = logging.getLogger(__name__)


class XueqiuMarketDataError(RuntimeError):
    """Base exception for Xueqiu market data failures."""


def _parse_cookie_string(cookie_string: str) -> Dict[str, str]:
    cookies: Dict[str, str] = {}
    for part in cookie_string.split(";"):
        if "=" not in part:
            continue
        name, value = part.split("=", 1)
        cookies[name.strip()] = value.strip()
    return cookies


def _format_symbol(symbol: str, market: str) -> str:
    sym = symbol.upper().strip()
    if "." in sym:
        return sym

    if market == "HK":
        return sym.zfill(5)

    if market == "CN":
        if sym.startswith("6"):
            return f"SH{sym}"
        elif sym.startswith("8"):
            return f"BJ{sym}"
        else:
            return f"SZ{sym}"

    return sym


class XueqiuMarketData:
    """Client wrapper for Snowball minute level K-line endpoints."""

    BASE_URL = "https://stock.xueqiu.com/v5/stock/chart/kline.json"

    def __init__(self) -> None:
        self.session = requests.Session()
        self._session_configured = False
        self._cookie_string: str | None = None
        self._has_user_cookie = False
        self._has_env_cookie = False
        self._env_cookie_invalid = False

    def _configure_session(self) -> None:
        if self._session_configured:
            return

        headers = {
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "zh-CN,zh;q=0.9",
            "User-Agent": os.getenv(
                "XUEQIU_USER_AGENT",
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
            ),
            "Referer": os.getenv("XUEQIU_REFERER", "https://xueqiu.com"),
            "Connection": "keep-alive",
        }
        self.session.headers.clear()
        self.session.headers.update(headers)

        cookies: Dict[str, str] = {}
        env_cookie_present = False

        if self._cookie_string:
            cookies.update(_parse_cookie_string(self._cookie_string))
        elif not self._env_cookie_invalid:
            cookie_env = os.getenv("XUEQIU_COOKIES") or os.getenv("XUEQIU_COOKIE")
            if cookie_env:
                cookies.update(_parse_cookie_string(cookie_env))
                env_cookie_present = True

        if not self._env_cookie_invalid:
            token_env_mapping = {
                "xq_a_token": "XUEQIU_TOKEN",
                "xq_r_token": "XUEQIU_R_TOKEN",
                "xq_id_token": "XUEQIU_ID_TOKEN",
            }
            for cookie_name, env_name in token_env_mapping.items():
                env_value = os.getenv(env_name)
                if env_value and cookie_name not in cookies:
                    cookies[cookie_name] = env_value
                    env_cookie_present = True

        self.session.cookies.clear()
        if cookies:
            self.session.cookies.update(cookies)

        self._has_env_cookie = env_cookie_present

        self._session_configured = True

    def set_cookie_string(self, cookie_string: str | None) -> None:
        self._cookie_string = cookie_string.strip() if cookie_string else None
        self._has_user_cookie = bool(self._cookie_string)
        self._session_configured = False
        self._configure_session()
        if self._cookie_string:
            logger.info("Xueqiu cookie string updated")
        else:
            logger.info("Xueqiu cookie string cleared")

    def has_user_cookie(self) -> bool:
        self._configure_session()
        return self._has_user_cookie

    def has_any_cookie(self) -> bool:
        self._configure_session()
        return self._has_user_cookie or self._has_env_cookie

    def _mark_cookie_invalid(self) -> None:
        if self._has_user_cookie:
            logger.warning("Provided Snowball cookie string appears invalid; clearing it.")
            self._cookie_string = None
            self._has_user_cookie = False
        else:
            logger.warning("Environment Snowball cookie appears invalid; disabling it for this process.")
            self._env_cookie_invalid = True
            self._has_env_cookie = False
        self._session_configured = False

    def get_kline_data(
        self,
        symbol: str,
        market: str,
        period: str = "1m",
        count: int = 100,
    ) -> Dict[str, Any]:
        self._configure_session()

        formatted_symbol = _format_symbol(symbol, market)
        params = {
            "symbol": formatted_symbol,
            "begin": int(time.time() * 1000),
            "period": period,
            "type": "before",
            "count": -abs(count),
            "indicator": "kline",
        }

        try:
            response = self.session.get(self.BASE_URL, params=params, timeout=10)
            response.raise_for_status()
            data = response.json()
        except Exception as exc:
            raise XueqiuMarketDataError(
                f"Failed to fetch kline for {formatted_symbol}: {exc}"
            ) from exc

        if not data:
            raise XueqiuMarketDataError(f"Empty response when requesting {formatted_symbol}")

        if "error_code" in data and data.get("error_code"):
            error_code = data.get("error_code")
            error_desc = data.get("error_description") or data.get("error_msg") or "Unknown error"
            self._mark_cookie_invalid()
            raise XueqiuMarketDataError(
                f"Snowball API error ({error_code}): {error_desc}. Cookie may be invalid or expired."
            )

        if "data" not in data:
            self._mark_cookie_invalid()
            raise XueqiuMarketDataError(
                f"Invalid kline payload for {formatted_symbol}; cookie may be invalid."
            )

        return data

    def get_latest_price(self, symbol: str, market: str) -> float:
        kline_data = self.get_kline_data(symbol, market, period="1m", count=1)
        data = kline_data.get("data", {})
        items: List[List[Any]] = data.get("item", [])  # type: ignore[assignment]
        columns: List[str] = data.get("column", [])  # type: ignore[assignment]

        if not items or not columns or "close" not in columns:
            self._mark_cookie_invalid()
            raise XueqiuMarketDataError(
                "Snowball response missing price information; cookie may be invalid or expired."
            )

        latest_item = items[0]
        close_index = columns.index("close")
        try:
            return float(latest_item[close_index])
        except (TypeError, ValueError, IndexError) as exc:
            self._mark_cookie_invalid()
            raise XueqiuMarketDataError("Invalid close price data") from exc

    def parse_kline_data(self, raw_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        data = raw_data.get("data", {})
        columns: List[str] = data.get("column", [])  # type: ignore[assignment]
        items: List[List[Any]] = data.get("item", [])  # type: ignore[assignment]

        if not columns or not items:
            return []

        column_map = {col: idx for idx, col in enumerate(columns)}
        parsed: List[Dict[str, Any]] = []

        for item in items:
            kline_record: Dict[str, Any] = {}

            if "timestamp" in column_map:
                try:
                    timestamp = int(item[column_map["timestamp"]])
                except (TypeError, ValueError, IndexError):
                    timestamp = None
                if timestamp:
                    kline_record["timestamp"] = timestamp
                    kline_record["datetime"] = datetime.fromtimestamp(timestamp / 1000)

            for field in ("open", "high", "low", "close", "volume", "amount"):
                idx = column_map.get(field)
                if idx is None or idx >= len(item):
                    continue
                value = item[idx]
                kline_record[field] = float(value) if value is not None else None

            for field in ("chg", "percent"):
                idx = column_map.get(field)
                if idx is None or idx >= len(item):
                    continue
                value = item[idx]
                kline_record[field] = float(value) if value is not None else None

            parsed.append(kline_record)

        return parsed

    def get_market_status(self, symbol: str, market: str) -> Dict[str, Any]:
        current_time = datetime.now()
        hour = current_time.hour

        if market == "US":
            trading = 21 <= hour <= 23 or 0 <= hour <= 4
        elif market == "HK":
            trading = 9 <= hour < 16
        else:
            trading = 9 <= hour < 15

        status = "TRADING" if trading else "CLOSED"

        return {
            "symbol": symbol,
            "market": market,
            "market_status": status,
            "timestamp": int(time.time() * 1000),
            "current_time": current_time.isoformat(),
        }


xueqiu_client = XueqiuMarketData()


def get_last_price_from_xueqiu(symbol: str, market: str) -> float:
    price = xueqiu_client.get_latest_price(symbol, market)
    if price <= 0:
        raise XueqiuMarketDataError(f"Invalid latest price for {symbol} ({market})")
    return price


def get_kline_data_from_xueqiu(
    symbol: str,
    market: str,
    period: str = "1m",
    count: int = 100,
) -> List[Dict[str, Any]]:
    raw_data = xueqiu_client.get_kline_data(symbol, market, period, count)
    parsed = xueqiu_client.parse_kline_data(raw_data)
    if not parsed:
        raise XueqiuMarketDataError(f"Failed to parse kline data for {symbol} ({market})")
    return parsed


def set_xueqiu_cookie_string(cookie_string: str | None) -> None:
    xueqiu_client.set_cookie_string(cookie_string)