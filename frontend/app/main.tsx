import React, { useEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import './index.css'
import { LanguageProvider, useTranslation } from '@/lib/i18n'
import Header from '@/components/layout/Header'

// Create a module-level WebSocket singleton to avoid duplicate connections in React StrictMode
let __WS_SINGLETON__: WebSocket | null = null;

import Sidebar from '@/components/layout/Sidebar'
import TradingPanel from '@/components/trading/TradingPanel'
import MultiCurrencyBalance from '@/components/portfolio/MultiCurrencyBalance'
import PositionsOrdersTrades, { Position, Order, Trade } from '@/components/trading/PositionsOrdersTrades'

interface CurrencyBalance {
  initial_capital: number
  current_cash: number
  frozen_cash: number
}

interface User {
  id: number
  username: string
  initial_capital_usd: number
  current_cash_usd: number
  frozen_cash_usd: number
  initial_capital_hkd: number
  current_cash_hkd: number
  frozen_cash_hkd: number
  initial_capital_cny: number
  current_cash_cny: number
  frozen_cash_cny: number
}

interface MarketDataStatus {
  status: 'ok' | 'error'
  code?: string
  message?: string
}

interface Overview { 
  user: User
  balances_by_currency: {
    usd: CurrencyBalance
    hkd: CurrencyBalance
    cny: CurrencyBalance
  }
  total_assets_usd: number
  positions_value_usd: number
  positions_value_by_currency: { usd: number; hkd: number; cny: number }
  market_data?: MarketDataStatus
}
function App() {
  const { t } = useTranslation()
  const [userId, setUserId] = useState<number | null>(null)
  const [overview, setOverview] = useState<Overview | null>(null)
  const [positions, setPositions] = useState<Position[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [trades, setTrades] = useState<Trade[]>([])
  const [cookieDialogOpen, setCookieDialogOpen] = useState(false)
  const [cookieInput, setCookieInput] = useState('')
  const [cookieError, setCookieError] = useState<string | null>(null)
  const [cookieSaving, setCookieSaving] = useState(false)
  const [cookieRequired, setCookieRequired] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)

  const openCookiePrompt = (message?: string) => {
    setCookieDialogOpen(true)
    setCookieRequired(true)
    if (message) {
      setCookieError(message)
    }
  }

  const handleCookieSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setCookieError('交易连接未就绪')
      return
    }
    const value = cookieInput.trim()
    if (!value) {
      setCookieError('请输入雪球 Cookie')
      return
    }
    setCookieSaving(true)
    setCookieError(null)
    wsRef.current.send(JSON.stringify({
      type: 'set_xueqiu_cookie',
      cookie_string: value,
    }))
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

  useEffect(() => {
    let ws = __WS_SINGLETON__
    const created = !ws || ws.readyState === WebSocket.CLOSING || ws.readyState === WebSocket.CLOSED
    if (created) {
      ws = new WebSocket('ws://localhost:2314/ws')
      __WS_SINGLETON__ = ws
    }
    wsRef.current = ws!

    const handleOpen = () => {
      ws!.send(JSON.stringify({ type: 'bootstrap', username: 'demo', initial_capital: 100000 }))
    }
    const handleMessage = (e: MessageEvent) => {
      const msg = JSON.parse(e.data)
      if (msg.type === 'bootstrap_ok') {
        setUserId(msg.user.id)
        console.log('✅ Connected to trading server')
      } else if (msg.type === 'snapshot') {
        setOverview(msg.overview)
        setPositions(msg.positions)
        setOrders(msg.orders)
        setTrades(msg.trades || [])
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
      } else if (msg.type === 'trades') {
        setTrades(msg.trades || [])
      } else if (msg.type === 'order_placed') {
        console.log('📝 Order placed:', msg.order_id, 'Status:', msg.status)
        // Snapshot will be sent automatically
      } else if (msg.type === 'order_filled') {
        console.log('✅ Order filled:', msg.order_id)
        // Snapshot will be sent automatically
      } else if (msg.type === 'order_cancelled') {
        console.log('❌ Order cancelled:', msg.order_no)
        // Snapshot will be sent automatically
      } else if (msg.type === 'hk_stock_info') {
        console.log('📋 HK Stock Info:', msg.symbol, msg.info)
        // This will be handled by TradingPanel if needed
      } else if (msg.type === 'hk_stock_info_error') {
        console.error('⚠️ HK Stock Info Error:', msg.symbol, msg.message)
      } else if (msg.type === 'xueqiu_cookie_updated') {
        console.log('🔐 Xueqiu cookie updated')
        setCookieSaving(false)
        setCookieError(null)
        setCookieDialogOpen(false)
        setCookieInput('')
        setCookieRequired(false)
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'get_snapshot' }))
        }
      } else if (msg.type === 'error') {
        console.error('⚠️ Error:', msg.message)
        if (typeof msg.message === 'string' && msg.message.includes('Snowball cookie')) {
          setCookieSaving(false)
          openCookiePrompt(msg.message)
        } else {
          alert(`Error: ${msg.message}`)
        }
      }
    }
    const handleClose = () => {
      // When server closes, clear singleton so a new connection can be created later
      __WS_SINGLETON__ = null
      if (wsRef.current === ws) wsRef.current = null
    }

    ws!.addEventListener('open', handleOpen)
    ws!.addEventListener('message', handleMessage)
    ws!.addEventListener('close', handleClose)

    return () => {
      // Detach listeners but do not close the socket to avoid duplicate connect/disconnect in StrictMode
      ws!.removeEventListener('open', handleOpen)
      ws!.removeEventListener('message', handleMessage)
      ws!.removeEventListener('close', handleClose)
    }
  }, [])

  useEffect(() => {
    if (!userId) {
      return
    }
    const intervalId = setInterval(() => {
      const ws = wsRef.current
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'get_snapshot' }))
      }
    }, 10000)

    return () => clearInterval(intervalId)
  }, [userId])

  const placeOrder = (payload: any) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn('WS not connected, cannot place order')
      return
    }
    wsRef.current.send(JSON.stringify({ type: 'place_order', ...payload }))
  }

  const cancelOrder = (orderNo: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn('WS not connected, cannot cancel order')
      return
    }
    wsRef.current.send(JSON.stringify({ type: 'cancel_order', order_no: orderNo }))
  }

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
        <Sidebar wsRef={wsRef} />
        <div className="flex-1 flex flex-col">
         <Header />
         <main className="flex-1 p-2 overflow-hidden">
          <div className="mb-2">
            <MultiCurrencyBalance 
              balances={overview.balances_by_currency}
              totalAssetsUsd={overview.total_assets_usd}
              positionsValueUsd={overview.positions_value_usd}
              positionsValueByCurrency={overview.positions_value_by_currency}
            />
          </div>
          <div className="flex gap-2 h-[calc(100vh-400px)]">
            {/* Trading Panel - Left Side */}
            <div className="flex-shrink-0">
              <TradingPanel 
                onPlace={placeOrder}
                balances={overview.balances_by_currency}
                wsRef={wsRef}
              />
            </div>

            {/* Tabbed Content - Right Side */}
            <div className="flex-1 overflow-hidden">
              <PositionsOrdersTrades
                positions={positions}
                orders={orders}
                trades={trades}
                onCancel={cancelOrder}
              />
            </div>
          </div>
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
      <App />
    </LanguageProvider>
  </React.StrictMode>,
)
