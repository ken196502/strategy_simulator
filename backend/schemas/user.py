from pydantic import BaseModel
from typing import Optional


class UserCreate(BaseModel):
    username: str
    initial_capital: float = 100000.0


class UserOut(BaseModel):
    id: int
    username: str
    initial_capital: float
    current_cash: float
    frozen_cash: float

    class Config:
        from_attributes = True


class AccountOverview(BaseModel):
    user: UserOut
    total_assets: float
    positions_value: float
