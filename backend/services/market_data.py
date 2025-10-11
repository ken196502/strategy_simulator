from typing import Dict

# Very simple in-memory market data for demo purposes
MOCK_PRICES: Dict[str, float] = {
    "AAPL.US": 190.0,
    "TSLA.US": 250.0,
    "0700.HK": 320.0,
}


def get_last_price(symbol: str, market: str) -> float:
    key = f"{symbol}.{market}"
    return MOCK_PRICES.get(key, 100.0)
