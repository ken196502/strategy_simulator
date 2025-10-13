from sqlalchemy import Column, Integer, String, DECIMAL, TIMESTAMP, DATE, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from .connection import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    version = Column(String(100), nullable=False, default="v1")
    username = Column(String(50), unique=True, nullable=False)
    
    # USD currency fields (美股市场)
    initial_capital_usd = Column(DECIMAL(18, 2), nullable=False, default=100000.00)
    current_cash_usd = Column(DECIMAL(18, 2), nullable=False, default=100000.00)
    frozen_cash_usd = Column(DECIMAL(18, 2), nullable=False, default=0.00)
    
    # HKD currency fields (港股市场)
    initial_capital_hkd = Column(DECIMAL(18, 2), nullable=False, default=780000.00)
    current_cash_hkd = Column(DECIMAL(18, 2), nullable=False, default=780000.00)
    frozen_cash_hkd = Column(DECIMAL(18, 2), nullable=False, default=0.00)
    
    # CNY currency fields (A股市场)
    initial_capital_cny = Column(DECIMAL(18, 2), nullable=False, default=720000.00)
    current_cash_cny = Column(DECIMAL(18, 2), nullable=False, default=720000.00)
    frozen_cash_cny = Column(DECIMAL(18, 2), nullable=False, default=0.00)
    
    created_at = Column(TIMESTAMP, server_default=func.current_timestamp())
    updated_at = Column(
        TIMESTAMP, server_default=func.current_timestamp(), onupdate=func.current_timestamp()
    )

    positions = relationship("Position", back_populates="user")
    orders = relationship("Order", back_populates="user")
    asset_snapshots = relationship("DailyAssetSnapshot", back_populates="user")


class Position(Base):
    __tablename__ = "positions"

    id = Column(Integer, primary_key=True, index=True)
    version = Column(String(100), nullable=False, default="v1")
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    symbol = Column(String(20), nullable=False)
    name = Column(String(100), nullable=False)
    market = Column(String(10), nullable=False)
    quantity = Column(Integer, nullable=False, default=0)
    available_quantity = Column(Integer, nullable=False, default=0)
    avg_cost = Column(DECIMAL(18, 6), nullable=False, default=0)
    created_at = Column(TIMESTAMP, server_default=func.current_timestamp())
    updated_at = Column(
        TIMESTAMP, server_default=func.current_timestamp(), onupdate=func.current_timestamp()
    )

    user = relationship("User", back_populates="positions")


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    version = Column(String(100), nullable=False, default="v1")
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    order_no = Column(String(32), unique=True, nullable=False)
    symbol = Column(String(20), nullable=False)
    name = Column(String(100), nullable=False)
    market = Column(String(10), nullable=False)
    side = Column(String(10), nullable=False)
    order_type = Column(String(20), nullable=False)
    price = Column(DECIMAL(18, 6))
    quantity = Column(Integer, nullable=False)
    filled_quantity = Column(Integer, nullable=False, default=0)
    status = Column(String(20), nullable=False)
    created_at = Column(TIMESTAMP, server_default=func.current_timestamp())
    updated_at = Column(
        TIMESTAMP, server_default=func.current_timestamp(), onupdate=func.current_timestamp()
    )

    user = relationship("User", back_populates="orders")
    trades = relationship("Trade", back_populates="order")


class Trade(Base):
    __tablename__ = "trades"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    symbol = Column(String(20), nullable=False)
    name = Column(String(100), nullable=False)
    market = Column(String(10), nullable=False)
    side = Column(String(10), nullable=False)
    price = Column(DECIMAL(18, 6), nullable=False)
    quantity = Column(Integer, nullable=False)
    commission = Column(DECIMAL(18, 6), nullable=False, default=0)
    exchange_rate = Column(DECIMAL(10, 6), default=1.0)
    trade_time = Column(TIMESTAMP, server_default=func.current_timestamp())

    order = relationship("Order", back_populates="trades")


class TradingConfig(Base):
    __tablename__ = "trading_configs"

    id = Column(Integer, primary_key=True, index=True)
    version = Column(String(100), nullable=False, default="v1")
    market = Column(String(10), unique=True, nullable=False)
    min_commission = Column(DECIMAL(10, 2), nullable=False)
    commission_rate = Column(DECIMAL(8, 6), nullable=False)
    exchange_rate = Column(DECIMAL(10, 6), default=1.0)
    min_order_quantity = Column(Integer, default=1)
    lot_size = Column(Integer, default=1)
    updated_at = Column(
        TIMESTAMP, server_default=func.current_timestamp(), onupdate=func.current_timestamp()
    )


class ExchangeRate(Base):
    __tablename__ = "exchange_rates"

    id = Column(Integer, primary_key=True, index=True)
    version = Column(String(100), nullable=False, default="v1")
    from_currency = Column(String(3), nullable=False)  # USD, HKD, CNY
    to_currency = Column(String(3), nullable=False)    # USD, HKD, CNY
    rate = Column(DECIMAL(10, 6), nullable=False)      # 汇率
    updated_at = Column(
        TIMESTAMP, server_default=func.current_timestamp(), onupdate=func.current_timestamp()
    )

    # 添加唯一约束，确保每对货币只有一个汇率记录
    __table_args__ = (
        UniqueConstraint('from_currency', 'to_currency', name='_currency_pair_uc'),
    )


class DailyStockPrice(Base):
    __tablename__ = "daily_stock_prices"

    id = Column(Integer, primary_key=True, index=True)
    version = Column(String(100), nullable=False, default="v1")
    symbol = Column(String(20), nullable=False)
    market = Column(String(10), nullable=False)
    price_date = Column(DATE, nullable=False)
    price = Column(DECIMAL(18, 6), nullable=False)
    created_at = Column(TIMESTAMP, server_default=func.current_timestamp())
    updated_at = Column(
        TIMESTAMP, server_default=func.current_timestamp(), onupdate=func.current_timestamp()
    )

    __table_args__ = (
        UniqueConstraint('symbol', 'market', 'price_date', name='_symbol_market_date_uc'),
    )


class DailyAssetSnapshot(Base):
    __tablename__ = "daily_asset_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    version = Column(String(100), nullable=False, default="v1")
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    snapshot_date = Column(DATE, nullable=False)
    cash_usd = Column(DECIMAL(18, 2), nullable=False, default=0)
    cash_hkd = Column(DECIMAL(18, 2), nullable=False, default=0)
    cash_cny = Column(DECIMAL(18, 2), nullable=False, default=0)
    positions_usd = Column(DECIMAL(18, 2), nullable=False, default=0)
    positions_hkd = Column(DECIMAL(18, 2), nullable=False, default=0)
    positions_cny = Column(DECIMAL(18, 2), nullable=False, default=0)
    total_assets_usd = Column(DECIMAL(18, 2), nullable=False, default=0)
    created_at = Column(TIMESTAMP, server_default=func.current_timestamp())
    updated_at = Column(
        TIMESTAMP, server_default=func.current_timestamp(), onupdate=func.current_timestamp()
    )

    user = relationship("User", back_populates="asset_snapshots")

    __table_args__ = (
        UniqueConstraint('user_id', 'snapshot_date', name='_user_snapshot_uc'),
    )
