// 行情数据管理
import tradingApi from './api'
import { getMarketFromSymbol, isMarketOpen } from './marketHours'
import { priceHistoryService, type DailyPrice } from './priceHistory'

export interface StockQuote {
  symbol: string
  current_price: number
  timestamp: number
}

class MarketDataService {
  private quotes: Map<string, StockQuote> = new Map()
  private subscribers: Set<(quotes: Map<string, StockQuote>) => void> = new Set()
  private refreshInterval: number | null = null
  private lastRefreshTime: number = 0
  private minRefreshInterval: number = 3000 // 最小刷新间隔3秒
  private positions: Set<string> = new Set() // 当前持仓的股票代码

  constructor() {
    // 监听后端推送的行情数据
    tradingApi.onMessage((msg: any) => {
      if (msg.type === 'snapshot' && Array.isArray(msg.positions)) {
        // 从后端返回的持仓中提取价格信息
        msg.positions.forEach((pos: any) => {
          if (pos.symbol && pos.current_price) {
            this.updateQuote({
              symbol: pos.symbol,
              current_price: pos.current_price,
              timestamp: Date.now(),
            })
          }
        })
      }
    })
  }

  // 更新单个股票报价
  updateQuote(quote: StockQuote) {
    this.quotes.set(quote.symbol, quote)
    
    // 保存到历史价格（用于绘制资产曲线）
    priceHistoryService.savePrices([{
      symbol: quote.symbol,
      price: quote.current_price,
      timestamp: quote.timestamp,
    }])
    
    this.notifySubscribers()
  }

  // 批量更新报价（优化版本）
  updateQuotes(quotes: StockQuote[]) {
    quotes.forEach(quote => {
      this.quotes.set(quote.symbol, quote)
    })
    
    // 批量保存到历史价格
    const dailyPrices: DailyPrice[] = quotes.map(quote => ({
      symbol: quote.symbol,
      price: quote.current_price,
      timestamp: quote.timestamp,
    }))
    priceHistoryService.savePrices(dailyPrices)
    
    this.notifySubscribers()
  }

  // 获取股票报价
  getQuote(symbol: string): StockQuote | undefined {
    return this.quotes.get(symbol)
  }

  // 获取所有报价
  getAllQuotes(): Map<string, StockQuote> {
    return new Map(this.quotes)
  }

  // 打印当前所有报价（调试用）
  logAllQuotes() {
    if (this.quotes.size === 0) {
      console.log('📊 [行情汇总] 暂无行情数据')
      return
    }
    
    console.log(`📊 [行情汇总] 当前共 ${this.quotes.size} 个股票:`)
    this.quotes.forEach((quote, symbol) => {
      console.log(`  - ${symbol}: $${quote.current_price} (更新于 ${new Date(quote.timestamp).toLocaleTimeString()})`)
    })
  }

  // 订阅行情变化
  subscribe(callback: (quotes: Map<string, StockQuote>) => void): () => void {
    this.subscribers.add(callback)
    return () => {
      this.subscribers.delete(callback)
    }
  }

  // 通知所有订阅者
  private notifySubscribers() {
    this.subscribers.forEach(callback => {
      callback(this.getAllQuotes())
    })
  }

  // 更新持仓列表
  updatePositions(symbols: string[]) {
    this.positions = new Set(symbols)
  }

  // 获取需要刷新的股票（按市场分组）
  private getSymbolsToRefresh(): { us: string[], hk: string[], cn: string[] } {
    const result = { us: [] as string[], hk: [] as string[], cn: [] as string[] }
    
    this.positions.forEach(symbol => {
      const market = getMarketFromSymbol(symbol)
      if (market === 'US') result.us.push(symbol)
      else if (market === 'HK') result.hk.push(symbol)
      else if (market === 'CN') result.cn.push(symbol)
    })
    
    return result
  }

  // 智能判断是否应该刷新
  private shouldRefresh(): boolean {
    const now = Date.now()
    
    // 防止频繁请求
    if (now - this.lastRefreshTime < this.minRefreshInterval) {
      return false
    }
    
    // 检查是否有任何市场开盘
    const symbols = this.getSymbolsToRefresh()
    const hasUsOpen = symbols.us.length > 0 && isMarketOpen('US')
    const hasHkOpen = symbols.hk.length > 0 && isMarketOpen('HK')
    const hasCnOpen = symbols.cn.length > 0 && isMarketOpen('CN')
    
    // 如果有任何市场开盘，就刷新
    if (hasUsOpen || hasHkOpen || hasCnOpen) {
      return true
    }
    
    // 非交易时间，降低频率（只在有持仓时每60秒刷新一次）
    if (this.positions.size > 0) {
      return now - this.lastRefreshTime >= 60000 // 60秒
    }
    
    return false
  }

  // 请求刷新行情
  requestRefresh() {
    if (!tradingApi.isSocketOpen()) {
      return
    }
    
    if (!this.shouldRefresh()) {
      return
    }
    
    this.lastRefreshTime = Date.now()
    tradingApi.requestSnapshot()
    
    // 记录日志（方便调试）
    const symbols = this.getSymbolsToRefresh()
    const openMarkets = []
    if (symbols.us.length > 0 && isMarketOpen('US')) openMarkets.push(`US(${symbols.us.length})`)
    if (symbols.hk.length > 0 && isMarketOpen('HK')) openMarkets.push(`HK(${symbols.hk.length})`)
    if (symbols.cn.length > 0 && isMarketOpen('CN')) openMarkets.push(`CN(${symbols.cn.length})`)
    
    if (openMarkets.length > 0) {
      console.log(`📡 刷新行情 [开盘: ${openMarkets.join(', ')}]`)
      console.log(`   📋 持仓股票列表:`)
      if (symbols.us.length > 0) console.log(`     🇺🇸 US: ${symbols.us.join(', ')}`)
      if (symbols.hk.length > 0) console.log(`     🇭🇰 HK: ${symbols.hk.join(', ')}`)
      if (symbols.cn.length > 0) console.log(`     🇨🇳 CN: ${symbols.cn.join(', ')}`)
      
      // 显示当前行情
      setTimeout(() => this.logAllQuotes(), 1000) // 延迟1秒显示行情，让后端有时间响应
    }
  }

  // 启动智能定时刷新
  startAutoRefresh(intervalMs: number = 5000) {
    if (this.refreshInterval !== null) {
      return
    }

    // 使用较短的检查间隔，但智能判断是否真正发送请求
    this.refreshInterval = window.setInterval(() => {
      this.requestRefresh()
    }, intervalMs)
  }

  // 停止定时刷新
  stopAutoRefresh() {
    if (this.refreshInterval !== null) {
      window.clearInterval(this.refreshInterval)
      this.refreshInterval = null
    }
  }
}

export const marketDataService = new MarketDataService()
