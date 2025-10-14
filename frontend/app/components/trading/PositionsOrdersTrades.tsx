import React from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/i18n'

export interface Position {
  id: number
  symbol: string
  market: string
  quantity: number
  avg_cost: number
  current_price: number
  market_value: number
  pnl: number
  pnl_percent: number
  created_at: string
  updated_at: string
}

export interface Order {
  id: number
  order_no: string
  symbol: string
  name: string
  market: string
  side: string
  order_type: string
  price?: number
  quantity: number
  filled_quantity: number
  status: string
}

export interface Trade {
  id: number
  order_id: number
  user_id: number
  symbol: string
  name: string
  market: string
  side: string
  price: number
  quantity: number
  commission: number
  exchange_rate: number
  trade_time: string
}

interface PositionsOrdersTradesProps {
  positions: Position[]
  orders: Order[]
  trades: Trade[]
  onCancel: (orderNo: string) => void
}

const getStatusBadge = (status: string) => {
  const upperStatus = status.toUpperCase()
  switch (upperStatus) {
    case 'PENDING':
      return <span className="px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded">⏳ PENDING</span>
    case 'FILLED':
      return <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded">✅ FILLED</span>
    case 'CANCELLED':
      return <span className="px-2 py-1 text-xs bg-red-100 text-red-800 rounded">❌ CANCELLED</span>
    default:
      return <span className="px-2 py-1 text-xs bg-gray-100 text-gray-800 rounded">{status}</span>
  }
}

const getSideBadge = (side: string) => {
  const upperSide = side.toUpperCase()
  return upperSide === 'BUY'
    ? <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded font-medium">BUY</span>
    : <span className="px-2 py-1 text-xs bg-red-100 text-red-800 rounded font-medium">SELL</span>
}

const OrderBook: React.FC<{ orders: Order[]; onCancel: (orderNo: string) => void }> = ({ orders, onCancel }) => (
  <div>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Order No</TableHead>
          <TableHead>Symbol</TableHead>
          <TableHead>Side</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Price</TableHead>
          <TableHead>Qty</TableHead>
          <TableHead>Filled</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.map((o) => (
          <TableRow key={o.id}>
            <TableCell className="font-mono text-sm">{o.order_no}</TableCell>
            <TableCell className="font-medium">{o.symbol}.{o.market}</TableCell>
            <TableCell>{getSideBadge(o.side)}</TableCell>
            <TableCell>{o.order_type}</TableCell>
            <TableCell>{o.price ? `$${o.price.toFixed(2)}` : 'MARKET'}</TableCell>
            <TableCell>{o.quantity}</TableCell>
            <TableCell>{o.filled_quantity}</TableCell>
            <TableCell>{getStatusBadge(o.status)}</TableCell>
            <TableCell>
              {o.status.toUpperCase() === 'PENDING' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onCancel(o.order_no)}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  Cancel
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
    {orders.length === 0 && (
      <div className="text-center py-8 text-gray-500">
        No orders yet. Place your first order using the trading panel.
      </div>
    )}
  </div>
)

const PositionList: React.FC<{ positions: Position[] }> = ({ positions }) => (
  <div>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Symbol</TableHead>
          <TableHead>Qty</TableHead>
          <TableHead>Avg Cost</TableHead>
          <TableHead>Last Price</TableHead>
          <TableHead>Market Value</TableHead>
          <TableHead>P&L</TableHead>
          <TableHead>P&L %</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {positions.map((p) => (
          <TableRow key={p.id}>
            <TableCell className="font-medium">{p.symbol}</TableCell>
            <TableCell>{p.quantity}</TableCell>
            <TableCell>{p.avg_cost.toFixed(4)}</TableCell>
            <TableCell className="font-medium">{p.current_price.toFixed(4)}</TableCell>
            <TableCell>{p.market_value.toFixed(2)}</TableCell>
            <TableCell className={p.pnl >= 0 ? 'text-green-600' : 'text-red-600'}>
              {p.pnl >= 0 ? '+' : ''}{p.pnl.toFixed(2)}
            </TableCell>
            <TableCell className={p.pnl_percent >= 0 ? 'text-green-600' : 'text-red-600'}>
              {p.pnl_percent >= 0 ? '+' : ''}{p.pnl_percent.toFixed(2)}%
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
    {positions.length === 0 && (
      <div className="text-center py-8 text-gray-500">
        No positions yet. Buy some stocks to start trading.
      </div>
    )}
  </div>
)

const TradeHistory: React.FC<{ trades: Trade[] }> = ({ trades }) => (
  <div>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Time</TableHead>
          <TableHead>Order ID</TableHead>
          <TableHead>Symbol</TableHead>
          <TableHead>Side</TableHead>
          <TableHead>Price</TableHead>
          <TableHead>Qty</TableHead>
          <TableHead>Commission</TableHead>
          <TableHead>FX</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {trades.map((t) => (
          <TableRow key={t.id}>
            <TableCell>{new Date(t.trade_time).toLocaleString()}</TableCell>
            <TableCell>{t.order_id}</TableCell>
            <TableCell>{t.symbol}.{t.market}</TableCell>
            <TableCell>{t.side}</TableCell>
            <TableCell>{t.price != null ? t.price.toFixed(4) : '-'}</TableCell>
            <TableCell>{t.quantity}</TableCell>
            <TableCell>{t.commission != null ? t.commission.toFixed(4) : '-'}</TableCell>
            <TableCell>{t.exchange_rate != null ? t.exchange_rate.toFixed(4) : '-'}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
)

const PositionsOrdersTrades: React.FC<PositionsOrdersTradesProps> = ({ positions, orders, trades, onCancel }) => {
  const { t } = useTranslation()

  return (
    <Tabs defaultValue="positions" className="h-full flex flex-col">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="positions">{t('tabs.positions')}</TabsTrigger>
        <TabsTrigger value="orders">{t('tabs.orders')}</TabsTrigger>
        <TabsTrigger value="trades">{t('tabs.trades')}</TabsTrigger>
      </TabsList>

      <div className="flex-1 overflow-hidden">
        <TabsContent value="positions" className="h-full overflow-y-auto">
          <PositionList positions={positions} />
        </TabsContent>

        <TabsContent value="orders" className="h-full overflow-y-auto">
          <OrderBook orders={orders} onCancel={onCancel} />
        </TabsContent>

        <TabsContent value="trades" className="h-full overflow-y-auto">
          <TradeHistory trades={trades} />
        </TabsContent>
      </div>
    </Tabs>
  )
}

export default PositionsOrdersTrades
