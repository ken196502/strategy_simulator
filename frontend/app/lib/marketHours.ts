// 市场交易时间判断

export type MarketType = 'US' | 'HK' | 'CN'

interface MarketHours {
  open: { hour: number; minute: number }
  close: { hour: number; minute: number }
  timezone: string
}

// 各市场交易时间配置（本地时间）
const MARKET_HOURS: Record<MarketType, MarketHours> = {
  // 美股：美东时间 9:30-16:00
  US: {
    open: { hour: 9, minute: 30 },
    close: { hour: 16, minute: 0 },
    timezone: 'America/New_York',
  },
  // 港股：香港时间 9:30-16:00 (午休 12:00-13:00)
  HK: {
    open: { hour: 9, minute: 30 },
    close: { hour: 16, minute: 0 },
    timezone: 'Asia/Hong_Kong',
  },
  // A股：北京时间 9:30-15:00 (午休 11:30-13:00)
  CN: {
    open: { hour: 9, minute: 30 },
    close: { hour: 15, minute: 0 },
    timezone: 'Asia/Shanghai',
  },
}

/**
 * 判断市场当前是否在交易时间（使用本地时间简化判断）
 * 注意：实际应用应该转换到对应市场的时区
 * @param market 市场类型
 * @returns 是否在交易时间
 */
export const isMarketOpen = (market: MarketType): boolean => {
  const now = new Date()
  const hours = MARKET_HOURS[market]
  
  // 排除周末
  const dayOfWeek = now.getDay()
  const isWeekday = dayOfWeek !== 0 && dayOfWeek !== 6
  if (!isWeekday) {
    return false
  }
  
  // 获取当前时间（本地时间）
  const currentHour = now.getHours()
  const currentMinute = now.getMinutes()
  const currentTimeInMinutes = currentHour * 60 + currentMinute
  
  // 简化判断：假设都用本地时区（实际应该转换）
  // 美股：21:30-04:00 (北京时间)
  // 港股：09:30-16:00 (北京时间)
  // A股：09:30-15:00 (北京时间)
  
  if (market === 'US') {
    // 美股跨日，需要特殊处理
    // 夏令时：21:30-04:00, 冬令时：22:30-05:00
    // 简化为 21:30-05:00
    return currentTimeInMinutes >= (21 * 60 + 30) || currentTimeInMinutes < (5 * 60)
  }
  
  const openTimeInMinutes = hours.open.hour * 60 + hours.open.minute
  const closeTimeInMinutes = hours.close.hour * 60 + hours.close.minute
  
  return currentTimeInMinutes >= openTimeInMinutes && currentTimeInMinutes < closeTimeInMinutes
}

/**
 * 判断是否应该更新行情
 * 交易时间内：每3秒更新
 * 交易时间外：不更新（或降低频率）
 */
export const shouldUpdateQuotes = (market: MarketType): boolean => {
  // 简化逻辑：总是允许更新，由调用方决定频率
  // 实际中可以根据开盘时间返回不同的更新频率
  return true
}

/**
 * 获取建议的行情更新间隔（毫秒）
 */
export const getUpdateInterval = (market: MarketType): number => {
  if (isMarketOpen(market)) {
    return 3000 // 交易时间：3秒
  }
  return 60000 // 非交易时间：60秒
}

/**
 * 从股票代码提取市场类型
 */
export const getMarketFromSymbol = (symbol: string): MarketType => {
  if (symbol.endsWith('.HK')) return 'HK'
  if (symbol.endsWith('.CN')) return 'CN'
  return 'US'
}
