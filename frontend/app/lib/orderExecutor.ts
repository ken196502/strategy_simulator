// 前端订单执行器 - 模拟交易逻辑
import type { Overview } from '@/types/overview'
import type { Position, Order, Trade } from '@/components/trading/PositionsOrdersTrades'
import { marketToCurrency } from './trading'
import { marketDataService } from './marketData'

interface OrderPayload {
  symbol: string
  side: 'BUY' | 'SELL'
  quantity: number
  price?: number
  order_type: 'LIMIT' | 'MARKET'
  market: 'US' | 'HK' | 'CN'
  currency: string
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
  console.log('🔧 [DEBUG] executePlaceOrder called with:')
  console.log('  - Payload:', payload)
  console.log('  - Current orders count:', orders.length)
  
  const { symbol, side, quantity, price, order_type, market } = payload

  // 验证输入
  if (!symbol || !side || quantity <= 0) {
    return {
      overview,
      positions,
      orders,
      trades,
      success: false,
      message: '订单参数无效',
    }
  }

  // 限价单需要价格，市价单不需要
  if (order_type === 'LIMIT' && (!price || price <= 0)) {
    return {
      overview,
      positions,
      orders,
      trades,
      success: false,
      message: '限价单需要设置价格',
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
  
  // 市价单需要用当前市价估算冻结金额
  let orderPrice = price || 0
  if (order_type === 'MARKET' && !price) {
    const quote = marketDataService.getQuote(symbol)
    if (quote) {
      orderPrice = quote.current_price
      console.log(`📊 [下单] 市价单使用当前行情: ${symbol} = ${orderPrice}`)
    } else {
      console.warn(`⚠️ [下单] 市价单没有行情数据: ${symbol}`)
    }
  }
  
  const commission = calculateCommission(orderPrice, quantity, market)
  const totalCost = orderPrice * quantity + commission
  
  console.log(`💵 [下单] ${symbol} ${side} ${order_type} - 委托价: ${price || 'N/A'}, 冻结价: ${orderPrice}, 数量: ${quantity}, 冻结总额: ${totalCost.toFixed(2)}`)

  // 买入：检查余额
  if (side === 'BUY') {
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
  if (side === 'SELL') {
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
    name: symbol, // 添加name字段，使用symbol作为默认值
    side,
    quantity,
    price: orderPrice,
    filled_quantity: 0,
    order_type,
    status: 'pending',
    market,
  }

  // 更新冻结资金/持仓
  const newOverview = { ...overview }
  const newBalances = { ...newOverview.balances_by_currency }
  newBalances[currency] = { ...balance }

  if (side === 'BUY') {
    // 冻结资金
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
    console.log(`❌ [checkOrderCanFill] 没有行情数据: ${order.symbol}`)
    return false // 没有行情数据，不能成交
  }

  console.log(`📊 [checkOrderCanFill] 行情数据: ${order.symbol} = $${quote.current_price}`)

  // 市价单：有行情就可以成交
  const orderType = order.order_type.toUpperCase()
  if (orderType === 'MARKET') {
    console.log(`✅ [checkOrderCanFill] 市价单可以成交: ${order.symbol}`)
    return true
  }

  // 限价单：检查价格条件
  if (orderType === 'LIMIT') {
    const side = order.side.toUpperCase()
    if (side === 'BUY') {
      // 买入：委托价 >= 当前市价时成交
      const canFill = order.price! >= quote.current_price
      console.log(`[checkOrderCanFill] 限价买单: ${order.symbol} 委托价=${order.price} 市价=${quote.current_price} ${canFill ? '✅可成交' : '❌不可成交'}`)
      return canFill
    } else {
      // 卖出：委托价 <= 当前市价时成交
      const canFill = order.price! <= quote.current_price
      console.log(`[checkOrderCanFill] 限价卖单: ${order.symbol} 委托价=${order.price} 市价=${quote.current_price} ${canFill ? '✅可成交' : '❌不可成交'}`)
      return canFill
    }
  }

  console.warn(`[checkOrderCanFill] 未知订单类型: ${order.order_type}`)
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

  // 重要：限价单也按市价成交，因为限价单只是保护价，实际成交以市价为准
  // 买入限价单：委托价 >= 市价时，以市价成交（获得更优价格）
  // 卖出限价单：委托价 <= 市价时，以市价成交（获得更优价格）
  const fillPrice = quote.current_price
  
  console.log(`💰 [executeFillOrder] ${order.symbol} ${order.side} ${order.order_type} - 委托价: ${order.price || 'N/A'}, 成交价: ${fillPrice}`)
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
        }
      : o
  )

  // 创建成交记录（使用实际成交价）
  const newTrade: Trade = {
    id: trades.length + 1,
    order_id: order.id,
    user_id: 1, // 模拟用户ID
    symbol: order.symbol,
    name: order.name,
    market: order.market,
    side: order.side,
    price: fillPrice,
    quantity: order.quantity,
    commission,
    exchange_rate: 1, // 简化汇率处理
    trade_time: new Date().toISOString(),
  }

  // 更新资金和持仓
  const newOverview = { ...overview }
  const newBalances = { ...newOverview.balances_by_currency }
  newBalances[currency] = { ...newBalances[currency] }

  let newPositions = [...positions]

  if (order.side.toUpperCase() === 'BUY') {
    // 买入：解冻订单金额，扣除成交金额+佣金
    const orderPrice = order.price || fillPrice
    const frozenAmount = orderPrice * order.quantity + calculateCommission(orderPrice, order.quantity, order.market)
    
    console.log(`💰 [BUY 成交前] ${currency.toUpperCase()} - 可用: ${newBalances[currency].current_cash.toFixed(2)}, 冻结: ${newBalances[currency].frozen_cash.toFixed(2)}`)
    console.log(`  委托价: ${orderPrice}, 成交价: ${fillPrice}, 数量: ${order.quantity}`)
    console.log(`  冻结金额: ${frozenAmount.toFixed(2)}, 成交金额: ${totalValue.toFixed(2)}, 佣金: ${commission.toFixed(2)}`)
    
    // 解冻
    newBalances[currency].frozen_cash -= frozenAmount
    newBalances[currency].current_cash += frozenAmount
    
    // 扣除成交金额+佣金
    newBalances[currency].current_cash -= (totalValue + commission)
    
    console.log(`💰 [BUY 成交后] ${currency.toUpperCase()} - 可用: ${newBalances[currency].current_cash.toFixed(2)}, 冻结: ${newBalances[currency].frozen_cash.toFixed(2)}`)

    const existingPos = newPositions.find(p => p.symbol === order.symbol)
    if (existingPos) {
      // 更新现有持仓
      const newQuantity = existingPos.quantity + order.quantity
      const newAvgCost = (existingPos.avg_cost * existingPos.quantity + totalValue) / newQuantity
      
      newPositions = newPositions.map(p =>
        p.symbol === order.symbol
          ? {
              ...p,
              quantity: newQuantity,
              avg_cost: newAvgCost,
              current_price: fillPrice,
              market_value: fillPrice * newQuantity,
              pnl: (fillPrice - newAvgCost) * newQuantity,
              pnl_percent: ((fillPrice - newAvgCost) / newAvgCost) * 100,
              updated_at: new Date().toISOString(),
            }
          : p
      )
      console.log(`📊 [BUY] 更新持仓: ${order.symbol}, 数量: ${existingPos.quantity} → ${newQuantity}, 成本: ${existingPos.avg_cost.toFixed(2)} → ${newAvgCost.toFixed(2)}`)
    } else {
      // 创建新持仓
      const newPosition: Position = {
        id: positions.length + 1,
        symbol: order.symbol,
        name: order.name || order.symbol,  // 添加 name 字段
        market: order.market,
        quantity: order.quantity,
        avg_cost: fillPrice,
        current_price: fillPrice,
        market_value: totalValue,
        pnl: 0,
        pnl_percent: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      newPositions.push(newPosition)
      console.log(`📊 [BUY] 新建持仓: ${order.symbol}, 数量: ${order.quantity}, 成本: ${fillPrice.toFixed(2)}`)
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
              market_value: fillPrice * (p.quantity - order.quantity),
              pnl: (fillPrice - p.avg_cost) * (p.quantity - order.quantity),
              pnl_percent: p.quantity - order.quantity > 0 ? ((fillPrice - p.avg_cost) / p.avg_cost) * 100 : 0,
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
  
  console.log(`🔍 [checkAndFillOrders] 检查订单撮合: ${pendingOrders.length} 个待成交订单`)

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
  if (order.side === 'BUY') {
    const currency = marketToCurrency[order.market]
    const orderPrice = order.price || 0
    const commission = calculateCommission(orderPrice, order.quantity, order.market)
    const totalCost = orderPrice * order.quantity + commission

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
