// 本地存储层 - 用于持久化交易数据
import type { Overview } from '@/types/overview'
import type { Position, Order, Trade } from '@/components/trading/PositionsOrdersTrades'

const STORAGE_KEYS = {
  OVERVIEW: 'trading_overview',
  POSITIONS: 'trading_positions',
  ORDERS: 'trading_orders',
  TRADES: 'trading_trades',
  INITIALIZED: 'trading_initialized',
}

// 创建默认的初始化数据
export const createDefaultOverview = (): Overview => ({
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
  balances_by_currency: {
    usd: {
      initial_capital: 10000,
      current_cash: 10000,
      frozen_cash: 0,
    },
    hkd: {
      initial_capital: 78000,
      current_cash: 78000,
      frozen_cash: 0,
    },
    cny: {
      initial_capital: 72000,
      current_cash: 72000,
      frozen_cash: 0,
    },
  },
  total_assets_usd: 0,
  positions_value_usd: 0,
  positions_value_by_currency: { usd: 0, hkd: 0, cny: 0 },
  market_data: { status: 'ok' },
  exchange_rates: {
    usd: 1,
    hkd: 0.1289,
    cny: 0.138,
  },
})

class TradingStorage {
  // 检查是否已初始化
  isInitialized(): boolean {
    return localStorage.getItem(STORAGE_KEYS.INITIALIZED) === 'true'
  }

  // 初始化存储
  initialize(): void {
    if (this.isInitialized()) {
      return
    }

    const defaultOverview = createDefaultOverview()
    localStorage.setItem(STORAGE_KEYS.OVERVIEW, JSON.stringify(defaultOverview))
    localStorage.setItem(STORAGE_KEYS.POSITIONS, JSON.stringify([]))
    localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify([]))
    localStorage.setItem(STORAGE_KEYS.TRADES, JSON.stringify([]))
    localStorage.setItem(STORAGE_KEYS.INITIALIZED, 'true')
  }

  // 获取概览数据
  getOverview(): Overview {
    const data = localStorage.getItem(STORAGE_KEYS.OVERVIEW)
    return data ? JSON.parse(data) : createDefaultOverview()
  }

  // 保存概览数据
  saveOverview(overview: Overview): void {
    localStorage.setItem(STORAGE_KEYS.OVERVIEW, JSON.stringify(overview))
  }

  // 获取持仓
  getPositions(): Position[] {
    const data = localStorage.getItem(STORAGE_KEYS.POSITIONS)
    return data ? JSON.parse(data) : []
  }

  // 保存持仓
  savePositions(positions: Position[]): void {
    localStorage.setItem(STORAGE_KEYS.POSITIONS, JSON.stringify(positions))
  }

  // 获取订单
  getOrders(): Order[] {
    const data = localStorage.getItem(STORAGE_KEYS.ORDERS)
    return data ? JSON.parse(data) : []
  }

  // 保存订单
  saveOrders(orders: Order[]): void {
    localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(orders))
  }

  // 获取成交记录
  getTrades(): Trade[] {
    const data = localStorage.getItem(STORAGE_KEYS.TRADES)
    return data ? JSON.parse(data) : []
  }

  // 保存成交记录
  saveTrades(trades: Trade[]): void {
    localStorage.setItem(STORAGE_KEYS.TRADES, JSON.stringify(trades))
  }

  // 重置所有数据
  reset(): void {
    localStorage.removeItem(STORAGE_KEYS.OVERVIEW)
    localStorage.removeItem(STORAGE_KEYS.POSITIONS)
    localStorage.removeItem(STORAGE_KEYS.ORDERS)
    localStorage.removeItem(STORAGE_KEYS.TRADES)
    localStorage.removeItem(STORAGE_KEYS.INITIALIZED)
    this.initialize()
  }
}

export const tradingStorage = new TradingStorage()
