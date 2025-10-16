import React, { useEffect, useState, useRef } from 'react'
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
import { priceHistoryService } from '@/lib/priceHistory'
import { TradingLogic } from '@/lib/tradingLogic'
import { handleWebSocketMessage } from '@/lib/websocketHandler'
import type { PlaceOrderPayload } from '@/lib/tradingLogic'

function App() {
  const [userId, setUserId] = useState<number | null>(null)
  
  // 初始化交易逻辑
  const tradingLogicRef = useRef<TradingLogic | null>(null)
  
  const [overview, setOverview] = useState<Overview | null>(null)
  const [positions, setPositions] = useState<Position[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [trades, setTrades] = useState<Trade[]>([])
  const [cookieDialogOpen, setCookieDialogOpen] = useState(false)
  const [cookieInput, setCookieInput] = useState('')
  const [cookieError, setCookieError] = useState<string | null>(null)
  const [cookieSaving, setCookieSaving] = useState(false)
  const [cookieRequired, setCookieRequired] = useState(false)

  // 初始化交易逻辑实例
  if (!tradingLogicRef.current) {
    tradingLogicRef.current = new TradingLogic({
      onStateUpdate: (state) => {
        setOverview(state.overview)
        setPositions(state.positions)
        setOrders(state.orders)
        setTrades(state.trades)
      },
      onOrderFilled: () => {
        // 可以在这里添加通知逻辑
      },
      onError: (message) => {
        window.alert(message)
      },
    })
    tradingLogicRef.current.initialize()
    const initialState = tradingLogicRef.current.getState()
    setOverview(initialState.overview)
    setPositions(initialState.positions)
    setOrders(initialState.orders)
    setTrades(initialState.trades)
  }

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
      
      // Subscribe to quotes for current positions
      if (tradingLogicRef.current) {
        const currentState = tradingLogicRef.current.getState()
        const symbolsToSubscribe = currentState.positions.map(pos => pos.symbol)
        if (symbolsToSubscribe.length > 0) {
          console.log('📌 [main.tsx] Subscribing to quotes for positions:', symbolsToSubscribe)
          tradingApi.subscribeQuotes(symbolsToSubscribe)
        }
      }
    })

    const unsubscribeMessage = tradingApi.onMessage((msg: any) => {
      console.log('📨 [main.tsx] 收到 WebSocket 消息:', msg?.type)
      handleWebSocketMessage(msg, {
        onCookieRequired: (message) => {
          console.log('🔐 [main.tsx] Cookie required:', message)
          openCookiePrompt(message)
          setCookieSaving(false)
        },
        onCookieUpdated: () => {
          console.log('✅ [main.tsx] Cookie updated')
          setCookieSaving(false)
          setCookieError(null)
          setCookieDialogOpen(false)
          setCookieInput('')
          setCookieRequired(false)
          tradingApi.requestSnapshot()
        },
        onPositionsUpdate: (updatedPositions) => {
          console.log('📊 [main.tsx] 持仓更新:', updatedPositions.length, '个')
          // 只更新持仓的行情价格，其他数据来自 localStorage
          tradingLogicRef.current?.updateState({ positions: updatedPositions })
        },
        onOrdersFilled: (filledCount) => {
          console.log('🎉 [main.tsx] 订单成交:', filledCount, '个')
          // 从 localStorage 重新加载所有数据，确保 UI 同步
          if (tradingLogicRef.current) {
            const state = tradingLogicRef.current.getState()
            setOverview(state.overview)
            setPositions(state.positions)
            setOrders(state.orders)
            setTrades(state.trades)
            
            // Subscribe to quotes for any new positions
            const symbolsToSubscribe = state.positions.map(pos => pos.symbol)
            if (symbolsToSubscribe.length > 0) {
              console.log('📌 [main.tsx] Subscribing to quotes after order fill:', symbolsToSubscribe)
              tradingApi.subscribeQuotes(symbolsToSubscribe)
            }
          }
        },
      })
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

  // 启动自动交易逻辑
  useEffect(() => {
    if (!userId || (window as any).isDocumentationPage || !tradingLogicRef.current) {
      return
    }

    tradingLogicRef.current.startAutoTrading({ overview: overview!, positions, orders, trades })

    return () => {
      tradingLogicRef.current?.stopAutoTrading()
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

  const placeOrder = (payload: PlaceOrderPayload) => {
    tradingLogicRef.current?.placeOrder(payload)
  }

  const cancelOrder = (orderNo: string) => {
    tradingLogicRef.current?.cancelOrder(orderNo)
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

  if (!userId || !overview) {
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
