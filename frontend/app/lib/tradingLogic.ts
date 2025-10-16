import { executePlaceOrder, checkAndFillOrders, executeCancelOrder } from './orderExecutor'
import { marketDataService } from './marketData'
import { tradingStorage } from './storage'
import type { Position, Order, Trade } from '@/components/trading/PositionsOrdersTrades'
import type { Overview } from '@/types/overview'

export interface TradingState {
  overview: Overview
  positions: Position[]
  orders: Order[]
  trades: Trade[]
}

export interface PlaceOrderPayload {
  symbol: string
  side: 'BUY' | 'SELL'
  quantity: number
  order_type: 'MARKET' | 'LIMIT'
  price?: number
  market: 'US' | 'HK'
}

export interface TradingLogicHandlers {
  onStateUpdate: (state: TradingState) => void
  onOrderFilled: (filledCount: number, newTrades: Trade[]) => void
  onError: (message: string) => void
}

export class TradingLogic {
  private handlers: TradingLogicHandlers
  private unsubscribeMarketData?: () => void
  private autoRefreshInterval?: number

  constructor(handlers: TradingLogicHandlers) {
    this.handlers = handlers
  }

  /**
   * 初始化交易逻辑
   */
  initialize(): void {
    if (!tradingStorage.isInitialized()) {
      tradingStorage.initialize()
    }
  }

  /**
   * 计算并更新 overview 的持仓价值
   */
  private updateOverviewPositionsValue(positions: Position[]): void {
    const overview = tradingStorage.getOverview()
    
    // 按币种计算持仓价值
    const positionsValueByCurrency = { usd: 0, hkd: 0, cny: 0 }
    positions.forEach(pos => {
      const currency = pos.market === 'US' ? 'usd' : pos.market === 'HK' ? 'hkd' : 'cny'
      positionsValueByCurrency[currency] += pos.market_value
    })
    
    // 更新 overview
    overview.positions_value_by_currency = positionsValueByCurrency
    overview.positions_value_usd = positionsValueByCurrency.usd
    overview.total_assets_usd = 
      overview.balances_by_currency.usd.current_cash + 
      overview.balances_by_currency.usd.frozen_cash + 
      positionsValueByCurrency.usd
    
    tradingStorage.saveOverview(overview)
  }

  /**
   * 获取当前交易状态
   */
  getState(): TradingState {
    const positions = tradingStorage.getPositions()
    this.updateOverviewPositionsValue(positions)
    
    return {
      overview: tradingStorage.getOverview(),
      positions,
      orders: tradingStorage.getOrders(),
      trades: tradingStorage.getTrades(),
    }
  }

  /**
   * 启动自动行情刷新和订单撮合
   */
  startAutoTrading(state: TradingState): void {
    const { positions, orders } = state

    // 更新行情订阅列表
    const positionSymbols = positions.map(p => p.symbol)
    const pendingOrderSymbols = orders.filter(o => o.status === 'PENDING').map(o => o.symbol)
    const allSymbols = [...new Set([...positionSymbols, ...pendingOrderSymbols])]
    marketDataService.updatePositions(allSymbols)

    // 启动行情智能刷新（每5秒检查，但根据市场时间智能决定是否请求）
    marketDataService.startAutoRefresh(5000)

    // 订阅行情变化，当行情更新时检查订单
    this.unsubscribeMarketData = marketDataService.subscribe(() => {
      this.checkAndProcessOrders()
    })
  }

  /**
   * 停止自动交易
   */
  stopAutoTrading(): void {
    marketDataService.stopAutoRefresh()
    if (this.unsubscribeMarketData) {
      this.unsubscribeMarketData()
      this.unsubscribeMarketData = undefined
    }
  }

  /**
   * 检查并处理待成交订单
   */
  private checkAndProcessOrders(): void {
    const state = this.getState()
    const { overview, positions, orders, trades } = state

    // 检查是否有待成交订单
    const hasPendingOrders = orders.some(o => o.status === 'PENDING')
    if (!hasPendingOrders) {
      return
    }

    // 尝试撮合订单
    const result = checkAndFillOrders(overview, positions, orders, trades)

    if (result.filledCount > 0) {
      console.log(`🎉 ${result.filledCount} 个订单已成交!`)

      // 显示成交详情
      const newTrades = result.trades.slice(-result.filledCount)
      this.logTradeDetails(newTrades)

      // 保存到本地存储
      tradingStorage.saveOverview(result.overview)
      tradingStorage.savePositions(result.positions)
      tradingStorage.saveOrders(result.orders)
      tradingStorage.saveTrades(result.trades)

      // 通知状态更新
      this.handlers.onStateUpdate({
        overview: result.overview,
        positions: result.positions,
        orders: result.orders,
        trades: result.trades,
      })

      this.handlers.onOrderFilled(result.filledCount, newTrades)
    }
  }

  /**
   * 下单
   */
  placeOrder(payload: PlaceOrderPayload): void {
    console.log('🔧 [DEBUG] placeOrder called with payload:', payload)

    const state = this.getState()
    const { overview, positions, orders, trades } = state

    console.log('🔧 [DEBUG] Current state before order:')
    console.log('  - Orders count:', orders.length)
    console.log('  - Overview USD balance:', overview.balances_by_currency.usd)

    // 执行下单逻辑
    const result = executePlaceOrder(payload, overview, positions, orders, trades)

    console.log('🔧 [DEBUG] executePlaceOrder result:', result)

    if (!result.success) {
      console.error('❌ [DEBUG] Order placement failed:', result.message)
      this.handlers.onError(result.message || '下单失败')
      return
    }

    console.log('✅ [DEBUG] Order placement successful!')
    console.log('  - New orders count:', result.orders.length)

    const newOrder = result.orders[result.orders.length - 1]
    this.logOrderDetails(newOrder)

    // 保存到本地存储
    tradingStorage.saveOverview(result.overview)
    tradingStorage.saveOrders(result.orders)

    // 通知状态更新
    this.handlers.onStateUpdate({
      overview: result.overview,
      positions: result.positions,
      orders: result.orders,
      trades: result.trades,
    })

    console.log('📝 订单已提交，等待行情匹配:', result.message)
    console.log('💾 [DEBUG] Data saved to localStorage')

    // 通知后端订阅这个股票的行情
    import('./api').then(({ default: tradingApi }) => {
      tradingApi.subscribeQuotes([payload.symbol])
    })

    // 立即刷新行情，加快首次撮合
    marketDataService.requestRefresh()
  }

  /**
   * 撤单
   */
  cancelOrder(orderNo: string): void {
    const state = this.getState()
    const { overview, positions, orders, trades } = state

    // 执行撤单逻辑
    const result = executeCancelOrder(orderNo, overview, positions, orders, trades)

    if (!result.success) {
      this.handlers.onError(result.message || '撤单失败')
      return
    }

    // 保存到本地存储
    tradingStorage.saveOverview(result.overview)
    tradingStorage.saveOrders(result.orders)

    // 通知状态更新
    this.handlers.onStateUpdate({
      overview: result.overview,
      positions: result.positions,
      orders: result.orders,
      trades: result.trades,
    })

    console.log('❌ 订单已取消:', result.message)
  }

  /**
   * 更新状态（用于外部数据更新，如 WebSocket 行情）
   * 注意：WebSocket 只更新行情数据（持仓价格），不更新业务数据
   */
  updateState(partialState: Partial<TradingState>): void {
    // 从 localStorage 获取最新的业务数据
    const currentState = this.getState()
    
    // 如果持仓更新了，重新计算 overview 的持仓价值
    if (partialState.positions) {
      this.updateOverviewPositionsValue(partialState.positions)
    }
    
    // 合并状态：只允许更新持仓的行情价格
    // overview（汇率、余额）、orders、trades 始终从 localStorage 获取
    const newState: TradingState = {
      overview: tradingStorage.getOverview(),  // 重新获取更新后的 overview
      positions: partialState.positions ?? currentState.positions,  // 只更新行情价格
      orders: currentState.orders,      // 订单始终来自 localStorage
      trades: currentState.trades,      // 交易始终来自 localStorage
    }
    
    this.handlers.onStateUpdate(newState)
  }

  /**
   * 打印订单详情
   */
  private logOrderDetails(order: Order): void {
    console.log('  - New order details:')
    console.log('    📋 Order ID:', order.id)
    console.log('    🔢 Order No:', order.order_no)
    console.log('    📈 Symbol:', order.symbol)
    console.log('    📊 Market:', order.market)
    console.log('    🔄 Side:', order.side)
    console.log('    💰 Price:', order.price)
    console.log('    📦 Quantity:', order.quantity)
    console.log('    ⚙️ Order Type:', order.order_type)
    console.log('    📌 Status:', order.status)
  }

  /**
   * 打印成交详情
   */
  private logTradeDetails(trades: Trade[]): void {
    trades.forEach((trade, index) => {
      console.log(`  📈 成交 ${index + 1}:`)
      console.log(`    🔢 订单号: ${trade.order_id}`)
      console.log(`    📊 股票: ${trade.symbol} (${trade.market})`)
      console.log(`    🔄 方向: ${trade.side}`)
      console.log(`    💰 价格: $${trade.price}`)
      console.log(`    📦 数量: ${trade.quantity}`)
      console.log(`    💵 总额: $${(trade.price * trade.quantity).toFixed(2)}`)
      console.log(`    🏦 手续费: $${trade.commission}`)
      console.log(`    ⏰ 时间: ${new Date(trade.trade_time).toLocaleTimeString()}`)
    })
  }
}
