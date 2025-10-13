export type MarketType = 'US' | 'HK' | 'CN'

export interface CurrencyBalance {
  current_cash: number
  frozen_cash: number
}

export type MarketCurrency = 'usd' | 'hkd' | 'cny'

export const HK_SYMBOL_LENGTH = 5

export const normalizeSymbol = (value: string) => value.trim().toUpperCase()

export const sanitizeSymbolInput = (value: string, market: MarketType) => {
  const trimmed = value.trim()
  if (!trimmed) return ''

  if (market === 'HK') {
    return trimmed.replace(/\D/g, '').slice(0, 5)
  }

  if (market === 'CN') {
    return trimmed.replace(/\D/g, '').slice(0, 6)
  }

  return trimmed.replace(/[^A-Za-z]/g, '').toUpperCase()
}

export const formatSymbolForMarket = (value: string, market: MarketType) => {
  const sanitized = sanitizeSymbolInput(value, market)
  if (!sanitized) return ''

  if (market === 'HK') {
    const padded = sanitized.padStart(HK_SYMBOL_LENGTH, '0')
    return `${padded}.HK`
  }

  if (market === 'CN') {
    return `${sanitized}.CN`
  }

  return `${sanitized}.US`
}

export const formatSymbolForDisplay = (value: string, market: MarketType) => {
  if (!value) return ''
  if (market === 'HK') {
    return value.padStart(HK_SYMBOL_LENGTH, '0')
  }
  return value
}

export const symbolPlaceholders: Record<MarketType, string> = {
  US: '例如 AAPL',
  HK: '例如 00700',
  CN: '例如 600519'
}

export const marketToCurrency: Record<MarketType, MarketCurrency> = {
  US: 'usd',
  HK: 'hkd',
  CN: 'cny'
}

export type BalancesByCurrency = {
  usd: CurrencyBalance
  hkd: CurrencyBalance
  cny: CurrencyBalance
}

export const getCurrentBalance = (balances: BalancesByCurrency | undefined, market: MarketType) => {
  if (!balances) return null
  const currency = marketToCurrency[market]
  return balances[currency] ?? null
}

export interface PendingHkRequest {
  resolve: Array<(info: any) => void>
  reject: Array<(error: Error) => void>
  timeoutId: number
}

export type PendingHkRequestsMap = Map<string, PendingHkRequest>

interface RequestHkStockInfoParams {
  ws: WebSocket
  pendingRequests: PendingHkRequestsMap
  inputSymbol: string
  timeoutMs?: number
}

export const requestHkStockInfo = ({
  ws,
  pendingRequests,
  inputSymbol,
  timeoutMs = 8000,
}: RequestHkStockInfoParams) => {
  const sanitized = sanitizeSymbolInput(inputSymbol, 'HK')
  if (!sanitized) {
    return Promise.reject(new Error('请输入股票代码'))
  }

  const formatted = formatSymbolForMarket(sanitized, 'HK')
  const key = normalizeSymbol(formatted)

  const scheduleTimeout = () => window.setTimeout(() => {
    const pending = pendingRequests.get(key)
    if (!pending) return
    pendingRequests.delete(key)
    pending.reject.forEach((rejecter) => rejecter(new Error('获取港股信息超时')))
  }, timeoutMs)

  return new Promise<any>((resolve, reject) => {
    const existing = pendingRequests.get(key)
    if (existing) {
      existing.resolve.push(resolve)
      existing.reject.push(reject)
      clearTimeout(existing.timeoutId)
      existing.timeoutId = scheduleTimeout()
    } else {
      const timeoutId = scheduleTimeout()
      pendingRequests.set(key, {
        resolve: [resolve],
        reject: [reject],
        timeoutId,
      })
    }

    ws.send(JSON.stringify({
      type: 'get_hk_stock_info',
      symbol: formatted
    }))
  })
}
