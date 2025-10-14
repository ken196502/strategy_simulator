import { randomUUID } from 'node:crypto'
import {
  getState,
  marketToCurrency,
  resetState,
  type OrderState,
  type PositionState,
  type TradeState,
  type OrderSide,
  type OrderType,
  type CurrencyKey,
  getOverview,
  listOrders,
  listPositions,
  listTrades,
} from './state'
import { getLatestPrice, type MarketType } from './xueqiu'

export class OrderError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OrderError'
  }
}

export interface PlaceOrderInput {
  symbol: string
  name?: string
  market: string
  side: OrderSide
  order_type: OrderType
  price?: number | null
  quantity: number
}

const generateOrderNo = () => randomUUID().replace(/-/g, '').slice(0, 16)

const normalizeMarket = (market: string): MarketType => {
  const normalized = market?.toUpperCase()
  if (normalized !== 'US' && normalized !== 'HK' && normalized !== 'CN') {
    throw new OrderError(`Unsupported market: ${market}`)
  }
  return normalized
}

const normalizeSymbol = (symbol: string) => {
  if (!symbol) {
    throw new OrderError('Symbol is required')
  }
  return symbol.toUpperCase().trim()
}

const toPositiveInteger = (value: unknown, field: string) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw new OrderError(`${field} must be a positive integer`)
  }
  return value
}

const roundMoney = (value: number, decimals = 6) => Number(value.toFixed(decimals))

const getCashKeys = (market: MarketType) => {
  const currency = marketToCurrency[market]
  const currentKey = `current_cash_${currency}` as const
  const frozenKey = `frozen_cash_${currency}` as const
  return { currency, currentKey, frozenKey }
}

const calcCommission = (config: { minCommission: number; commissionRate: number }, notional: number) => {
  const pctFee = notional * config.commissionRate
  return Math.max(pctFee, config.minCommission)
}

const ensurePosition = (state: ReturnType<typeof getState>, symbol: string, name: string, market: MarketType) => {
  const existing = state.positions.find((pos) => pos.symbol === symbol && pos.market === market)
  if (existing) {
    return existing
  }
  const position: PositionState = {
    id: state.nextIds.position++,
    symbol,
    name,
    market,
    quantity: 0,
    availableQuantity: 0,
    avgCost: 0,
    lastPrice: undefined,
    marketValue: undefined,
  }
  state.positions.push(position)
  return position
}

export const placeOrder = async (input: PlaceOrderInput): Promise<OrderState> => {
  const state = getState()

  const symbol = normalizeSymbol(input.symbol)
  const name = input.name?.trim() || symbol
  const market = normalizeMarket(input.market)
  const side = input.side
  const orderType = input.order_type
  const quantity = toPositiveInteger(input.quantity, 'quantity')

  const config = state.tradingConfigs[market]
  if (!config) {
    throw new OrderError(`No trading config for market ${market}`)
  }

  if (quantity % config.lotSize !== 0) {
    throw new OrderError(`Quantity must be a multiple of lot size ${config.lotSize}`)
  }

  if (quantity < config.minOrderQuantity) {
    throw new OrderError(`Quantity must be at least ${config.minOrderQuantity}`)
  }

  let marketPrice: number
  console.log(`[placeOrder] Getting market price for ${symbol} (${market})`)
  try {
    marketPrice = await getLatestPrice(symbol, market)
    console.log(`[placeOrder] Got market price for ${symbol}: ${marketPrice}`)
  } catch (error) {
    console.error(`[placeOrder] Failed to get market price for ${symbol}:`, error)
    throw new OrderError(`Unable to get market price for ${symbol}: ${(error as Error).message}`)
  }

  let refPrice = marketPrice
  if (orderType === 'LIMIT' && input.price != null) {
    const limitPrice = Number(input.price)
    if (!Number.isFinite(limitPrice) || limitPrice <= 0) {
      throw new OrderError('Limit price must be a positive number')
    }
    if (side === 'BUY') {
      refPrice = limitPrice
    } else {
      refPrice = Math.min(limitPrice, marketPrice)
    }
  }

  const { currency, currentKey, frozenKey } = getCashKeys(market)
  const currentCash = state.user[currentKey]
  const frozenCash = state.user[frozenKey]

  if (side === 'BUY') {
    const estimatedNotional = refPrice * quantity
    const estimatedCommission = calcCommission(config, estimatedNotional)
    const cashNeeded = estimatedNotional + estimatedCommission

    if (currentCash < cashNeeded) {
      throw new OrderError(`Insufficient ${currency.toUpperCase()} cash: need ${cashNeeded.toFixed(2)}, have ${currentCash.toFixed(2)}`)
    }

    state.user[frozenKey] = roundMoney(frozenCash + cashNeeded)
  } else if (side === 'SELL') {
    const position = state.positions.find((pos) => pos.symbol === symbol && pos.market === market)
    const available = position?.availableQuantity ?? 0
    if (!position || available < quantity) {
      throw new OrderError(`Insufficient position to sell: need ${quantity}, have ${available}`)
    }
  } else {
    throw new OrderError('Side must be BUY or SELL')
  }

  const now = new Date().toISOString()
  const order: OrderState = {
    id: state.nextIds.order++,
    orderNo: generateOrderNo(),
    symbol,
    name,
    market,
    side,
    orderType,
    price: input.price != null ? Number(input.price) : null,
    quantity,
    filledQuantity: 0,
    status: 'PENDING',
    createdAt: now,
    updatedAt: now,
  }

  state.orders.unshift(order)
  return { ...order }
}

export const executeOrder = async (orderNo: string) => {
  const state = getState()
  const order = state.orders.find((item) => item.orderNo === orderNo)
  if (!order) {
    throw new OrderError('Order not found')
  }

  if (order.status !== 'PENDING') {
    return {
      executed: false,
      order: { ...order },
    }
  }

  let executionPrice: number
  try {
    executionPrice = await getLatestPrice(order.symbol, order.market)
  } catch (error) {
    throw new OrderError(`Unable to fetch execution price: ${(error as Error).message}`)
  }

  const config = state.tradingConfigs[order.market]
  if (!config) {
    throw new OrderError(`No trading config for market ${order.market}`)
  }

  const orderPrice = order.price ?? executionPrice

  if (order.side === 'BUY' && order.orderType === 'LIMIT' && orderPrice < executionPrice) {
    return {
      executed: false,
      order: { ...order },
    }
  }

  if (order.side === 'SELL' && order.orderType === 'LIMIT' && orderPrice > executionPrice) {
    return {
      executed: false,
      order: { ...order },
    }
  }

  const { currency, currentKey, frozenKey } = getCashKeys(order.market)
  const currentCash = state.user[currentKey]
  const frozenCash = state.user[frozenKey]

  const notional = executionPrice * order.quantity
  const commission = calcCommission(config, notional)

  let position: PositionState | undefined

  if (order.side === 'BUY') {
    const totalCost = notional + commission
    const newCash = roundMoney(currentCash - totalCost)
    if (newCash < -1e-6) {
      throw new OrderError(`Insufficient ${currency.toUpperCase()} cash at execution time`)
    }

    const referencePrice = order.orderType === 'LIMIT' && order.price != null ? Math.max(order.price, executionPrice) : executionPrice
    const estimatedFrozen = referencePrice * order.quantity + calcCommission(config, referencePrice * order.quantity)
    const releaseAmount = Math.min(estimatedFrozen, frozenCash)
    state.user[frozenKey] = roundMoney(Math.max(frozenCash - releaseAmount, 0))
    state.user[currentKey] = newCash

    position = ensurePosition(state, order.symbol, order.name, order.market)
    const oldQty = position.quantity
    const oldAvgCost = position.avgCost
    const newQty = oldQty + order.quantity
    const newAvgCost = oldQty === 0 ? executionPrice : (oldAvgCost * oldQty + notional) / newQty
    position.quantity = newQty
    position.availableQuantity += order.quantity
    position.avgCost = roundMoney(newAvgCost)
    position.lastPrice = executionPrice
    position.marketValue = roundMoney(position.quantity * executionPrice)
  } else if (order.side === 'SELL') {
    position = state.positions.find((pos) => pos.symbol === order.symbol && pos.market === order.market)
    if (!position || position.availableQuantity < order.quantity) {
      throw new OrderError('Insufficient position to sell at execution time')
    }
    position.quantity -= order.quantity
    position.availableQuantity -= order.quantity
    position.lastPrice = executionPrice
    position.marketValue = roundMoney(position.quantity * executionPrice)

    const cashGain = notional - commission
    state.user[currentKey] = roundMoney(currentCash + cashGain)
  } else {
    throw new OrderError('Unsupported order side')
  }

  order.filledQuantity = order.quantity
  order.status = 'FILLED'
  order.updatedAt = new Date().toISOString()

  const trade: TradeState = {
    id: state.nextIds.trade++,
    orderId: order.id,
    userId: state.user.id,
    symbol: order.symbol,
    name: order.name,
    market: order.market,
    side: order.side,
    price: executionPrice,
    quantity: order.quantity,
    commission: roundMoney(commission),
    exchangeRate: 1,
    tradeTime: new Date().toISOString(),
  }
  state.trades.unshift(trade)

  return {
    executed: true,
    order: { ...order },
    trade: { ...trade },
    executionPrice,
  }
}

export const cancelOrder = async (orderNo: string) => {
  const state = getState()
  const order = state.orders.find((item) => item.orderNo === orderNo)
  if (!order || order.status !== 'PENDING') {
    return false
  }

  if (order.side === 'BUY') {
    try {
      const marketPrice = await getLatestPrice(order.symbol, order.market)
      const config = state.tradingConfigs[order.market]
      const refPrice = order.orderType === 'LIMIT' && order.price != null ? order.price : marketPrice
      const releaseNotional = refPrice * order.quantity
      const releaseCommission = calcCommission(config, releaseNotional)
      const { frozenKey } = getCashKeys(order.market)
      const frozenCash = state.user[frozenKey]
      const releaseAmount = releaseNotional + releaseCommission
      state.user[frozenKey] = roundMoney(Math.max(frozenCash - releaseAmount, 0))
    } catch (error) {
      // Ignore release failures to remain conservative
    }
  }

  order.status = 'CANCELLED'
  order.updatedAt = new Date().toISOString()
  return true
}

export const getOrders = () => listOrders()
export const getPositions = () => listPositions()
export const getTrades = () => listTrades()
export const getTradingOverview = () => getOverview()
export const resetTradingState = () => resetState()
