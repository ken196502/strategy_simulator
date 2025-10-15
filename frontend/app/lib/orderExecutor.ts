// 前端订单执行器 - 模拟交易逻辑
import type { Overview } from '@/types/overview'
import type { Position, Order, Trade } from '@/components/trading/PositionsOrdersTrades'
import { marketToCurrency } from './trading'
import { marketDataService } from './marketData'

interface OrderPayload {
  symbol: string
  side: 'buy' | 'sell'
  quantity: number
  price: number
  order_type: 'limit' | 'market'
  market: 'US' | 'HK' | 'CN'
}

// 生成唯一订单号
const generateOrderNo = (): string => {
  return `ORD${Date.now()}${Math.random().toString(36).substr(2, 9).toUpperCase()}`
}

// 计算佣金（简化版本）
const calculateCommission = (price: number, quantity: number, market: string): number => {
  const value = price * quantity
  if (market === 'US') {
    return Math.max(1, value * 0.003) // 美股 0.3%，最低 $1
  }
  if (market === 'HK') {
    return Math.max(5, value * 0.0005) // 港股 0.05%，最低 HKD 5
  }
  return Math.max(5, value * 0.0003) // A股 0.03%，最低 CNY 5
}

// 下单逻辑
export const executePlaceOrder = (
  payload: OrderPayload,
  overview: Overview,
  positions: Position[],
  orders: Order[],
  trades: Trade[]
): {
  overview: Overview
  positions: Position[]
  orders: Order[]
  trades: Trade[]
  success: boolean
  message?: string
} => {
  const { symbol, side, quantity, price, order_type, market } = payload

  // 验证输入
  if (!symbol || !side || quantity <= 0 || price <= 0) {
    return {
      overview,
      positions,
      orders,
      trades,
      success: false,
      message: '订单参数无效',
    }
  }

  const currency = marketToCurrency[market]
  const balance = overview.balances_by_currency[currency]

  if (!balance) {
    return {
      overview,
      positions,
      orders,
      trades,
      success: false,
      message: '未找到对应货币余额',
    }
  }

  const orderNo = generateOrderNo()
  const commission = calculateCommission(price, quantity, market)
  const totalCost = price * quantity + commission

  // 买入：检查余额
  if (side === 'buy') {
    if (balance.current_cash < totalCost) {
      return {
        overview,
        positions,
        orders,
        trades,
        success: false,
        message: '余额不足',
      }
    }
  }

  // 卖出：检查持仓
  if (side === 'sell') {
    const position = positions.find(p => p.symbol === symbol)
    if (!position || position.quantity < quantity) {
      return {
        overview,
        positions,
        orders,
        trades,
        success: false,
        message: '持仓不足',
      }
    }
  }

  // 创建订单
  const newOrder: Order = {
    id: orders.length + 1,
    order_no: orderNo,
    symbol,
    side,
    quantity,
    price,
    filled_quantity: 0,
    order_type,
    status: 'pending',
    market,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  // 更新冻结资金/持仓
  const newOverview = { ...overview }
  const newBalances = { ...newOverview.balances_by_currency }
  newBalances[currency] = { ...balance }

  if (side === 'buy') {
    newBalances[currency].current_cash -= totalCost
    newBalances[currency].frozen_cash += totalCost
  }

  newOverview.balances_by_currency = newBalances

  // 更新用户字段
  if (currency === 'usd') {
    newOverview.user.current_cash_usd = newBalances.usd.current_cash
    newOverview.user.frozen_cash_usd = newBalances.usd.frozen_cash
  } else if (currency === 'hkd') {
    newOverview.user.current_cash_hkd = newBalances.hkd.current_cash
    newOverview.user.frozen_cash_hkd = newBalances.hkd.frozen_cash
  } else if (currency === 'cny') {
    newOverview.user.current_cash_cny = newBalances.cny.current_cash
    newOverview.user.frozen_cash_cny = newBalances.cny.frozen_cash
  }

  return {
    overview: newOverview,
    positions,
    orders: [...orders, newOrder],
    trades,
    success: true,
    message: `订单 ${orderNo} 已提交`,
  }
}

// 检查订单是否满足成交条件
export const checkOrderCanFill = (order: Order): boolean => {
  if (order.status !== 'pending') {
    return false
  }

  // 获取当前行情
  const quote = marketDataService.getQuote(order.symbol)
  if (!quote) {
    return false // 没有行情数据，不能成交
  }

  // 校验行情日期是否为当天（按UTC时间）
  const currentDateUTC = new Date().toISOString().split('T')[0]
  const quoteDateUTC = new Date(quote.timestamp).toISOString().split('T')[0]
  if (quoteDateUTC !== currentDateUTC) {
    console.warn(`[checkOrderCanFill] Quote date mismatch for ${order.symbol}: quote date ${quoteDateUTC} vs current UTC date ${currentDateUTC}`)
    return false // 行情不是当天的，不能成交
  }

  // 市价单：有行情就可以成交
  const orderType = order.order_type.toLowerCase()
  if (orderType === 'market') {
    return true
  }

  // 限价单：检查价格条件
  if (orderType === 'limit') {
    const side = order.side.toLowerCase()
    if (side === 'buy') {
      // 买入：委托价 >= 当前市价时成交
      return order.price >= quote.current_price
    } else {
      // 卖出：委托价 <= 当前市价时成交
      return order.price <= quote.current_price
    }
  }

  return false
}

// 成交订单
export const executeFillOrder = (
  orderNo: string,
  overview: Overview,
  positions: Position[],
  orders: Order[],
  trades: Trade[]
): {
  overview: Overview
  positions: Position[]
  orders: Order[]
  trades: Trade[]
  filled: boolean
} => {
  const order = orders.find(o => o.order_no === orderNo)
  if (!order || order.status !== 'pending') {
    return { overview, positions, orders, trades, filled: false }
  }

  // 检查是否满足成交条件
  if (!checkOrderCanFill(order)) {
    return { overview, positions, orders, trades, filled: false }
  }

  // 获取实际成交价格（使用当前市价）
  const quote = marketDataService.getQuote(order.symbol)
  if (!quote) {
    return { overview, positions, orders, trades, filled: false }
  }

  // 校验行情日期是否为当天（按UTC时间）
  const currentDateUTC = new Date().toISOString().split('T')[0]
  const quoteDateUTC = new Date(quote.timestamp).toISOString().split('T')[0]
  if (quoteDateUTC !== currentDateUTC) {
    console.warn(`[executeFillOrder] Quote date mismatch for ${order.symbol}: quote date ${quoteDateUTC} vs current UTC date ${currentDateUTC}`)
    return { overview, positions, orders, trades, filled: false }
  }

  const fillPrice = order.order_type.toLowerCase() === 'market' ? quote.current_price : order.price
  const currency = marketToCurrency[order.market]
  const commission = calculateCommission(fillPrice, order.quantity, order.market)
  const totalValue = fillPrice * order.quantity

  // 更新订单状态
  const newOrders = orders.map(o =>
    o.order_no === orderNo
      ? {
          ...o,
          status: 'filled' as const,
          filled_quantity: o.quantity,
          updated_at: new Date().toISOString(),
        }
      : o
  )

  // 创建成交记录（使用实际成交价）
  const newTrade: Trade = {
    id: trades.length + 1,
    order_no: orderNo,
    symbol: order.symbol,
    side: order.side,
    quantity: order.quantity,
    price: fillPrice,
    commission,
    market: order.market,
    executed_at: new Date().toISOString(),
  }

  // 更新资金和持仓
  const newOverview = { ...overview }
  const newBalances = { ...newOverview.balances_by_currency }
  newBalances[currency] = { ...newBalances[currency] }

  let newPositions = [...positions]

  if (order.side.toLowerCase() === 'buy') {
    // 买入：解冻资金，增加持仓
    newBalances[currency].frozen_cash -= totalValue + commission

    const existingPos = newPositions.find(p => p.symbol === order.symbol)
    if (existingPos) {
      newPositions = newPositions.map(p =>
        p.symbol === order.symbol
          ? {
              ...p,
              quantity: p.quantity + order.quantity,
              avg_cost: (p.avg_cost * p.quantity + totalValue) / (p.quantity + order.quantity),
              updated_at: new Date().toISOString(),
            }
          : p
      )
    } else {
      newPositions.push({
        id: positions.length + 1,
        symbol: order.symbol,
        quantity: order.quantity,
        avg_cost: fillPrice,
        current_price: fillPrice,
        market_value: totalValue,
        pnl: 0,
        pnl_percent: 0,
        market: order.market,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
    }
  } else {
    // 卖出：增加资金，减少持仓
    newBalances[currency].current_cash += totalValue - commission

    newPositions = newPositions
      .map(p =>
        p.symbol === order.symbol
          ? {
              ...p,
              quantity: p.quantity - order.quantity,
              updated_at: new Date().toISOString(),
            }
          : p
      )
      .filter(p => p.quantity > 0)
  }

  newOverview.balances_by_currency = newBalances

  // 更新用户字段
  if (currency === 'usd') {
    newOverview.user.current_cash_usd = newBalances.usd.current_cash
    newOverview.user.frozen_cash_usd = newBalances.usd.frozen_cash
  } else if (currency === 'hkd') {
    newOverview.user.current_cash_hkd = newBalances.hkd.current_cash
    newOverview.user.frozen_cash_hkd = newBalances.hkd.frozen_cash
  } else if (currency === 'cny') {
    newOverview.user.current_cash_cny = newBalances.cny.current_cash
    newOverview.user.frozen_cash_cny = newBalances.cny.frozen_cash
  }

  return {
    overview: newOverview,
    positions: newPositions,
    orders: newOrders,
    trades: [...trades, newTrade],
    filled: true,
  }
}

// 批量检查所有待成交订单
export const checkAndFillOrders = (
  overview: Overview,
  positions: Position[],
  orders: Order[],
  trades: Trade[]
): {
  overview: Overview
  positions: Position[]
  orders: Order[]
  trades: Trade[]
  filledCount: number
} => {
  let currentOverview = overview
  let currentPositions = positions
  let currentOrders = orders
  let currentTrades = trades
  let filledCount = 0

  // 找出所有待成交订单
  const pendingOrders = orders.filter(o => o.status === 'pending')

  for (const order of pendingOrders) {
    const result = executeFillOrder(
      order.order_no,
      currentOverview,
      currentPositions,
      currentOrders,
      currentTrades
    )
    
    if (result.filled) {
      console.log(`✅ 订单成交: ${order.symbol} ${order.side} ${order.quantity}股 @ ${order.price}`)
      currentOverview = result.overview
      currentPositions = result.positions
      currentOrders = result.orders
      currentTrades = result.trades
      filledCount++
    }
  }

  return {
    overview: currentOverview,
    positions: currentPositions,
    orders: currentOrders,
    trades: currentTrades,
    filledCount,
  }
}

// 取消订单
export const executeCancelOrder = (
  orderNo: string,
  overview: Overview,
  positions: Position[],
  orders: Order[],
  trades: Trade[]
): {
  overview: Overview
  positions: Position[]
  orders: Order[]
  trades: Trade[]
  success: boolean
  message?: string
} => {
  const order = orders.find(o => o.order_no === orderNo)
  if (!order) {
    return {
      overview,
      positions,
      orders,
      trades,
      success: false,
      message: '订单不存在',
    }
  }

  if (order.status !== 'pending') {
    return {
      overview,
      positions,
      orders,
      trades,
      success: false,
      message: '订单无法取消',
    }
  }

  // 更新订单状态
  const newOrders = orders.map(o =>
    o.order_no === orderNo
      ? {
          ...o,
          status: 'cancelled' as const,
          updated_at: new Date().toISOString(),
        }
      : o
  )

  // 解冻资金（仅买单）
  const newOverview = { ...overview }
  if (order.side === 'buy') {
    const currency = marketToCurrency[order.market]
    const commission = calculateCommission(order.price, order.quantity, order.market)
    const totalCost = order.price * order.quantity + commission

    const newBalances = { ...newOverview.balances_by_currency }
    newBalances[currency] = { ...newBalances[currency] }
    newBalances[currency].current_cash += totalCost
    newBalances[currency].frozen_cash -= totalCost
    newOverview.balances_by_currency = newBalances

    // 更新用户字段
    if (currency === 'usd') {
      newOverview.user.current_cash_usd = newBalances.usd.current_cash
      newOverview.user.frozen_cash_usd = newBalances.usd.frozen_cash
    } else if (currency === 'hkd') {
      newOverview.user.current_cash_hkd = newBalances.hkd.current_cash
      newOverview.user.frozen_cash_hkd = newBalances.hkd.frozen_cash
    } else if (currency === 'cny') {
      newOverview.user.current_cash_cny = newBalances.cny.current_cash
      newOverview.user.frozen_cash_cny = newBalances.cny.frozen_cash
    }
  }

  return {
    overview: newOverview,
    positions,
    orders: newOrders,
    trades,
    success: true,
    message: `订单 ${orderNo} 已取消`,
  }
}
