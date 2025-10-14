import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import './index.css'
import { LanguageProvider } from '@/lib/i18n'
import Header from '@/components/layout/Header'

import Sidebar from '@/components/layout/Sidebar'
import type { Position, Order, Trade } from '@/components/trading/PositionsOrdersTrades'
import TradingDashboard from '@/pages/TradingDashboard'
import AssetTrend from '@/pages/AssetTrend'
import Documentation from '@/pages/Documentation'
import type { Overview } from '@/types/overview'
import tradingApi from '@/lib/api'
import { tradingStorage } from '@/lib/storage'
import { executePlaceOrder, checkAndFillOrders, executeCancelOrder } from '@/lib/orderExecutor'
import { marketDataService } from '@/lib/marketData'
import { priceHistoryService } from '@/lib/priceHistory'

function App() {
  const [userId, setUserId] = useState<number | null>(null)
  
  // 从本地存储初始化数据
  const initializeFromStorage = () => {
    if (!tradingStorage.isInitialized()) {
      tradingStorage.initialize()
    }
    return {
      overview: tradingStorage.getOverview(),
      positions: tradingStorage.getPositions(),
      orders: tradingStorage.getOrders(),
      trades: tradingStorage.getTrades(),
    }
  }

  const initialData = initializeFromStorage()
  const [overview, setOverview] = useState<Overview>(initialData.overview)
  const [positions, setPositions] = useState<Position[]>(initialData.positions)
  const [orders, setOrders] = useState<Order[]>(initialData.orders)
  const [trades, setTrades] = useState<Trade[]>(initialData.trades)
  const [cookieDialogOpen, setCookieDialogOpen] = useState(false)
  const [cookieInput, setCookieInput] = useState('')
  const [cookieError, setCookieError] = useState<string | null>(null)
  const [cookieSaving, setCookieSaving] = useState(false)
  const [cookieRequired, setCookieRequired] = useState(false)

  const openCookiePrompt = (message?: string) => {
    setCookieDialogOpen(true)
    setCookieRequired(true)
    if (message) {
      setCookieError(message)
    }
  }

  useEffect(() => {
    if ((window as any).isDocumentationPage) {
      return
    }

    // 直接设置用户ID（前端模拟）
    setUserId(1)

    // 清理90天前的历史价格数据
    priceHistoryService.cleanOldData(90)

    // 连接到后端仅用于获取行情数据
    tradingApi.connect()

    const unsubscribeOpen = tradingApi.onOpen(() => {
      tradingApi.bootstrap('demo', 100000)
      console.log('✅ Connected to market data server')
    })

    const unsubscribeMessage = tradingApi.onMessage((msg: any) => {
      if (!msg || typeof msg !== 'object') {
        return
      }

      if (msg.type === 'bootstrap_ok') {
        console.log('✅ Market data connection established')
      } else if (msg.type === 'snapshot') {
        // 只更新行情相关数据和汇率
        const mdStatus = msg.market_data || msg.overview?.market_data
        if (mdStatus?.status === 'error' && mdStatus?.code === 'XUEQIU_COOKIE_REQUIRED') {
          openCookiePrompt(mdStatus.message)
          setCookieSaving(false)
        } else if (mdStatus?.status === 'ok') {
          setCookieRequired(false)
          setCookieDialogOpen(false)
          setCookieError(null)
          setCookieSaving(false)
        }

        // 更新汇率到本地数据（如果后端提供）
        if (msg.overview?.exchange_rates) {
          setOverview(prev => {
            const updated = {
              ...prev,
              exchange_rates: msg.overview.exchange_rates,
              market_data: msg.overview.market_data ?? prev.market_data,
            }
            tradingStorage.saveOverview(updated)
            return updated
          })
        }

        // 更新行情价格到marketDataService（如果后端提供）
        if (Array.isArray(msg.positions) && msg.positions.length > 0) {
          // 批量更新行情（优化性能）
          const quotes = msg.positions
            .filter((pos: any) => pos.symbol && (pos.lastPrice || pos.current_price))
            .map((pos: any) => ({
              symbol: pos.symbol,
              current_price: pos.lastPrice || pos.current_price,
              timestamp: Date.now(),
            }))
          
          if (quotes.length > 0) {
            marketDataService.updateQuotes(quotes)
          }

          // 更新持仓的当前价格
          setPositions(prevPositions => {
            const updatedPositions = prevPositions.map(pos => {
              const backendPos = msg.positions.find((p: any) => p.symbol === pos.symbol)
              const price = backendPos?.lastPrice || backendPos?.current_price
              if (price) {
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
            return updatedPositions
          })
        }
      } else if (msg.type === 'xueqiu_cookie_updated') {
        console.log('🔐 Xueqiu cookie updated')
        setCookieSaving(false)
        setCookieError(null)
        setCookieDialogOpen(false)
        setCookieInput('')
        setCookieRequired(false)
        tradingApi.requestSnapshot()
      } else if (msg.type === 'error') {
        console.error('⚠️ Error:', msg.message)
        if (typeof msg.message === 'string' && msg.message.includes('Snowball cookie')) {
          setCookieSaving(false)
          openCookiePrompt(msg.message)
        }
      }
    })

    const unsubscribeClose = tradingApi.onClose(() => {
      console.log('⚠️ Market data connection closed')
    })

    return () => {
      unsubscribeOpen()
      unsubscribeMessage()
      unsubscribeClose()
    }
  }, [])

  // 定时刷新行情数据并检查订单成交
  useEffect(() => {
    if (!userId || (window as any).isDocumentationPage) {
      return
    }

    // 更新持仓列表（用于智能刷新）
    const positionSymbols = positions.map(p => p.symbol)
    const pendingOrderSymbols = orders.filter(o => o.status === 'pending').map(o => o.symbol)
    const allSymbols = [...new Set([...positionSymbols, ...pendingOrderSymbols])]
    marketDataService.updatePositions(allSymbols)

    // 启动行情智能刷新（每5秒检查，但根据市场时间智能决定是否请求）
    marketDataService.startAutoRefresh(5000)

    // 订阅行情变化，当行情更新时检查订单
    const unsubscribe = marketDataService.subscribe(() => {
      // 检查是否有待成交订单
      const hasPendingOrders = orders.some(o => o.status === 'pending')
      if (!hasPendingOrders) {
        return
      }

      // 尝试撮合订单
      const result = checkAndFillOrders(overview, positions, orders, trades)
      
      if (result.filledCount > 0) {
        console.log(`✅ ${result.filledCount} 个订单已成交`)
        
        // 更新状态
        setOverview(result.overview)
        setPositions(result.positions)
        setOrders(result.orders)
        setTrades(result.trades)

        // 保存到本地存储
        tradingStorage.saveOverview(result.overview)
        tradingStorage.savePositions(result.positions)
        tradingStorage.saveOrders(result.orders)
        tradingStorage.saveTrades(result.trades)
      }
    })

    return () => {
      marketDataService.stopAutoRefresh()
      unsubscribe()
    }
  }, [userId, overview, positions, orders, trades])

  const handleCookieSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const value = cookieInput.trim()
    if (!value) {
      setCookieError('请输入雪球 Cookie')
      return
    }

    if (!tradingApi.isSocketOpen()) {
      setCookieError('交易连接未就绪')
      return
    }

    setCookieSaving(true)
    setCookieError(null)
    tradingApi.setXueqiuCookie(value)
  }

  const placeOrder = (payload: any) => {
    // 前端模拟下单逻辑
    const result = executePlaceOrder(payload, overview, positions, orders, trades)
    
    if (!result.success) {
      window.alert(result.message || '下单失败')
      return
    }

    // 更新状态（订单状态为pending，等待行情匹配）
    setOverview(result.overview)
    setOrders(result.orders)
    
    // 保存到本地存储
    tradingStorage.saveOverview(result.overview)
    tradingStorage.saveOrders(result.orders)

    console.log('📝 订单已提交，等待行情匹配:', result.message)

    // 立即刷新行情，加快首次撮合
    marketDataService.requestRefresh()
  }

  const cancelOrder = (orderNo: string) => {
    // 前端模拟撤单逻辑
    const result = executeCancelOrder(orderNo, overview, positions, orders, trades)
    
    if (!result.success) {
      window.alert(result.message || '撤单失败')
      return
    }

    // 更新状态
    setOverview(result.overview)
    setOrders(result.orders)
    
    // 保存到本地存储
    tradingStorage.saveOverview(result.overview)
    tradingStorage.saveOrders(result.orders)

    console.log('❌ 订单已取消:', result.message)
  }

  const cookieDialog = (
    <Dialog
      open={cookieDialogOpen}
      onOpenChange={(open) => {
        if (!open && cookieRequired) {
          return
        }
        setCookieDialogOpen(open)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>雪球 Cookie 配置</DialogTitle>
          <DialogDescription>
            请输入有效的雪球（xueqiu.com）Cookie，以便实时获取行情数据。可以在浏览器登录雪球后复制请求头中的 Cookie 字符串。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleCookieSubmit} className="space-y-3">
          <Input
            value={cookieInput}
            onChange={(e) => setCookieInput(e.target.value)}
            placeholder="xq_a_token=...; xq_id_token=..."
            disabled={cookieSaving}
          />
          {cookieError && <p className="text-xs text-red-500">{cookieError}</p>}
          <DialogFooter>
            <Button type="submit" disabled={cookieSaving}>
              {cookieSaving ? '保存中...' : '保存 Cookie'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )

  if (!userId) {
    return (
      <>
        <div className="p-8">Connecting to trading server...</div>
        {cookieDialog}
      </>
    )
  }

  return (
    <>
      <div className="h-screen flex overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex flex-col">
          <Header />
          <main className="flex-1 p-2 overflow-hidden">
            <Routes>
              <Route path="/" element={<Navigate to="/documentation" replace />} />
              <Route
                path="/trading"
                element={
                  <TradingDashboard
                    overview={overview}
                    positions={positions}
                    orders={orders}
                    trades={trades}
                    onPlaceOrder={placeOrder}
                    onCancelOrder={cancelOrder}
                  />
                }
              />
              <Route path="/asset-trend" element={<AssetTrend userId={userId} />} />
              <Route path="/documentation" element={<Documentation />} />
              <Route path="*" element={<Navigate to="/documentation" replace />} />
            </Routes>
          </main>
        </div>
      </div>
      {cookieDialog}
    </>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LanguageProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </LanguageProvider>
  </React.StrictMode>,
)
