import MultiCurrencyBalance from '@/components/portfolio/MultiCurrencyBalance'
import TradingPanel from '@/components/trading/TradingPanel'
import PositionsOrdersTrades, { type Order, type Position, type Trade } from '@/components/trading/PositionsOrdersTrades'
import type { Overview } from '@/types/overview'

interface TradingDashboardProps {
  overview: Overview
  positions: Position[]
  orders: Order[]
  trades: Trade[]
  onPlaceOrder: (payload: any) => void
  onCancelOrder: (orderNo: string) => void
}

export default function TradingDashboard({
  overview,
  positions,
  orders,
  trades,
  onPlaceOrder,
  onCancelOrder,
}: TradingDashboardProps) {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="mb-2">
        <MultiCurrencyBalance
          balances={overview.balances_by_currency}
          totalAssetsUsd={overview.total_assets_usd}
          positionsValueUsd={overview.positions_value_usd}
          positionsValueByCurrency={overview.positions_value_by_currency}
        />
      </div>
      <div className="flex gap-2 flex-1">
        <div className="flex-shrink-0">
          <TradingPanel onPlace={onPlaceOrder} balances={overview.balances_by_currency} />
        </div>
        <div className="flex-1 overflow-hidden">
          <PositionsOrdersTrades positions={positions} orders={orders} trades={trades} onCancel={onCancelOrder} />
        </div>
      </div>
    </div>
  )
}
