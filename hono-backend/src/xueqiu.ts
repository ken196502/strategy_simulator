const BASE_URL = 'https://stock.xueqiu.com/v5/stock/chart/kline.json'

type MarketType = 'US' | 'HK' | 'CN'

type CookieSource = 'user' | 'env' | null

const TOKEN_ENV_MAPPING: Record<string, string> = {
  xq_a_token: 'XUEQIU_TOKEN',
  xq_r_token: 'XUEQIU_R_TOKEN',
  xq_id_token: 'XUEQIU_ID_TOKEN',
}

// 全局cookie状态 - 简化版本
let globalCookie: string | null = null

// 导出全局cookie变量以便调试
export const getGlobalCookie = () => globalCookie

export class XueqiuMarketDataError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'XueqiuMarketDataError'
  }
}

const DEFAULT_HEADERS: Record<string, string> = {
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'zh-CN,zh;q=0.9',
  'User-Agent':
    process.env.XUEQIU_USER_AGENT ??
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  Referer: process.env.XUEQIU_REFERER ?? 'https://xueqiu.com',
  Connection: 'keep-alive',
}

const parseCookieString = (cookieString: string): Map<string, string> => {
  const cookies = new Map<string, string>()
  cookieString.split(';').forEach((part) => {
    const trimmed = part.trim()
    if (!trimmed) return
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex <= 0) return
    const name = trimmed.slice(0, eqIndex).trim()
    const value = trimmed.slice(eqIndex + 1).trim()
    if (name) {
      cookies.set(name, value)
    }
  })
  return cookies
}

const mergeCookies = (target: Map<string, string>, source: string) => {
  parseCookieString(source).forEach((value, key) => {
    if (!target.has(key)) {
      target.set(key, value)
    }
  })
}

const collectCookies = () => {
  const header = globalCookie?.trim() || undefined
  const cookieSource: CookieSource = globalCookie ? 'user' : null
  
  return {
    header,
    cookieSource,
    envCookiePresent: false,
    hasCookies: !!globalCookie,
  }
}

const markCookieInvalid = (source: CookieSource) => {
  if (source === 'user') {
    console.warn('Provided Snowball cookie string appears invalid; clearing it.')
    globalCookie = null
  }
}

const formatHkSymbol = (value: string) => {
  let core = value
  if (core.endsWith('.HK')) {
    core = core.slice(0, -3)
  }
  if (core.startsWith('HK')) {
    core = core.slice(2)
  }

  const digits = core.replace(/[^0-9]/g, '')
  if (!digits) {
    return core
  }

  return digits.padStart(5, '0')
}

const formatCnSymbol = (value: string) => {
  let core = value
  if (core.endsWith('.CN')) {
    core = core.slice(0, -3)
  }

  let prefix: 'SH' | 'SZ' | 'BJ' | null = null
  const knownPrefixes = ['SH', 'SZ', 'BJ'] as const
  for (const candidate of knownPrefixes) {
    if (core.startsWith(candidate)) {
      prefix = candidate
      core = core.slice(candidate.length)
      break
    }
  }

  const digits = core.replace(/[^0-9]/g, '')
  if (!prefix) {
    if (digits.startsWith('6')) prefix = 'SH'
    else if (digits.startsWith('8')) prefix = 'BJ'
    else prefix = 'SZ'
  }

  prefix = prefix ?? 'SZ'

  if (!digits) {
    return `${prefix}${core}`
  }

  return `${prefix}${digits}`
}

const formatSymbol = (symbol: string, market: MarketType) => {
  const upper = symbol.toUpperCase().trim()
  if (!upper) return upper

  if (upper.includes('.')) {
    const [base, suffix] = upper.split('.', 2)
    if (suffix === 'HK') {
      return formatHkSymbol(base)
    }
    if (suffix === 'US') {
      return base
    }
    if (suffix === 'CN') {
      return formatCnSymbol(base)
    }
    return upper
  }

  if (market === 'HK') {
    return formatHkSymbol(upper)
  }

  if (market === 'CN') {
    return formatCnSymbol(upper)
  }

  return upper
}

export const hasUserCookie = () => Boolean(globalCookie)

export const hasAnyCookie = () => Boolean(globalCookie)

export const setCookieString = (cookieString: string | null | undefined) => {
  const sanitized = cookieString?.trim()
  globalCookie = sanitized ? sanitized : null
  console.log(`[setCookieString] Global cookie ${globalCookie ? 'set' : 'cleared'}, length: ${globalCookie?.length || 0}`)
}

export const clearCookieString = () => {
  globalCookie = null
  console.log(`[clearCookieString] Global cookie cleared`)
}

interface FetchKlineOptions {
  period?: string
  count?: number
  skipCookieCheck?: boolean
}

interface ParsedKlineRecord {
  timestamp?: number
  datetime?: Date
  open?: number
  high?: number
  low?: number
  close?: number
  volume?: number
  amount?: number
  chg?: number
  percent?: number
}

const fetchKline = async (
  symbol: string,
  market: MarketType,
  options: FetchKlineOptions = {},
) => {
  console.log(`[fetchKline] Starting for ${symbol} (${market})`)
  
  if (!options.skipCookieCheck && !hasAnyCookie()) {
    console.error(`[fetchKline] No cookie available`)
    throw new XueqiuMarketDataError(
      'Snowball cookie not configured. Please set the cookie string before requesting market data.',
    )
  }

  const { header: cookieHeader, cookieSource, hasCookies } = collectCookies()
  console.log(`[fetchKline] Cookie source: ${cookieSource}, has cookies: ${hasCookies}`)
  console.log(`[fetchKline] Cookie header length: ${cookieHeader?.length || 0}`)

  const formattedSymbol = formatSymbol(symbol, market)
  console.log(`[fetchKline] Formatted symbol: ${formattedSymbol}`)

  const params = new URLSearchParams({
    symbol: formattedSymbol,
    begin: Math.floor(Date.now()).toString(),
    period: options.period ?? '1m',
    type: 'before',
    count: (-Math.abs(options.count ?? 100)).toString(),
    indicator: 'kline',
  })

  const headers: Record<string, string> = { ...DEFAULT_HEADERS }
  if (cookieHeader) {
    headers.Cookie = cookieHeader
  }

  const url = `${BASE_URL}?${params.toString()}`
  console.log(`[fetchKline] Fetching URL: ${url}`)
  const headersForLog = { ...headers }
  if (headersForLog.Cookie) {
    headersForLog.Cookie = `[redacted length=${headersForLog.Cookie.length}]`
  }
  console.log(`[fetchKline] Headers:`, headersForLog)

  let response: Response
  try {
    response = await fetch(url, {
      headers,
      method: 'GET',
    })
    console.log(`[fetchKline] Response status: ${response.status}`)
    console.log(`[fetchKline] Response headers:`, Object.fromEntries(response.headers.entries()))
  } catch (error) {
    console.error(`[fetchKline] Fetch error:`, error)
    throw new XueqiuMarketDataError(`Failed to call Snowball API: ${(error as Error).message}`)
  }

  if (!response.ok) {
    console.error(`[fetchKline] HTTP error: ${response.status}`)
    if (response.status === 401 || response.status === 403) {
      markCookieInvalid(cookieSource)
    }
    throw new XueqiuMarketDataError(`Snowball API HTTP error: ${response.status}`)
  }

  let data: any
  try {
    const text = await response.text()
    console.log(`[fetchKline] Response text length: ${text.length}`)
    console.log(`[fetchKline] Response text preview: ${text.substring(0, 200)}...`)
    data = JSON.parse(text)
    console.log(`[fetchKline] Parsed JSON keys:`, Object.keys(data))
  } catch (error) {
    console.error(`[fetchKline] JSON parse error:`, error)
    throw new XueqiuMarketDataError('Snowball API returned invalid JSON payload')
  }

  if (!data) {
    console.error(`[fetchKline] Empty data object`)
    throw new XueqiuMarketDataError('Snowball API returned an empty payload')
  }

  if (typeof data.error_code !== 'undefined' && data.error_code) {
    console.error(`[fetchKline] API error: ${data.error_code} - ${data.error_description || data.error_msg}`)
    markCookieInvalid(cookieSource)
    const description =
      data.error_description ?? data.error_msg ?? 'Unknown Snowball API error'
    throw new XueqiuMarketDataError(`Snowball API error (${data.error_code}): ${description}`)
  }

  if (!data.data) {
    console.error(`[fetchKline] Missing data field in response`)
    console.log(`[fetchKline] Full response:`, JSON.stringify(data, null, 2))
    markCookieInvalid(cookieSource)
    throw new XueqiuMarketDataError('Snowball API response missing data field; cookie may be invalid.')
  }

  console.log(`[fetchKline] Success! Returning data`)
  return data
}


export const getLatestPrice = async (
  symbol: string,
  market: MarketType,
  options?: FetchKlineOptions,
): Promise<number> => {
  console.log(`[getLatestPrice] Starting price fetch for ${symbol} (${market})`)
  console.log(`[getLatestPrice] Cookie status - hasAny: ${hasAnyCookie()}, hasUser: ${hasUserCookie()}`)
  console.log(`[getLatestPrice] Global cookie:`, 
    globalCookie ? `[length: ${globalCookie.length}]` : 'null')
  
  try {
    const payload = await fetchKline(symbol, market, { ...options, count: 1 })
    console.log(`[getLatestPrice] fetchKline successful, payload:`, JSON.stringify(payload, null, 2))
    
    const data = payload.data ?? {}
    console.log(`[getLatestPrice] data:`, JSON.stringify(data, null, 2))
    
    // 尝试不同的数据格式
    if (data.quote && data.quote.current) {
      const price = Number(data.quote.current)
      if (Number.isFinite(price) && price > 0) {
        console.log(`[getLatestPrice] Got price from data.quote.current:`, price)
        return price
      }
    }
    
    if (data.last_close) {
      const price = Number(data.last_close)
      if (Number.isFinite(price) && price > 0) {
        console.log(`[getLatestPrice] Got price from data.last_close:`, price)
        return price
      }
    }
    
    // 原始逻辑
    const columns: string[] = Array.isArray(data.column) ? data.column : []
    const items: unknown[] = Array.isArray(data.item) ? data.item : []
    
    console.log(`[getLatestPrice] columns:`, columns)
    console.log(`[getLatestPrice] items count:`, items.length)
    console.log(`[getLatestPrice] first item:`, items[0])

    if (!columns.length || !items.length) {
      console.error(`[getLatestPrice] Missing data - columns.length: ${columns.length}, items.length: ${items.length}`)
      throw new XueqiuMarketDataError('Snowball response missing price information.')
    }

    const closeIndex = columns.indexOf('close')
    console.log(`[getLatestPrice] closeIndex:`, closeIndex)
    
    if (closeIndex < 0) {
      console.error(`[getLatestPrice] No 'close' column found in:`, columns)
      throw new XueqiuMarketDataError('Snowball response missing close column.')
    }

    const latest = Array.isArray(items[0]) ? (items[0] as Array<unknown>) : []
    const value = latest[closeIndex]
    
    console.log(`[getLatestPrice] latest array:`, latest)
    console.log(`[getLatestPrice] close value at index ${closeIndex}:`, value)

    const price = typeof value === 'number' ? value : Number(value)
    console.log(`[getLatestPrice] parsed price:`, price)
    
    if (!Number.isFinite(price) || price <= 0) {
      console.error(`[getLatestPrice] Invalid price: ${price} (isFinite: ${Number.isFinite(price)}, > 0: ${price > 0})`)
      throw new XueqiuMarketDataError('Snowball returned an invalid latest price.')
    }
    
    console.log(`[getLatestPrice] Success! Returning price: ${price}`)
    return price
  } catch (error) {
    console.error(`[getLatestPrice] Error:`, error)
    
    // 如果是因为cookie问题导致失败，尝试清除cookie
    if (error instanceof XueqiuMarketDataError && error.message.includes('cookie')) {
      console.log(`[getLatestPrice] Clearing cookie due to error`)
      clearCookieString()
    }
    
    throw error
  }
}

export const parseKlineData = (rawData: any): ParsedKlineRecord[] => {
  const data = rawData?.data ?? {}
  const columns: string[] = Array.isArray(data.column) ? data.column : []
  const items: unknown[] = Array.isArray(data.item) ? data.item : []

  if (!columns.length || !items.length) {
    return []
  }

  const columnIndex = new Map<string, number>()
  columns.forEach((column, index) => {
    columnIndex.set(column, index)
  })

  return items.map((itemRaw) => {
    const item = Array.isArray(itemRaw) ? (itemRaw as Array<unknown>) : []
    const record: ParsedKlineRecord = {}

    const timestampIndex = columnIndex.get('timestamp')
    if (timestampIndex !== undefined && timestampIndex < item.length) {
      const tsValue = item[timestampIndex]
      const tsNumber = typeof tsValue === 'number' ? tsValue : Number(tsValue ?? 0)
      if (Number.isFinite(tsNumber) && tsNumber > 0) {
        record.timestamp = tsNumber
        record.datetime = new Date(tsNumber)
      }
    }

    for (const field of ['open', 'high', 'low', 'close', 'volume', 'amount', 'chg', 'percent'] as const) {
      const fieldIndex = columnIndex.get(field)
      if (fieldIndex === undefined || fieldIndex >= item.length) continue
      const rawValue = item[fieldIndex]
      if (rawValue === null || rawValue === undefined) continue
      const num = typeof rawValue === 'number' ? rawValue : Number(rawValue)
      if (Number.isFinite(num)) {
        ;(record as any)[field] = num
      }
    }

    return record
  })
}

export const getKlineData = async (
  symbol: string,
  market: MarketType,
  options?: FetchKlineOptions,
): Promise<ParsedKlineRecord[]> => {
  const raw = await fetchKline(symbol, market, options)
  const parsed = parseKlineData(raw)
  if (!parsed.length) {
    throw new XueqiuMarketDataError('Failed to parse Snowball kline data.')
  }
  return parsed
}

export const getMarketStatus = (symbol: string, market: MarketType) => {
  const now = new Date()
  const hour = now.getHours()

  let trading: boolean
  if (market === 'US') {
    trading = (hour >= 21 && hour <= 23) || (hour >= 0 && hour <= 4)
  } else if (market === 'HK') {
    trading = hour >= 9 && hour < 16
  } else {
    trading = hour >= 9 && hour < 15
  }

  return {
    symbol,
    market,
    market_status: trading ? 'TRADING' : 'CLOSED',
    timestamp: Date.now(),
    current_time: now.toISOString(),
  }
}

export type { ParsedKlineRecord, MarketType }
