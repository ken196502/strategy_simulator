import type { MarketType } from './xueqiu'

export type CurrencyKey = 'usd' | 'hkd' | 'cny'

export interface TradingConfig {
  market: MarketType
  minCommission: number
  commissionRate: number
  minOrderQuantity: number
  lotSize: number
}

export interface UserState {
  id: number
  username: string
  initial_capital_usd: number
  current_cash_usd: number
  frozen_cash_usd: number
  initial_capital_hkd: number
  current_cash_hkd: number
  frozen_cash_hkd: number
  initial_capital_cny: number
  current_cash_cny: number
  frozen_cash_cny: number
}

export interface PositionState {
  id: number
  symbol: string
  name: string
  market: MarketType
  quantity: number
  availableQuantity: number
  avgCost: number
  lastPrice?: number
  marketValue?: number
}

export type OrderStatus = 'PENDING' | 'FILLED' | 'CANCELLED'
export type OrderSide = 'BUY' | 'SELL'
export type OrderType = 'MARKET' | 'LIMIT'

export interface OrderState {
  id: number
  orderNo: string
  symbol: string
  name: string
  market: MarketType
  side: OrderSide
  orderType: OrderType
  price?: number | null
  quantity: number
  filledQuantity: number
  status: OrderStatus
  createdAt: string
  updatedAt: string
}

export interface TradeState {
  id: number
  orderId: number
  userId: number
  symbol: string
  name: string
  market: MarketType
  side: OrderSide
  price: number
  quantity: number
  commission: number
  exchangeRate: number
  tradeTime: string
}

export interface TradingState {
  user: UserState
  positions: PositionState[]
  orders: OrderState[]
  trades: TradeState[]
  tradingConfigs: Record<MarketType, TradingConfig>
  exchangeRates: Record<CurrencyKey, number>
  nextIds: {
    position: number
    order: number
    trade: number
  }
}

const marketDefaults: Record<MarketType, TradingConfig> = {
  US: {
    market: 'US',
    minCommission: 1,
    commissionRate: 0.005,
    minOrderQuantity: 1,
    lotSize: 1,
  },
  HK: {
    market: 'HK',
    minCommission: 20,
    commissionRate: 0.00027,
    minOrderQuantity: 100,
    lotSize: 100,
  },
  CN: {
    market: 'CN',
    minCommission: 5,
    commissionRate: 0.001,
    minOrderQuantity: 100,
    lotSize: 100,
  },
}

const createInitialState = (): TradingState => ({
  user: {
    id: 1,
    username: 'demo',
    initial_capital_usd: 10000,
    current_cash_usd: 10000,
    frozen_cash_usd: 0,
    initial_capital_hkd: 78000,
    current_cash_hkd: 78000,
    frozen_cash_hkd: 0,
    initial_capital_cny: 72000,
    current_cash_cny: 72000,
    frozen_cash_cny: 0,
  },
  positions: [],
  orders: [],
  trades: [],
  tradingConfigs: { ...marketDefaults },
  exchangeRates: {
    usd: 1,
    hkd: 0.1289,
    cny: 0.138,
  },
  nextIds: {
    position: 1,
    order: 1,
    trade: 1,
  },
})

let tradingState: TradingState = createInitialState()

export const marketToCurrency: Record<MarketType, CurrencyKey> = {
  US: 'usd',
  HK: 'hkd',
  CN: 'cny',
}

export const getState = () => tradingState

export const resetState = () => {
  tradingState = createInitialState()
}

export const clonePosition = (position: PositionState): PositionState => ({
  ...position,
})

export const cloneOrder = (order: OrderState): OrderState => ({
  ...order,
})

export const cloneTrade = (trade: TradeState): TradeState => ({
  ...trade,
})

export interface CurrencyBalance {
  initial_capital: number
  current_cash: number
  frozen_cash: number
}

export interface OverviewState {
  user: UserState
  balancesByCurrency: Record<CurrencyKey, CurrencyBalance>
  totalAssetsUsd: number
  positionsValueUsd: number
  positionsValueByCurrency: Record<CurrencyKey, number>
  exchangeRates: Record<CurrencyKey, number>
}

const calculatePositionsValueByCurrency = (positions: PositionState[]) => {
  return positions.reduce<Record<CurrencyKey, number>>(
    (acc, pos) => {
      const currency = marketToCurrency[pos.market]
      const referencePrice = pos.lastPrice ?? pos.avgCost ?? 0
      acc[currency] += referencePrice * pos.quantity
      return acc
    },
    { usd: 0, hkd: 0, cny: 0 },
  )
}

const convertToUsd = (value: number, currency: CurrencyKey, rates: Record<CurrencyKey, number>) => {
  return value * (rates[currency] ?? 1)
}

export const getOverview = (): OverviewState => {
  const state = getState()
  const balances: Record<CurrencyKey, CurrencyBalance> = {
    usd: {
      initial_capital: state.user.initial_capital_usd,
      current_cash: state.user.current_cash_usd,
      frozen_cash: state.user.frozen_cash_usd,
    },
    hkd: {
      initial_capital: state.user.initial_capital_hkd,
      current_cash: state.user.current_cash_hkd,
      frozen_cash: state.user.frozen_cash_hkd,
    },
    cny: {
      initial_capital: state.user.initial_capital_cny,
      current_cash: state.user.current_cash_cny,
      frozen_cash: state.user.frozen_cash_cny,
    },
  }

  const positionsValueByCurrency = calculatePositionsValueByCurrency(state.positions)
  const positionsValueUsd = (['usd', 'hkd', 'cny'] as CurrencyKey[]).reduce((sum, currency) => {
    return sum + convertToUsd(positionsValueByCurrency[currency], currency, state.exchangeRates)
  }, 0)

  const totalAssetsUsd = (['usd', 'hkd', 'cny'] as CurrencyKey[]).reduce((sum, currency) => {
    const balance = balances[currency]
    const cashTotal = balance.current_cash + balance.frozen_cash
    return sum + convertToUsd(cashTotal + positionsValueByCurrency[currency], currency, state.exchangeRates)
  }, 0)

  return {
    user: { ...state.user },
    balancesByCurrency: {
      usd: { ...balances.usd },
      hkd: { ...balances.hkd },
      cny: { ...balances.cny },
    },
    totalAssetsUsd,
    positionsValueUsd,
    positionsValueByCurrency: { ...positionsValueByCurrency },
    exchangeRates: { ...state.exchangeRates },
  }
}

export const listPositions = () => getState().positions.map(clonePosition)
export const listOrders = () => getState().orders.map(cloneOrder)
export const listTrades = () => getState().trades.map(cloneTrade)
