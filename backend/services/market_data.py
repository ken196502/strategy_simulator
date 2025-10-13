import logging

from services.xueqiu import (
    XueqiuMarketDataError,
    get_last_price_from_xueqiu,
    xueqiu_client,
)


logger = logging.getLogger(__name__)

def get_last_price(symbol: str, market: str) -> float:
    if not xueqiu_client.has_any_cookie():
        raise XueqiuMarketDataError(
            "Snowball cookie not configured. Please set the cookie string from the settings panel."
        )

    try:
        return get_last_price_from_xueqiu(symbol, market)
    except Exception as exc:
        logger.error("Snowball price fetch failed for %s.%s: %s", symbol, market, exc)
        raise
