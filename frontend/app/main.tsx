import React, { useEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import './index.css'

// Create a module-level WebSocket singleton to avoid duplicate connections in React StrictMode
let __WS_SINGLETON__: WebSocket | null = null;

import Header from '@/components/layout/Header'
import Sidebar from '@/components/layout/Sidebar'
import MarketStatus from '@/components/trading/MarketStatus'
import TradingPanel from '@/components/trading/TradingPanel'
import MultiCurrencyBalance from '@/components/portfolio/MultiCurrencyBalance'

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

interface Overview { 
  user: User
  balances_by_currency: {
    usd: CurrencyBalance
    hkd: CurrencyBalance
    cny: CurrencyBalance
  }
  total_assets_usd: number
  positions_value_usd: number
}
interface Position { id: number; user_id: number; symbol: string; name: string; market: string; quantity: number; available_quantity: number; avg_cost: number }
interface Order { id: number; order_no: string; symbol: string; name: string; market: string; side: string; order_type: string; price?: number; quantity: number; filled_quantity: number; status: string }
interface Trade { id: number; order_id: number; user_id: number; symbol: string; name: string; market: string; side: string; price: number; quantity: number; commission: number; exchange_rate: number; trade_time: string }

function App() {
  const [userId, setUserId] = useState<number | null>(null)
  const [overview, setOverview] = useState<Overview | null>(null)
  const [positions, setPositions] = useState<Position[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [trades, setTrades] = useState<Trade[]>([])
  const wsRef = useRef<WebSocket | null>(null)

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
      } else if (msg.type === 'snapshot') {
        setOverview(msg.overview)
        setPositions(msg.positions)
        setOrders(msg.orders)
        setTrades(msg.trades || [])
      } else if (msg.type === 'trades') {
        setTrades(msg.trades || [])
      } else if (msg.type === 'order_filled') {
        // ignore, wait for snapshot
      } else if (msg.type === 'error') {
        console.error(msg.message)
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

  const placeOrder = (payload: any) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn('WS not connected, cannot place order')
      return
    }
    wsRef.current.send(JSON.stringify({ type: 'place_order', ...payload }))
  }

  if (!userId || !overview) return <div className="p-8">Connecting to trading server...</div>

  return (
    <div className="h-screen flex overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-6 overflow-hidden">
          <div className="flex items-center justify-between mb-6">
            <h2 id="portfolio" className="text-xl font-semibold">Portfolio</h2>
            <MarketStatus />
          </div>

          <div className="mb-6">
            <MultiCurrencyBalance 
              balances={overview.balances_by_currency}
              totalAssetsUsd={overview.total_assets_usd}
              positionsValueUsd={overview.positions_value_usd}
            />
          </div>
          <h2 id="trading" className="text-xl font-semibold mb-6">Trading</h2>

          <div className="flex gap-6 h-[calc(100vh-400px)]">
            {/* Trading Panel - Left Side */}
            <div className="flex-shrink-0">
              <TradingPanel 
                onPlace={placeOrder}
                balances={overview.balances_by_currency}
              />
            </div>

            {/* Tabbed Content - Right Side */}
            <div className="flex-1 overflow-hidden">
              <Tabs defaultValue="positions" className="h-full flex flex-col">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="positions">Positions</TabsTrigger>
                  <TabsTrigger value="orders">Orders</TabsTrigger>
                  <TabsTrigger value="trades">Trades</TabsTrigger>
                </TabsList>
                
                <div className="flex-1 overflow-hidden">
                  <TabsContent value="positions" className="h-full overflow-y-auto">
                    <PositionListWS positions={positions} />
                  </TabsContent>
                  
                  <TabsContent value="orders" className="h-full overflow-y-auto">
                    <OrderBookWS orders={orders} />
                  </TabsContent>
                  
                  <TabsContent value="trades" className="h-full overflow-y-auto">
                    <TradeHistoryWS trades={trades} />
                  </TabsContent>
                </div>
              </Tabs>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}


function OrderBookWS({ orders }: { orders: Order[] }) {
  return (
    <div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Time</TableHead><TableHead>Order No</TableHead><TableHead>Symbol</TableHead><TableHead>Side</TableHead><TableHead>Type</TableHead><TableHead>Price</TableHead><TableHead>Qty</TableHead><TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map(o => (
            <TableRow key={o.id}>
              <TableCell>{o.id}</TableCell>
              <TableCell>{o.order_no}</TableCell>
              <TableCell>{o.symbol}.{o.market}</TableCell>
              <TableCell>{o.side}</TableCell>
              <TableCell>{o.order_type}</TableCell>
              <TableCell>{o.price ?? '-'}</TableCell>
              <TableCell>{o.quantity}</TableCell>
              <TableCell>{o.status}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function PositionListWS({ positions }: { positions: Position[] }) {
  return (
    <div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Symbol</TableHead><TableHead>Name</TableHead><TableHead>Qty</TableHead><TableHead>Available</TableHead><TableHead>Avg Cost</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {positions.map(p => (
            <TableRow key={p.id}>
              <TableCell>{p.symbol}.{p.market}</TableCell>
              <TableCell>{p.name}</TableCell>
              <TableCell>{p.quantity}</TableCell>
              <TableCell>{p.available_quantity}</TableCell>
              <TableCell>{p.avg_cost.toFixed(4)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function TradeHistoryWS({ trades }: { trades: Trade[] }) {
  return (
    <div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Time</TableHead><TableHead>Order ID</TableHead><TableHead>Symbol</TableHead><TableHead>Side</TableHead><TableHead>Price</TableHead><TableHead>Qty</TableHead><TableHead>Commission</TableHead><TableHead>FX</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {trades.map(t => (
            <TableRow key={t.id}>
              <TableCell>{new Date(t.trade_time).toLocaleString()}</TableCell>
              <TableCell>{t.order_id}</TableCell>
              <TableCell>{t.symbol}.{t.market}</TableCell>
              <TableCell>{t.side}</TableCell>
              <TableCell>{t.price.toFixed(4)}</TableCell>
              <TableCell>{t.quantity}</TableCell>
              <TableCell>{t.commission.toFixed(4)}</TableCell>
              <TableCell>{t.exchange_rate.toFixed(4)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
