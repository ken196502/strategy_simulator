from sqlalchemy import Column, Integer, String, DECIMAL, TIMESTAMP, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from .connection import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    version = Column(String(100), nullable=False, default="v1")
    username = Column(String(50), unique=True, nullable=False)
    initial_capital = Column(DECIMAL(18, 2), nullable=False, default=100000.00)
    current_cash = Column(DECIMAL(18, 2), nullable=False, default=100000.00)
    frozen_cash = Column(DECIMAL(18, 2), nullable=False, default=0.00)
    created_at = Column(TIMESTAMP, server_default=func.current_timestamp())
    updated_at = Column(
        TIMESTAMP, server_default=func.current_timestamp(), onupdate=func.current_timestamp()
    )

    positions = relationship("Position", back_populates="user")
    orders = relationship("Order", back_populates="user")


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
