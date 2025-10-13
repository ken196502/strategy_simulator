"""
Order lifecycle service implementing proper order placement, execution, and cancellation.
Follows the specification for cash freezing, position checks, and commission calculations.
"""
import uuid
from decimal import Decimal
from sqlalchemy.orm import Session
from typing import Optional

from database.models import Order, Position, TradingConfig, Trade, User
from services.market_data import get_last_price
from services.hk_stock_info import get_hk_stock_info, get_hk_trade_unit


def _get_config(db: Session, market: str) -> TradingConfig:
    """Get trading configuration for the specified market."""
    cfg = db.query(TradingConfig).filter(TradingConfig.market == market).first()
    if not cfg:
        raise ValueError(f"No trading config for market {market}")
    return cfg


def _calc_commission(cfg: TradingConfig, notional: Decimal) -> Decimal:
    """Calculate commission: max(commission_rate × notional, min_commission)."""
    pct_fee = notional * Decimal(str(cfg.commission_rate))
    min_fee = Decimal(str(cfg.min_commission))
    return max(pct_fee, min_fee)


def _get_user_cash_fields(user: User, market: str):
    """Get the appropriate cash fields for the market currency."""
    if market == "US":
        return user.current_cash_usd, user.frozen_cash_usd, "usd"
    elif market == "HK":
        return user.current_cash_hkd, user.frozen_cash_hkd, "hkd"
    elif market == "CN":
        return user.current_cash_cny, user.frozen_cash_cny, "cny"
    else:
        raise ValueError(f"Unsupported market: {market}")


def _update_user_cash(user: User, market: str, new_cash: Decimal, new_frozen: Optional[Decimal] = None):
    """Update user cash fields for the specified market."""
    if market == "US":
        user.current_cash_usd = new_cash
        if new_frozen is not None:
            user.frozen_cash_usd = new_frozen
    elif market == "HK":
        user.current_cash_hkd = new_cash
        if new_frozen is not None:
            user.frozen_cash_hkd = new_frozen
    elif market == "CN":
        user.current_cash_cny = new_cash
        if new_frozen is not None:
            user.frozen_cash_cny = new_frozen
    else:
        raise ValueError(f"Unsupported market: {market}")


def place_order(db: Session, user: User, symbol: str, name: str, market: str, 
                side: str, order_type: str, price: Optional[float], quantity: int) -> Order:
    """
    Place an order with proper validation and cash freezing.
    
    For BUY orders: Freezes estimated cash (notional + commission)
    For SELL orders: Validates available position
    
    Returns order with status=PENDING for later execution.
    """
    cfg = _get_config(db, market)

    # Market validation is handled by _get_config() - it will raise an error if market config doesn't exist
    resolved_symbol = symbol
    resolved_name = name or symbol

    # Validate quantity based on market
    if market == "HK":
        stock_info = get_hk_stock_info(symbol)
        resolved_symbol = stock_info.get("symbol", symbol)
        resolved_name = stock_info.get("name") or resolved_name

        # 对于港股，使用动态获取的手数
        actual_trade_unit = stock_info.get("trade_unit") or get_hk_trade_unit(resolved_symbol)
        if quantity % actual_trade_unit != 0:
            raise ValueError(f"港股 {resolved_symbol} 每手 {actual_trade_unit} 股，数量必须是 {actual_trade_unit} 的倍数")
        if quantity < actual_trade_unit:
            raise ValueError(f"港股 {resolved_symbol} 最少买入 1 手（{actual_trade_unit} 股）")
    else:
        # 其他市场使用配置中的lot_size
        if quantity % int(cfg.lot_size) != 0:
            raise ValueError(f"Quantity must be a multiple of lot_size={cfg.lot_size}")
        if quantity < int(cfg.min_order_quantity):
            raise ValueError(f"Quantity must be >= min_order_quantity={cfg.min_order_quantity}")
    
    # Get market price for estimation
    try:
        market_price = Decimal(str(get_last_price(resolved_symbol, market)))
    except Exception as e:
        raise ValueError(f"Unable to get market price for {resolved_symbol}: {e}")
    
    # Calculate reference price for cash estimation
    ref_price = market_price
    if order_type == "LIMIT" and price is not None:
        limit_price = Decimal(str(price))
        if side == "BUY":
            # For BUY LIMIT, use limit price (user willing to pay up to this amount)
            ref_price = limit_price
        else:
            # For SELL LIMIT, use min of limit and market for conservative estimation
            ref_price = min(limit_price, market_price)
    
    current_cash, frozen_cash, currency = _get_user_cash_fields(user, market)
    
    if side == "BUY":
        # Freeze cash for BUY orders
        estimated_notional = ref_price * Decimal(quantity)
        estimated_commission = _calc_commission(cfg, estimated_notional)
        cash_needed = estimated_notional + estimated_commission
        
        if Decimal(str(current_cash)) < cash_needed:
            raise ValueError(f"Insufficient {currency.upper()} cash: need {cash_needed}, have {current_cash}")
        
        # Update frozen cash
        new_frozen = Decimal(str(frozen_cash)) + cash_needed
        _update_user_cash(user, market, current_cash, new_frozen)
        
    elif side == "SELL":
        # Validate available position for SELL orders
        pos = (
            db.query(Position)
            .filter(Position.user_id == user.id, Position.symbol == resolved_symbol, Position.market == market)
            .first()
        )
        if not pos or int(pos.available_quantity) < quantity:
            available = pos.available_quantity if pos else 0
            raise ValueError(f"Insufficient position to sell: need {quantity}, have {available}")
    else:
        raise ValueError("Side must be BUY or SELL")
    
    # Create order with PENDING status
    order = Order(
        version="v1",
        user_id=user.id,
        order_no=uuid.uuid4().hex[:16],
        symbol=resolved_symbol,
        name=resolved_name,
        market=market,
        side=side,
        order_type=order_type,
        price=float(price) if price is not None else None,
        quantity=quantity,
        filled_quantity=0,
        status="PENDING",
    )
    
    db.add(order)
    db.commit()
    db.refresh(order)
    
    return order


def execute_order(db: Session, order: Order) -> bool:
    """
    Try to execute a pending order.
    
    Returns True if order was executed, False if conditions not met.
    Updates order status to FILLED on successful execution.
    """
    if order.status != "PENDING":
        return False
    
    try:
        latest_price = Decimal(str(get_last_price(order.symbol, order.market)))
    except Exception:
        return False

    execution_price = latest_price
    order_price = (
        Decimal(str(order.price))
        if order.price is not None
        else execution_price
    )

    cfg = _get_config(db, order.market)
    user = db.query(User).filter(User.id == order.user_id).first()
    if not user:
        return False

    current_cash, frozen_cash, currency = _get_user_cash_fields(user, order.market)

    position: Optional[Position] = None

    if order.side == "BUY":
        if order_price < execution_price:
            return False
        order_amount = order_price * Decimal(order.quantity)
        if order_amount > Decimal(str(current_cash)):
            return False
    elif order.side == "SELL":
        position = (
            db.query(Position)
            .filter(
                Position.user_id == order.user_id,
                Position.symbol == order.symbol,
                Position.market == order.market,
            )
            .first()
        )
        if not position or int(position.available_quantity) < order.quantity:
            return False
        if order_price > execution_price:
            return False
    else:
        return False

    notional = execution_price * Decimal(order.quantity)
    commission = _calc_commission(cfg, notional)

    if order.side == "BUY":
        # Execute BUY order
        total_cost = notional + commission
        
        # Deduct from current cash
        new_cash = Decimal(str(current_cash)) - total_cost

        if new_cash < 0:
            return False
        
        # Release frozen cash (conservatively)
        if order.price is not None:
            # For LIMIT orders, release based on original frozen amount
            ref_price = max(Decimal(str(order.price)), execution_price)
        else:
            # For MARKET orders, use execution price
            ref_price = execution_price
        
        estimated_frozen = (ref_price * Decimal(order.quantity)) + _calc_commission(cfg, ref_price * Decimal(order.quantity))
        release_amount = min(estimated_frozen, Decimal(str(frozen_cash)))
        new_frozen = max(Decimal(str(frozen_cash)) - release_amount, Decimal('0'))
        
        _update_user_cash(user, order.market, new_cash, new_frozen)
        
        # Update or create position
        pos = (
            db.query(Position)
            .filter(Position.user_id == order.user_id, Position.symbol == order.symbol, Position.market == order.market)
            .first()
        )
        if not pos:
            pos = Position(
                version="v1",
                user_id=order.user_id,
                symbol=order.symbol,
                name=order.name,
                market=order.market,
                quantity=0,
                available_quantity=0,
                avg_cost=0,
            )
            db.add(pos)
            db.flush()
        
        # Update position with new average cost
        old_qty = Decimal(int(pos.quantity))
        old_cost = Decimal(str(pos.avg_cost))
        new_qty = old_qty + Decimal(order.quantity)
        
        if old_qty == 0:
            new_avg_cost = execution_price
        else:
            new_avg_cost = (old_cost * old_qty + notional) / new_qty
        
        pos.quantity = int(new_qty)
        pos.available_quantity = int(pos.available_quantity) + order.quantity
        pos.avg_cost = float(new_avg_cost)
        
    elif order.side == "SELL":
        # Execute SELL order
        pos = position
        assert pos is not None
        
        # Update position
        pos.quantity = int(pos.quantity) - order.quantity
        pos.available_quantity = int(pos.available_quantity) - order.quantity
        
        # Add cash gain
        cash_gain = notional - commission
        new_cash = Decimal(str(current_cash)) + cash_gain
        _update_user_cash(user, order.market, new_cash)
    
    # Create trade record
    trade = Trade(
        order_id=order.id,
        user_id=order.user_id,
        symbol=order.symbol,
        name=order.name,
        market=order.market,
        side=order.side,
        price=float(execution_price),
        quantity=order.quantity,
        commission=float(commission),
        exchange_rate=1.0,
    )
    db.add(trade)
    
    # Update order status
    order.filled_quantity = order.quantity
    order.status = "FILLED"
    
    db.commit()
    return True


def cancel_order(db: Session, order_no: str, user_id: int) -> bool:
    """
    Cancel a pending order and release frozen funds if applicable.
    
    Returns True if order was cancelled, False if not found or not cancellable.
    """
    order = db.query(Order).filter(
        Order.order_no == order_no,
        Order.user_id == user_id,
        Order.status == "PENDING"
    ).first()
    
    if not order:
        return False
    
    if order.side == "BUY":
        # Release frozen cash for BUY orders
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            try:
                # Get market price for release calculation
                market_price = Decimal(str(get_last_price(order.symbol, order.market)))
                
                # Calculate reference price (same logic as placement)
                ref_price = market_price
                if order.order_type == "LIMIT" and order.price is not None:
                    limit_price = Decimal(str(order.price))
                    if order.side == "BUY":
                        ref_price = limit_price
                    else:
                        ref_price = min(limit_price, market_price)
                
                cfg = _get_config(db, order.market)
                release_notional = ref_price * Decimal(order.quantity)
                release_commission = _calc_commission(cfg, release_notional)
                release_amount = release_notional + release_commission
                
                current_cash, frozen_cash, currency = _get_user_cash_fields(user, order.market)
                new_frozen = max(Decimal(str(frozen_cash)) - release_amount, Decimal('0'))
                _update_user_cash(user, order.market, current_cash, new_frozen)
                
            except Exception:
                # If we can't calculate release amount, be conservative and don't release
                pass
    
    # Update order status
    order.status = "CANCELLED"
    
    db.commit()
    return True


def get_pending_orders(db: Session) -> list[Order]:
    """Get all pending orders for execution monitoring."""
    return db.query(Order).filter(Order.status == "PENDING").all()