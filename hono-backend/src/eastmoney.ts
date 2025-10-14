const BASE_URL = 'https://push2his.eastmoney.com/api/qt/stock/trends2/get'

type MarketType = 'US' | 'HK' | 'CN'

// 全局状态
let lastCallTime = 0
const MIN_CALL_INTERVAL = 1000 // 1秒间隔限制

type EastmoneyDataRecord = {
  time?: string
  open?: number
  close?: number
  high?: number
  low?: number
  volume?: number
  amount?: number
  latest?: number
  datetime?: Date
  timestamp?: number
}

const getMarketCode = (symbol: string): number => {
  // 港股：5位数字且第一位是0，返回116
  if (symbol.length === 5 && symbol.startsWith("0")) {
    return 116
  }

  // 美股：包含字母或者纯数字，返回105
  if (/^[A-Z0-9]+$/i.test(symbol) && !symbol.match(/^\d{6}$/)) {
    return 105
  }

  // A股：6开头是上海(1)，其他是深证(0)
  return symbol.startsWith("6") ? 1 : 0
}

const isHK = (symbol: string): boolean => {
  return symbol.length === 5 && symbol.startsWith("0")
}

const isUS = (symbol: string): boolean => {
  return /^[A-Z0-9]+$/i.test(symbol) && !symbol.match(/^\d{6}$/)
}

const formatSymbol = (symbol: string): string => {
  const upper = symbol.toUpperCase().trim()
  if (!upper) return upper

  let core = upper
  if (core.startsWith('SH') || core.startsWith('SZ')) {
    core = core.substring(2)
  }

  const digits = core.replace(/[^0-9]/g, '')
  if (!digits) return upper

  // 美股保持原样，不进行数字转换
  if (isUS(symbol)) {
    return core
  }

  // 港股不需要填充，保持原样
  if (isHK(symbol)) {
    return digits
  }

  // A股填充到6位
  const code = digits.padStart(6, '0')
  return code
}

export class EastmoneyMarketDataError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EastmoneyMarketDataError'
  }
}

const fetchTrendsData = async (symbol: string): Promise<any> => {
  const now = Date.now()
  if (now - lastCallTime < MIN_CALL_INTERVAL) {
    await new Promise(resolve => setTimeout(resolve, MIN_CALL_INTERVAL - (now - lastCallTime)))
  }
  lastCallTime = Date.now()

  const marketCode = getMarketCode(symbol)
  const formattedSymbol = formatSymbol(symbol)

  console.log(`[fetchTrendsData] Fetching trends for ${symbol} -> ${formattedSymbol} (market: ${marketCode})`)

  const params = new URLSearchParams({
    'fields1': 'f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13',
    'fields2': 'f51,f52,f53,f54,f55,f56,f57,f58',
    'ndays': (isHK(symbol) || isUS(symbol)) ? '5' : '1',
    'iscr': (isHK(symbol) || isUS(symbol)) ? '0' : '1',
    'secid': `${marketCode}.${formattedSymbol}`
  })


  const url = `${BASE_URL}?${params.toString()}`
  console.log(`[fetchTrendsData] Fetching URL: ${url}`)

  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        'Referer': 'https://quote.eastmoney.com',
        'Connection': 'keep-alive'
      },
      method: 'GET'
    })

    console.log(`[fetchTrendsData] Response status: ${response.status}`)

    if (!response.ok) {
      throw new EastmoneyMarketDataError(`Eastmoney API HTTP error: ${response.status}`)
    }

    const text = await response.text()
    console.log(`[fetchTrendsData] Response text length: ${text.length}`)
    console.log(`[fetchTrendsData] Response preview: ${text.substring(0, 200)}...`)

    const data = JSON.parse(text)
    console.log(`[fetchTrendsData] Parsed JSON:`, Object.keys(data))

    return data
  } catch (error) {
    console.error(`[fetchTrendsData] Fetch error:`, error)
    throw new EastmoneyMarketDataError(`Failed to call Eastmoney API: ${(error as Error).message}`)
  }
}

export const getStockMinData = async (
  symbol: string,
  startTime: string = '09:00:00',
  endTime: string = '15:50:00'
): Promise<EastmoneyDataRecord[]> => {
  console.log(`[getStockMinData] Starting minute data fetch for ${symbol} (${startTime}-${endTime})`)

  try {
    const raw = await fetchTrendsData(symbol)
    console.log(`[getStockMinData] Raw data received:`, JSON.stringify(raw, null, 2))

    if (!raw.data?.trends) {
      throw new EastmoneyMarketDataError('Eastmoney API response missing trends data')
    }

    // 解析数据
    const tempData = raw.data.trends.map((item: any) => item.split(','))
    const columns = ['时间', '开盘', '收盘', '最高', '最低', '成交量', '成交额', '最新价']

    const temp_df = tempData.map((row: any) => {
      const record: any = {}
      columns.forEach((col, idx) => {
        record[col] = row[idx]
      })
      return record
    })

    console.log(`[getStockMinData] Parsed ${temp_df.length} records`)

    // 设置时间索引
    temp_df.forEach((record: any) => {
      const timeStr = record['时间']
      record['datetime'] = new Date(timeStr)
    })

    // 获取当前日期
    const dateStr = temp_df.length > 0 ? temp_df[0]['datetime'].toISOString().split('T')[0] : new Date().toISOString().split('T')[0]

    // 时间范围过滤
    const filteredData = temp_df.filter((record: any) => {
      if (!record['datetime']) return false
      const recordDate = record['datetime']
      const startTimeFull = `${dateStr}T${startTime}:00.000Z`
      const endTimeFull = `${dateStr}T${endTime}:00.000Z`
      const recordTime = recordDate.toISOString()

      return recordTime >= startTimeFull && recordTime <= endTimeFull
    })

    console.log(`[getStockMinData] Filtered to ${filteredData.length} records in time range`)

    // 转换为数字类型
    const processedData = filteredData.map((record: any) => {
      return {
        time: record['时间'],
        datetime: record['datetime'],
        timestamp: record['datetime']?.getTime(),
        open: Number(record['开盘']) || 0,
        close: Number(record['收盘']) || 0,
        high: Number(record['最高']) || 0,
        low: Number(record['最低']) || 0,
        volume: Number(record['成交量']) || 0,
        amount: Number(record['成交额']) || 0,
        latest: Number(record['最新价']) || 0
      }
    })

    console.log(`[getStockMinData] Success! Returning ${processedData.length} processed records`)
    return processedData
  } catch (error) {
    console.error(`[getStockMinData] Error:`, error)
    throw error
  }
}

export const getLatestPrice = async (symbol: string): Promise<number> => {
  console.log(`[getLatestPrice] Starting price fetch for ${symbol}`)

  try {
    const raw = await fetchTrendsData(symbol)
    console.log(`[getLatestPrice] Raw data received:`, JSON.stringify(raw, null, 2))

    if (!raw.data?.trends || !raw.data.trends.length) {
      throw new EastmoneyMarketDataError('Eastmoney API response missing trends data')
    }

    // 获取最新一条记录
    const latestRecord = raw.data.trends[raw.data.trends.length - 1].split(',')
    const latestPrice = Number(latestRecord[7]) // 最新价字段

    console.log(`[getLatestPrice] Got latest price:`, latestPrice)

    if (!Number.isFinite(latestPrice) || latestPrice <= 0) {
      throw new EastmoneyMarketDataError(`Invalid latest price: ${latestPrice}`)
    }

    return latestPrice
  } catch (error) {
    console.error(`[getLatestPrice] Error:`, error)
    throw error
  }
}

export const getMarketStatus = (symbol: string): 'TRADING' | 'CLOSED' => {
  const now = new Date()
  const hour = now.getHours()
  const day = now.getDay()

  // 周末不开市
  if (day === 0 || day === 6) {
    return 'CLOSED'
  }

  // A股交易时间: 9:30-11:30, 13:00-15:00
  const isMorning = hour >= 9 && hour < 11
  const isAfternoon = hour >= 13 && hour < 15

  return (isMorning || isAfternoon) ? 'TRADING' : 'CLOSED'
}

export type { EastmoneyDataRecord }