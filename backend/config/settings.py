from pydantic import BaseModel
from typing import Dict


class MarketConfig(BaseModel):
    market: str
    min_commission: float
    commission_rate: float
    exchange_rate: float
    min_order_quantity: int = 1
    lot_size: int = 1


# Demo default configs for US and HK
DEFAULT_TRADING_CONFIGS: Dict[str, MarketConfig] = {
    "US": MarketConfig(
        market="US",
        min_commission=1.0,
        commission_rate=0.005,  # 0.5% as per spec
        exchange_rate=1.0,
        min_order_quantity=1,
        lot_size=1,
    ),
    "HK": MarketConfig(
        market="HK",
        min_commission=20.0,
        commission_rate=0.00027,
        exchange_rate=7.8,
        min_order_quantity=100,
        lot_size=100,
    ),
}
