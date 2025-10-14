import { Hono } from 'hono'
import { cors } from 'hono/cors'
import {
  XueqiuMarketDataError,
  setCookieString,
  clearCookieString,
  hasAnyCookie,
  hasUserCookie,
  type MarketType,
} from './xueqiu'
import {
  getLatestPrice as getLatestPriceEastmoney,
  getStockMinData,
  getMarketStatus as getMarketStatusEastmoney,
  EastmoneyMarketDataError,
} from './eastmoney'
import {
  placeOrder,
  executeOrder,
  cancelOrder,
  getOrders,
  getPositions,
  getTrades,
  getTradingOverview,
  OrderError,
} from './orderService'

const SUPPORTED_MARKETS: MarketType[] = ['US', 'HK', 'CN']

const normalizeMarket = (value: string | null | undefined): MarketType | null => {
  if (!value) return null
  const normalized = value.toUpperCase() as MarketType
  return SUPPORTED_MARKETS.includes(normalized) ? normalized : null
}

const convertMinuteDataToKline = (minuteData: any[]): any[] => {
  if (!minuteData.length) return []

  const klineData: any[] = []
  const minuteMap = new Map<string, any[]>()

  // Group data by day
  minuteData.forEach(record => {
    if (!record.datetime) return

    const date = new Date(record.datetime).toISOString().split('T')[0]
    if (!minuteMap.has(date)) {
      minuteMap.set(date, [])
    }
    minuteMap.get(date)?.push(record)
  })

  // Convert daily minute data to kline
  minuteMap.forEach((dayRecords, date) => {
    if (dayRecords.length === 0) return

    dayRecords.sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime())

    const first = dayRecords[0]
    const last = dayRecords[dayRecords.length - 1]
    const highs = dayRecords.map(r => r.high)
    const lows = dayRecords.map(r => r.low)

    const klineRecord = {
      timestamp: new Date(date).getTime(),
      time: date,
      date: date,
      open: first.open,
      close: last.close,
      high: Math.max(...highs),
      low: Math.min(...lows),
      volume: dayRecords.reduce((sum, r) => sum + r.volume, 0),
      amount: dayRecords.reduce((sum, r) => sum + r.amount, 0),
      period: '1d',
      symbol: first.symbol || '',
      market: first.market || ''
    }

    klineData.push(klineRecord)
  })

  // Sort by timestamp and return
  klineData.sort((a, b) => a.timestamp - b.timestamp)
  return klineData
}

const app = new Hono()

// Add CORS middleware
app.use('*', cors({
  origin: ['http://localhost:2414', 'http://localhost:3000', 'http://localhost:5173'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}))

app.get('/health', (c) => c.json({ status: 'ok' }))

// Asset trend endpoint (placeholder)
app.get('/asset-trend', (c) => {
  const userId = c.req.query('user_id')
  // Return empty snapshots for now since we're moving to browser storage
  return c.json({ snapshots: [] })
})

app.get('/xueqiu/cookie', (c) =>
  c.json({
    hasAnyCookie: hasAnyCookie(),
    hasUserCookie: hasUserCookie(),
  }),
)

app.post('/xueqiu/cookie', async (c) => {
  let payload: unknown
  try {
    payload = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON payload' }, 400)
  }

  const cookieString =
    typeof (payload as Record<string, unknown>)?.cookie_string === 'string'
      ? ((payload as Record<string, unknown>).cookie_string as string).trim()
      : null

  if (!cookieString) {
    clearCookieString()
    return c.json({ message: 'Cookie cleared' })
  }

  setCookieString(cookieString)
  return c.json({ message: 'Cookie updated' })
})

app.delete('/xueqiu/cookie', (c) => {
  clearCookieString()
  return c.json({ message: 'Cookie cleared' })
})

app.get('/market/last-price', async (c) => {
  const symbol = c.req.query('symbol')?.trim()
  const market = normalizeMarket(c.req.query('market'))

  if (!symbol || !market) {
    return c.json({ error: 'symbol and market query parameters are required.' }, 400)
  }

  try {
    // Use Eastmoney directly for all cases - no need for Xueqiu
    const price = await getLatestPriceEastmoney(symbol)
    return c.json({ symbol, market, price })
  } catch (error) {
    console.error('Error fetching last price from Eastmoney', error)
    return c.json({ error: error instanceof Error ? error.message : 'Internal server error' }, 500)
  }
})

app.get('/market/kline', async (c) => {
  const symbol = c.req.query('symbol')?.trim()
  const market = normalizeMarket(c.req.query('market'))
  const period = c.req.query('period') ?? '1m'
  const countParam = c.req.query('count')
  const count = countParam ? Number(countParam) : undefined

  if (!symbol || !market) {
    return c.json({ error: 'symbol and market query parameters are required.' }, 400)
  }

  if (count !== undefined && (!Number.isFinite(count) || count <= 0)) {
    return c.json({ error: 'count must be a positive number' }, 400)
  }

  try {
    // Use Eastmoney directly - convert minute data to kline format
    const minuteData = await getStockMinData(symbol, '09:00:00', '15:50:00')
    const records = convertMinuteDataToKline(minuteData).slice(-count || 100)
    return c.json({ symbol, market, period, count: count ?? 100, records })
  } catch (error) {
    console.error('Error fetching kline data from Eastmoney', error)
    return c.json({ error: error instanceof Error ? error.message : 'Internal server error' }, 500)
  }
})

app.get('/market/status', (c) => {
  const symbol = c.req.query('symbol')?.trim() ?? ''
  const market = normalizeMarket(c.req.query('market'))
  if (!market) {
    return c.json({ error: 'market query parameter is required.' }, 400)
  }

  // Use Eastmoney directly
  return c.json(getMarketStatusEastmoney(symbol))
})

app.get('/overview', (c) => c.json(getTradingOverview()))
app.get('/orders', (c) => c.json({ orders: getOrders() }))
app.get('/positions', (c) => c.json({ positions: getPositions() }))
app.get('/trades', (c) => c.json({ trades: getTrades() }))

app.post('/orders', async (c) => {
  let payload: unknown
  try {
    payload = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON payload' }, 400)
  }

  try {
    const order = await placeOrder(payload as any)
    let executionResult: Awaited<ReturnType<typeof executeOrder>> | null = null
    let executionError: string | null = null
    try {
      executionResult = await executeOrder(order.orderNo)
    } catch (error) {
      executionError = error instanceof Error ? error.message : 'Unknown execution error'
    }

    const responseOrder = executionResult?.order ?? order
    return c.json({
      order: responseOrder,
      execution: executionResult,
      executionError,
      overview: getTradingOverview(),
    })
  } catch (error) {
    if (error instanceof OrderError) {
      return c.json({ error: error.message }, 400)
    }
    console.error('Unexpected error placing order', error)
    return c.json({ error: error instanceof Error ? error.message : 'Internal server error' }, 500)
  }
})

app.post('/orders/:orderNo/execute', async (c) => {
  const orderNo = c.req.param('orderNo')
  try {
    const result = await executeOrder(orderNo)
    return c.json({ ...result, overview: getTradingOverview() })
  } catch (error) {
    if (error instanceof OrderError) {
      return c.json({ error: error.message }, 400)
    }
    console.error('Unexpected error executing order', error)
    return c.json({ error: error instanceof Error ? error.message : 'Internal server error' }, 500)
  }
})

app.post('/orders/:orderNo/cancel', async (c) => {
  const orderNo = c.req.param('orderNo')
  try {
    const success = await cancelOrder(orderNo)
    if (!success) {
      return c.json({ error: 'Order not found or not cancellable' }, 404)
    }
    return c.json({ cancelled: true, overview: getTradingOverview() })
  } catch (error) {
    if (error instanceof OrderError) {
      return c.json({ error: error.message }, 400)
    }
    console.error('Unexpected error cancelling order', error)
    return c.json({ error: error instanceof Error ? error.message : 'Internal server error' }, 500)
  }
})

app.onError((err, c) => {
  console.error('Unhandled error in Hono app', err)
  return c.json({ error: 'Internal server error' }, 500)
})

export { app }
