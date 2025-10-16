import { marketDataService } from './marketData'
import { tradingStorage } from './storage'
import { checkAndFillOrders } from './orderExecutor'
import type { Position } from '@/components/trading/PositionsOrdersTrades'

export interface WebSocketHandlers {
  onCookieRequired: (message?: string) => void
  onCookieUpdated: () => void
  onPositionsUpdate: (positions: Position[]) => void
  onOrdersFilled?: (filledCount: number) => void
}

export function handleWebSocketMessage(
  msg: any,
  handlers: WebSocketHandlers
): void {
  console.log('📩 [WebSocket] 收到消息:', msg.type, msg)
  
  if (!msg || typeof msg !== 'object') {
    console.warn('⚠️ [WebSocket] 无效消息格式:', msg)
    return
  }

  switch (msg.type) {
    case 'bootstrap_ok':
      console.log('✅ [WebSocket] Market data connection established')
      break

    case 'snapshot':
      console.log('📊 [WebSocket] 处理 snapshot 消息')
      handleSnapshotMessage(msg, handlers)
      break

    case 'market_data':
      console.log('📊 [WebSocket] 处理 market_data 消息, quotes:', msg.quotes?.length || 0)
      handleMarketDataMessage(msg, handlers)
      break

    case 'xueqiu_cookie_updated':
      console.log('🔐 [WebSocket] Xueqiu cookie updated')
      handlers.onCookieUpdated()
      break

    case 'error':
      console.error('❌ [WebSocket] Error message:', msg.message)
      handleErrorMessage(msg, handlers)
      break

    default:
      console.warn('⚠️ [WebSocket] 未知消息类型:', msg.type)
      break
  }
}

function handleSnapshotMessage(msg: any, handlers: WebSocketHandlers): void {
  console.log('📊 [handleSnapshot] 处理快照消息')
  // 检查雪球 Cookie 状态
  const mdStatus = msg.market_data || msg.overview?.market_data
  if (mdStatus?.status === 'error' && mdStatus?.code === 'XUEQIU_COOKIE_REQUIRED') {
    handlers.onCookieRequired(mdStatus.message)
    return
  } else if (mdStatus?.status === 'ok') {
    handlers.onCookieUpdated()
  }

  // 【重要】WebSocket 不更新汇率、费率、余额等业务数据
  // 这些数据在 localStorage 初始化时设置，由前端 tradingLogic 管理
  // WebSocket 只负责实时行情数据的更新

  // 【重要】批量更新行情数据
  // WebSocket 只更新股票的实时价格，持仓数量等业务数据来自 localStorage
  if (Array.isArray(msg.quotes) && msg.quotes.length > 0) {
    updateQuotesAndPositions(msg.quotes, handlers)
  }
}

function handleMarketDataMessage(msg: any, handlers: WebSocketHandlers): void {
  console.log('📊 [handleMarketData] 处理市场数据消息, quotes:', msg.quotes)
  
  if (!Array.isArray(msg.quotes) || msg.quotes.length === 0) {
    console.log('⚠️ [handleMarketData] 没有行情数据')
    return
  }

  updateQuotesAndPositions(msg.quotes, handlers)
}

function updateQuotesAndPositions(rawQuotes: any[], handlers: WebSocketHandlers): void {
  // 标准化行情数据格式：支持 current_price 或 price 字段
  const quotes = rawQuotes
    .filter((quote: any) => quote.symbol && (quote.current_price || quote.price))
    .map((quote: any) => ({
      symbol: quote.symbol,
      current_price: quote.current_price || quote.price,
      date: quote.date,
      timestamp: Date.now(),
    }))

  console.log('📈 [updateQuotes] 标准化后的行情数据:', quotes)

  if (quotes.length === 0) {
    console.log('⚠️ [updateQuotes] 没有有效的行情数据')
    return
  }

  // 更新 marketDataService 的行情缓存
  marketDataService.updateQuotes(quotes)
  console.log('✅ [updateQuotes] 已更新 marketDataService 缓存')
  
  // 用最新行情更新持仓的当前价格（持仓数量等数据来自 localStorage）
  const currentPositions = tradingStorage.getPositions()
  console.log('📦 [updateQuotes] 当前持仓数量:', currentPositions.length)
  
  const updatedPositions = currentPositions.map(pos => {
    const quote = quotes.find((q: any) => q.symbol === pos.symbol)
    if (quote) {
      const price = quote.current_price
      console.log(`💰 [updateQuotes] 更新 ${pos.symbol} 价格: ${price}`)
      return {
        ...pos,
        current_price: price,
        market_value: price * pos.quantity,
        pnl: (price - pos.avg_cost) * pos.quantity,
        pnl_percent: ((price - pos.avg_cost) / pos.avg_cost) * 100,
      }
    }
    return pos
  })
  
  tradingStorage.savePositions(updatedPositions)
  handlers.onPositionsUpdate(updatedPositions)
  console.log('✅ [updateQuotes] 持仓价格更新完成')
  
  // 触发订单撮合检查
  console.log('🔄 [updateQuotes] 触发订单撮合检查...')
  const overview = tradingStorage.getOverview()
  const orders = tradingStorage.getOrders()
  const trades = tradingStorage.getTrades()
  
  const result = checkAndFillOrders(overview, updatedPositions, orders, trades)
  
  if (result.filledCount > 0) {
    console.log(`🎉 [updateQuotes] 成交 ${result.filledCount} 个订单`)
    // 保存更新后的状态
    tradingStorage.saveOverview(result.overview)
    tradingStorage.savePositions(result.positions)
    tradingStorage.saveOrders(result.orders)
    tradingStorage.saveTrades(result.trades)
    
    // 通知上层订单已成交
    handlers.onPositionsUpdate(result.positions)
    handlers.onOrdersFilled?.(result.filledCount)
  } else {
    console.log('⏳ [updateQuotes] 暂无订单成交')
  }
}

function handleErrorMessage(msg: any, handlers: WebSocketHandlers): void {
  console.error('⚠️ Error:', msg.message)
  if (typeof msg.message === 'string' && msg.message.includes('Snowball cookie')) {
    handlers.onCookieRequired(msg.message)
  }
}
