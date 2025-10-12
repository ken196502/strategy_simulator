from sqlalchemy.orm import Session
from typing import Optional, Dict
from database.models import User, ExchangeRate
from decimal import Decimal


def get_or_create_user(
    db: Session, 
    username: str, 
    initial_capital_usd: float = 100000.0,
    initial_capital_hkd: float = 780000.0,
    initial_capital_cny: float = 720000.0
) -> User:
    user = db.query(User).filter(User.username == username).first()
    if user:
        return user
    user = User(
        version="v1",
        username=username,
        # USD fields
        initial_capital_usd=initial_capital_usd,
        current_cash_usd=initial_capital_usd,
        frozen_cash_usd=0.0,
        # HKD fields
        initial_capital_hkd=initial_capital_hkd,
        current_cash_hkd=initial_capital_hkd,
        frozen_cash_hkd=0.0,
        # CNY fields
        initial_capital_cny=initial_capital_cny,
        current_cash_cny=initial_capital_cny,
        frozen_cash_cny=0.0,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def get_user(db: Session, user_id: int) -> Optional[User]:
    return db.query(User).filter(User.id == user_id).first()


def update_user_cash(
    db: Session, 
    user_id: int, 
    currency: str, 
    current_cash: float, 
    frozen_cash: float = None
) -> Optional[User]:
    """更新用户指定币种的现金余额"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return None
    
    currency = currency.lower()
    if currency == "usd":
        user.current_cash_usd = current_cash
        if frozen_cash is not None:
            user.frozen_cash_usd = frozen_cash
    elif currency == "hkd":
        user.current_cash_hkd = current_cash
        if frozen_cash is not None:
            user.frozen_cash_hkd = frozen_cash
    elif currency == "cny":
        user.current_cash_cny = current_cash
        if frozen_cash is not None:
            user.frozen_cash_cny = frozen_cash
    else:
        raise ValueError(f"Unsupported currency: {currency}")
    
    db.commit()
    db.refresh(user)
    return user


def get_user_balance_by_currency(db: Session, user_id: int, currency: str) -> Dict[str, float]:
    """获取用户指定币种的资金余额"""
    user = get_user(db, user_id)
    if not user:
        return None
    
    currency = currency.lower()
    if currency == "usd":
        return {
            "initial_capital": float(user.initial_capital_usd),
            "current_cash": float(user.current_cash_usd),
            "frozen_cash": float(user.frozen_cash_usd)
        }
    elif currency == "hkd":
        return {
            "initial_capital": float(user.initial_capital_hkd),
            "current_cash": float(user.current_cash_hkd),
            "frozen_cash": float(user.frozen_cash_hkd)
        }
    elif currency == "cny":
        return {
            "initial_capital": float(user.initial_capital_cny),
            "current_cash": float(user.current_cash_cny),
            "frozen_cash": float(user.frozen_cash_cny)
        }
    else:
        raise ValueError(f"Unsupported currency: {currency}")


def get_exchange_rate(db: Session, from_currency: str, to_currency: str) -> Optional[float]:
    """获取汇率"""
    if from_currency == to_currency:
        return 1.0
    
    rate = db.query(ExchangeRate).filter(
        ExchangeRate.from_currency == from_currency.upper(),
        ExchangeRate.to_currency == to_currency.upper()
    ).first()
    
    if rate:
        return float(rate.rate)
    
    # 尝试反向汇率
    reverse_rate = db.query(ExchangeRate).filter(
        ExchangeRate.from_currency == to_currency.upper(),
        ExchangeRate.to_currency == from_currency.upper()
    ).first()
    
    if reverse_rate:
        return 1.0 / float(reverse_rate.rate)
    
    return None


def convert_currency(
    db: Session, 
    amount: float, 
    from_currency: str, 
    to_currency: str
) -> Optional[float]:
    """货币换算"""
    rate = get_exchange_rate(db, from_currency, to_currency)
    if rate is None:
        return None
    return amount * rate
