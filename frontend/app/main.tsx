import React, { useEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import './index.css'

// Create a module-level WebSocket singleton to avoid duplicate connections in React StrictMode
let __WS_SINGLETON__: WebSocket | null = null;

import Header from '@/components/layout/Header'
import Sidebar from '@/components/layout/Sidebar'
import MarketStatus from '@/components/trading/MarketStatus'
import NetValueChart from '@/components/portfolio/NetValueChart'

interface Overview { user: { id: number; username: string; current_cash: number; initial_capital: number; frozen_cash: number }; total_assets: number; positions_value: number }
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
    <div className="h-screen flex flex-col">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 p-6 overflow-y-auto space-y-6">
          <div className="flex items-center justify-between">
            <h2 id="portfolio" className="text-xl font-semibold">Portfolio</h2>
            <MarketStatus />
          </div>

          <div className="grid grid-cols-3 gap-4 text-sm">
            <div className="rounded border p-3">
              <div className="text-muted-foreground">Cash</div>
              <div className="text-xl font-semibold">${overview.user.current_cash.toFixed(2)}</div>
            </div>
            <div className="rounded border p-3">
              <div className="text-muted-foreground">Positions Value</div>
              <div className="text-xl font-semibold">${overview.positions_value.toFixed(2)}</div>
            </div>
            <div className="rounded border p-3">
              <div className="text-muted-foreground">Total Assets</div>
              <div className="text-xl font-semibold">${overview.total_assets.toFixed(2)}</div>
            </div>
          </div>
          <NetValueChart />

          <h2 id="trading" className="text-xl font-semibold">Trading</h2>

          <div className="space-y-2">
            <OrderFormWS onPlace={placeOrder} />
          </div>

          <OrderBookWS orders={orders} />
          <PositionListWS positions={positions} />
          <TradeHistoryWS trades={trades} />
        </main>
      </div>
    </div>
  )
}

function OrderFormWS({ onPlace }: { onPlace: (payload: any) => void }) {
  const [symbol, setSymbol] = useState('AAPL')
  const [name, setName] = useState('Apple')
  const [market, setMarket] = useState<'US' | 'HK'>('US')
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY')
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('MARKET')
  const [price, setPrice] = useState<string>('')
  const [quantity, setQuantity] = useState<number>(100)

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <label className="text-sm">Symbol<Input value={symbol} onChange={(e) => setSymbol(e.target.value)} /></label>
        <label className="text-sm">Name<Input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="text-sm">Market
          <Select value={market} onValueChange={(v) => setMarket(v as 'US' | 'HK')}>
            <SelectTrigger>
              <SelectValue placeholder="Select market" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="US">US</SelectItem>
              <SelectItem value="HK">HK</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <label className="text-sm">Side
          <Select value={side} onValueChange={(v) => setSide(v as 'BUY' | 'SELL')}>
            <SelectTrigger>
              <SelectValue placeholder="Select side" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="BUY">BUY</SelectItem>
              <SelectItem value="SELL">SELL</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <label className="text-sm">Type
          <Select value={orderType} onValueChange={(v) => setOrderType(v as 'MARKET' | 'LIMIT')}>
            <SelectTrigger>
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="MARKET">MARKET</SelectItem>
              <SelectItem value="LIMIT">LIMIT</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <label className="text-sm">Price (if LIMIT)<Input value={price} onChange={(e) => setPrice(e.target.value)} /></label>
        <label className="text-sm">Quantity<Input type="number" value={quantity} onChange={(e) => setQuantity(parseInt(e.target.value || '0'))} /></label>
      </div>
      <Button onClick={() => onPlace({ symbol, name, market, side, order_type: orderType, price: price ? parseFloat(price) : undefined, quantity })}>Place Order</Button>
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
      <h3 className="text-lg font-semibold mt-6 mb-2">Trade History</h3>
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
