export interface CurrencyBalance {
  initial_capital: number
  current_cash: number
  frozen_cash: number
}

export interface User {
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

export interface MarketDataStatus {
  status: 'ok' | 'error'
  code?: string
  message?: string
}

export interface Overview {
  user: User
  balances_by_currency: {
    usd: CurrencyBalance
    hkd: CurrencyBalance
    cny: CurrencyBalance
  }
  total_assets_usd: number
  positions_value_usd: number
  positions_value_by_currency: { usd: number; hkd: number; cny: number }
  market_data?: MarketDataStatus
  exchange_rates?: {
    usd: number
    hkd: number
    cny: number
  }
}
