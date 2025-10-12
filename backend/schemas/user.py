from pydantic import BaseModel
from typing import Optional


class UserCreate(BaseModel):
    username: str
    initial_capital_usd: float = 100000.0
    initial_capital_hkd: float = 780000.0
    initial_capital_cny: float = 720000.0


class CurrencyBalance(BaseModel):
    """单个币种的资金余额"""
    initial_capital: float
    current_cash: float
    frozen_cash: float


class UserOut(BaseModel):
    id: int
    username: str
    
    # USD currency fields (美股市场)
    initial_capital_usd: float
    current_cash_usd: float
    frozen_cash_usd: float
    
    # HKD currency fields (港股市场)
    initial_capital_hkd: float
    current_cash_hkd: float
    frozen_cash_hkd: float
    
    # CNY currency fields (A股市场)
    initial_capital_cny: float
    current_cash_cny: float
    frozen_cash_cny: float

    class Config:
        from_attributes = True


class UserBalancesByCurrency(BaseModel):
    """按币种分组的用户资金信息"""
    usd: CurrencyBalance
    hkd: CurrencyBalance
    cny: CurrencyBalance


class AccountOverview(BaseModel):
    user: UserOut
    balances_by_currency: UserBalancesByCurrency
    total_assets_usd: float  # 所有资产折算成USD的总值
    positions_value_usd: float  # 所有持仓折算成USD的总值
    positions_value_by_currency: dict  # 各币种持仓市值（本币）
