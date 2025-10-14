import { useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/i18n'
import { tradingStorage } from '@/lib/storage'
import { priceHistoryService } from '@/lib/priceHistory'
import type { Trade } from '@/components/trading/PositionsOrdersTrades'

interface AssetTrendProps {
  userId: number | null
}

interface DailyAssetSnapshot {
  date: string
  cash_usd: number
  cash_hkd: number
  cash_cny: number
  positions_value_usd: number
  positions_value_hkd: number
  positions_value_cny: number
  total_usd: number
  total_hkd: number
  total_cny: number
  daily_change_usd: number
  daily_change_hkd: number
  daily_change_cny: number
}

const formatCurrency = (value: number | undefined, currency: string) => {
  const safeValue = value ?? 0
  const formatted = safeValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  
  switch (currency) {
    case 'USD': return `$${formatted}`
    case 'HKD': return `HK$${formatted}`
    case 'CNY': return `¥${formatted}`
    default: return formatted
  }
}

// 从股票代码提取市场/货币
const getCurrencyFromSymbol = (symbol: string): 'USD' | 'HKD' | 'CNY' => {
  if (symbol.endsWith('.HK')) return 'HKD'
  if (symbol.endsWith('.CN')) return 'CNY'
  return 'USD'
}

// 计算资产曲线
function calculateAssetTrend(trades: Trade[], overview: any): DailyAssetSnapshot[] {
  if (trades.length === 0) return []

  // 1. 找出最早的交易日期
  const tradeDates = trades.map(t => t.executed_at.split('T')[0])
  const earliestDate = tradeDates.sort()[0]
  
  // 2. 创建第一个点：交易前一天的初始资金
  const startDate = new Date(earliestDate + 'T00:00:00Z')
  startDate.setUTCDate(startDate.getUTCDate() - 1)
  const dayBeforeFirstTrade = startDate.toISOString().split('T')[0]
  
  const initialSnapshot: DailyAssetSnapshot = {
    date: dayBeforeFirstTrade,
    cash_usd: overview.user.initial_capital_usd,
    cash_hkd: overview.user.initial_capital_hkd,
    cash_cny: overview.user.initial_capital_cny,
    positions_value_usd: 0,
    positions_value_hkd: 0,
    positions_value_cny: 0,
    total_usd: overview.user.initial_capital_usd,
    total_hkd: overview.user.initial_capital_hkd,
    total_cny: overview.user.initial_capital_cny,
    daily_change_usd: 0,
    daily_change_hkd: 0,
    daily_change_cny: 0,
  }

  // 3. 按日期分组交易记录
  const tradesByDate = trades.reduce((acc, trade) => {
    const date = trade.executed_at.split('T')[0]
    if (!acc[date]) acc[date] = []
    acc[date].push(trade)
    return acc
  }, {} as Record<string, Trade[]>)

  // 4. 获取所有有交易的日期，排序
  const allTradeDates = Object.keys(tradesByDate).sort()

  // 5. 计算每日资产
  const snapshots: DailyAssetSnapshot[] = [initialSnapshot]
  
  // 追踪每个币种的现金和持仓
  let cash_usd = overview.user.initial_capital_usd
  let cash_hkd = overview.user.initial_capital_hkd
  let cash_cny = overview.user.initial_capital_cny
  
  // 持仓：symbol -> quantity
  const positions: Record<string, number> = {}
  
  allTradeDates.forEach(date => {
    const dayTrades = tradesByDate[date] || []
    
    // 处理当天所有交易
    dayTrades.forEach(trade => {
      const currency = getCurrencyFromSymbol(trade.symbol)
      const totalCost = trade.price * trade.quantity + trade.commission
      
      if (trade.side.toLowerCase() === 'buy') {
        // 买入：扣除现金，增加持仓
        if (currency === 'USD') cash_usd -= totalCost
        else if (currency === 'HKD') cash_hkd -= totalCost
        else if (currency === 'CNY') cash_cny -= totalCost
        
        positions[trade.symbol] = (positions[trade.symbol] || 0) + trade.quantity
      } else {
        // 卖出：增加现金，减少持仓
        if (currency === 'USD') cash_usd += (trade.price * trade.quantity - trade.commission)
        else if (currency === 'HKD') cash_hkd += (trade.price * trade.quantity - trade.commission)
        else if (currency === 'CNY') cash_cny += (trade.price * trade.quantity - trade.commission)
        
        positions[trade.symbol] = (positions[trade.symbol] || 0) - trade.quantity
        if (positions[trade.symbol] <= 0) {
          delete positions[trade.symbol]
        }
      }
    })
    
    // 获取当天收盘价，计算持仓市值
    const priceSnapshot = priceHistoryService.getDailySnapshot(date)
    let positions_value_usd = 0
    let positions_value_hkd = 0
    let positions_value_cny = 0
    
    Object.entries(positions).forEach(([symbol, quantity]) => {
      const price = priceSnapshot?.prices[symbol]
      if (price && quantity > 0) {
        const marketValue = price * quantity
        const currency = getCurrencyFromSymbol(symbol)
        
        if (currency === 'USD') positions_value_usd += marketValue
        else if (currency === 'HKD') positions_value_hkd += marketValue
        else if (currency === 'CNY') positions_value_cny += marketValue
      }
    })
    
    const total_usd = cash_usd + positions_value_usd
    const total_hkd = cash_hkd + positions_value_hkd
    const total_cny = cash_cny + positions_value_cny
    
    const prevSnapshot = snapshots[snapshots.length - 1]
    
    snapshots.push({
      date,
      cash_usd,
      cash_hkd,
      cash_cny,
      positions_value_usd,
      positions_value_hkd,
      positions_value_cny,
      total_usd,
      total_hkd,
      total_cny,
      daily_change_usd: total_usd - prevSnapshot.total_usd,
      daily_change_hkd: total_hkd - prevSnapshot.total_hkd,
      daily_change_cny: total_cny - prevSnapshot.total_cny,
    })
  })

  return snapshots
}

export default function AssetTrend({ userId }: AssetTrendProps) {
  const { t } = useTranslation()
  const [snapshots, setSnapshots] = useState<DailyAssetSnapshot[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedCurrency, setSelectedCurrency] = useState<'USD' | 'HKD' | 'CNY'>('USD')

  useEffect(() => {
    if (!userId) {
      setSnapshots([])
      return
    }

    setLoading(true)

    try {
      // 获取所有交易记录和初始资金
      const trades = tradingStorage.getTrades()
      const overview = tradingStorage.getOverview()
      
      if (trades.length === 0) {
        setSnapshots([])
        setLoading(false)
        return
      }

      // 计算资产曲线
      const calculatedSnapshots = calculateAssetTrend(trades, overview)
      setSnapshots(calculatedSnapshots)
    } catch (error) {
      console.error('计算资产曲线失败:', error)
      setSnapshots([])
    } finally {
      setLoading(false)
    }
  }, [userId])

  const chartData = useMemo(() => {
    if (!snapshots.length) return { series: [], totals: [], initialTotal: 0 }
    
    const getValue = (snapshot: DailyAssetSnapshot) => {
      switch (selectedCurrency) {
        case 'USD': return snapshot.total_usd
        case 'HKD': return snapshot.total_hkd
        case 'CNY': return snapshot.total_cny
      }
    }
    
    const series = snapshots.map(snapshot => ({
      label: snapshot.date,
      value: getValue(snapshot)
    }))
    
    const totals = series.map(s => s.value)
    const initialTotal = snapshots[0] ? getValue(snapshots[0]) : 0
    
    return { series, totals, initialTotal }
  }, [snapshots, selectedCurrency])

  const { series: chartSeries, totals, initialTotal } = chartData
  const minValue = totals.length ? Math.min(...totals) : 0
  const maxValue = totals.length ? Math.max(...totals) : 0
  const range = maxValue - minValue || 1
  const width = 640
  const height = 240
  const padding = 32

  const polylinePoints = chartSeries
    .map((point, index) => {
      const x =
        chartSeries.length === 1
          ? width / 2
          : (index / (chartSeries.length - 1)) * (width - padding * 2) + padding
      const y =
        height -
        padding -
        ((point.value - minValue) / range) * (height - padding * 2)
      return `${x},${y}`
    })
    .join(' ')

  return (
    <div className="space-y-4 overflow-y-auto h-full pr-2">
      <Card className="p-4">
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="text-sm text-muted-foreground mb-1">
              初始资金 ({selectedCurrency})
            </div>
            <div className="text-2xl font-semibold text-blue-600">
              {formatCurrency(initialTotal, selectedCurrency)}
            </div>
          </div>
          <div className="flex gap-2">
            {(['USD', 'HKD', 'CNY'] as const).map(currency => (
              <Button
                key={currency}
                variant={selectedCurrency === currency ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedCurrency(currency)}
                className="text-xs"
              >
                {currency}
              </Button>
            ))}
          </div>
        </div>
        {loading && (
          <div className="text-sm text-muted-foreground">
            加载中...
          </div>
        )}
        {!loading && snapshots.length === 0 && (
          <div className="text-sm text-muted-foreground">
            暂无交易记录
          </div>
        )}
      </Card>

      {snapshots.length > 0 && (
        <>
          <Card className="p-4">
            <h2 className="text-lg font-medium mb-4">{t('assetTrend.chartTitle')}</h2>
            <div className="overflow-x-auto">
              <svg viewBox={`0 0 ${width} ${height}`} className="w-full max-w-full">
                <defs>
                  <linearGradient id="assetTrendGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563eb" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <polyline
                  fill="none"
                  stroke="#2563eb"
                  strokeWidth={3}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  points={polylinePoints}
                />
                <polygon
                  fill="url(#assetTrendGradient)"
                  points={`${polylinePoints} ${width - padding},${height - padding} ${padding},${height - padding}`}
                />
                {chartSeries.map((point, index) => {
                  const x =
                    chartSeries.length === 1
                      ? width / 2
                      : (index / (chartSeries.length - 1)) * (width - padding * 2) + padding
                  const y =
                    height -
                    padding -
                    ((point.value - minValue) / range) * (height - padding * 2)
                  return <circle key={point.label} cx={x} cy={y} r={4} fill="#2563eb" />
                })}
              </svg>
            </div>
            <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
              {chartSeries.map((point) => (
                <div key={point.label} className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  <span>{point.label}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="text-lg font-medium mb-4">资产明细 ({selectedCurrency})</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4 font-medium">日期</th>
                    <th className="py-2 pr-4 font-medium">日涨跌</th>
                    <th className="py-2 pr-4 font-medium">现金</th>
                    <th className="py-2 pr-4 font-medium">持仓市值</th>
                    <th className="py-2 font-medium">总资产</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshots.map((point) => {
                    const cash = selectedCurrency === 'USD' ? point.cash_usd : selectedCurrency === 'HKD' ? point.cash_hkd : point.cash_cny
                    const posValue = selectedCurrency === 'USD' ? point.positions_value_usd : selectedCurrency === 'HKD' ? point.positions_value_hkd : point.positions_value_cny
                    const total = selectedCurrency === 'USD' ? point.total_usd : selectedCurrency === 'HKD' ? point.total_hkd : point.total_cny
                    const dailyChange = selectedCurrency === 'USD' ? point.daily_change_usd : selectedCurrency === 'HKD' ? point.daily_change_hkd : point.daily_change_cny
                    
                    return (
                      <tr key={point.date} className="border-t">
                        <td className="py-2 pr-4">{point.date}</td>
                        <td className={`py-2 pr-4 ${dailyChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {dailyChange >= 0 ? '+' : ''}
                          {formatCurrency(dailyChange, selectedCurrency)}
                        </td>
                        <td className="py-2 pr-4">{formatCurrency(cash, selectedCurrency)}</td>
                        <td className="py-2 pr-4">{formatCurrency(posValue, selectedCurrency)}</td>
                        <td className="py-2 font-semibold">{formatCurrency(total, selectedCurrency)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
