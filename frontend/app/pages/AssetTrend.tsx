import { useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/i18n'
import { tradingStorage } from '@/lib/storage'
import { calculateAssetTrend, validateAssetTrend, type DailyAssetSnapshot } from '@/lib/assetTrendCalculator'
import type { Trade } from '@/components/trading/PositionsOrdersTrades'

interface AssetTrendProps {
  userId: number | null
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

export default function AssetTrend({ userId }: AssetTrendProps) {
  const { t } = useTranslation()
  const [snapshots, setSnapshots] = useState<DailyAssetSnapshot[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedCurrency, setSelectedCurrency] = useState<'USD' | 'HKD' | 'CNY'>('USD')
  const [viewMode, setViewMode] = useState<'individual' | 'combined'>('individual')
  const [baseCurrency, setBaseCurrency] = useState<'USD' | 'HKD' | 'CNY'>('USD')

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
      
      console.log('📊 AssetTrend 加载数据:')
      console.log('  - 交易记录数量:', trades.length)
      console.log('  - 初始资金:', overview.user)
      
      if (trades.length === 0) {
        console.log('⚠️ 没有交易记录，显示空状态')
        setSnapshots([])
        setLoading(false)
        return
      }

      // 计算资产曲线
      const calculatedSnapshots = calculateAssetTrend(trades, overview)
      
      // 验证计算结果
      const isValid = validateAssetTrend(calculatedSnapshots, trades, overview)
      if (!isValid) {
        console.error('❌ 资产曲线计算验证失败')
        setSnapshots([])
        setLoading(false)
        return
      }
      
      console.log('✅ 资产曲线计算完成，数据点数量:', calculatedSnapshots.length)
      setSnapshots(calculatedSnapshots)
    } catch (error) {
      console.error('❌ 计算资产曲线失败:', error)
      setSnapshots([])
    } finally {
      setLoading(false)
    }
  }, [userId])

  // 获取汇率数据
  const exchangeRates = useMemo(() => {
    const overview = tradingStorage.getOverview()
    return overview.exchange_rates || { usd: 1, hkd: 0.1289, cny: 0.138 }
  }, [])

  // 汇率转换函数
  const convertToBaseCurrency = (amount: number, fromCurrency: string, toCurrency: string): number => {
    if (fromCurrency === toCurrency) return amount
    
    // 先转换为USD，再转换为目标货币
    const usdAmount = fromCurrency === 'USD' ? amount : 
                     fromCurrency === 'HKD' ? amount * exchangeRates.hkd :
                     fromCurrency === 'CNY' ? amount * exchangeRates.cny : amount
    
    return toCurrency === 'USD' ? usdAmount :
           toCurrency === 'HKD' ? usdAmount / exchangeRates.hkd :
           toCurrency === 'CNY' ? usdAmount / exchangeRates.cny : usdAmount
  }

  const chartData = useMemo(() => {
    if (!snapshots.length) return { series: [], totals: [], initialTotal: 0 }
    
    if (viewMode === 'individual') {
      const getValue = (snapshot: DailyAssetSnapshot) => {
        switch (selectedCurrency) {
          case 'USD': return snapshot.total_usd
          case 'HKD': return snapshot.total_hkd
          case 'CNY': return snapshot.total_cny
        }
      }
      
      const series = snapshots.map(snapshot => ({
        label: snapshot.date,
        value: getValue(snapshot),
        currency: selectedCurrency
      }))
      
      const totals = series.map(s => s.value)
      const initialTotal = snapshots[0] ? getValue(snapshots[0]) : 0
      
      return { series, totals, initialTotal }
    } else {
      // 合并视图：将所有货币转换为基准货币
      const series = snapshots.map(snapshot => {
        const usdValue = convertToBaseCurrency(snapshot.total_usd, 'USD', baseCurrency)
        const hkdValue = convertToBaseCurrency(snapshot.total_hkd, 'HKD', baseCurrency)
        const cnyValue = convertToBaseCurrency(snapshot.total_cny, 'CNY', baseCurrency)
        
        return {
          label: snapshot.date,
          value: usdValue + hkdValue + cnyValue,
          currency: baseCurrency,
          breakdown: {
            usd: usdValue,
            hkd: hkdValue,
            cny: cnyValue
          }
        }
      })
      
      const totals = series.map(s => s.value)
      const initialTotal = series[0]?.value || 0
      
      return { series, totals, initialTotal }
    }
  }, [snapshots, selectedCurrency, viewMode, baseCurrency, exchangeRates])

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
              初始资金 ({viewMode === 'individual' ? selectedCurrency : baseCurrency})
            </div>
            <div className="text-2xl font-semibold text-blue-600">
              {formatCurrency(initialTotal, viewMode === 'individual' ? selectedCurrency : baseCurrency)}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {/* 视图模式切换 */}
            <div className="flex gap-2">
              <Button
                variant={viewMode === 'individual' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('individual')}
                className="text-xs"
              >
                分市场
              </Button>
              <Button
                variant={viewMode === 'combined' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('combined')}
                className="text-xs"
              >
                账户总资产
              </Button>
            </div>
            
            {/* 货币选择 */}
            {viewMode === 'individual' ? (
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
            ) : (
              <div className="flex gap-2">
                <span className="text-xs text-muted-foreground py-1">基准货币:</span>
                {(['USD', 'HKD', 'CNY'] as const).map(currency => (
                  <Button
                    key={currency}
                    variant={baseCurrency === currency ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setBaseCurrency(currency)}
                    className="text-xs"
                  >
                    {currency}
                  </Button>
                ))}
              </div>
            )}
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
            <h2 className="text-lg font-medium mb-4">
              {viewMode === 'individual' 
                ? `资产曲线 - ${selectedCurrency} 市场` 
                : `账户总资产走势 (${baseCurrency})`}
            </h2>
            <div className="overflow-x-auto">
              <svg viewBox={`0 0 ${width} ${height}`} className="w-full max-w-full">
                <defs>
                  <linearGradient id="assetTrendGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563eb" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
                  </linearGradient>
                </defs>
                
                {/* 网格线 */}
                <g stroke="#e5e7eb" strokeWidth="0.5" opacity="0.5">
                  {/* 水平网格线 */}
                  {[0, 0.25, 0.5, 0.75, 1].map(ratio => {
                    const y = height - padding - ratio * (height - padding * 2)
                    const value = minValue + ratio * range
                    return (
                      <g key={ratio}>
                        <line x1={padding} y1={y} x2={width - padding} y2={y} />
                        <text
                          x={padding - 5}
                          y={y + 4}
                          textAnchor="end"
                          fontSize="10"
                          fill="#6b7280"
                        >
                          {formatCurrency(value, viewMode === 'individual' ? selectedCurrency : baseCurrency)}
                        </text>
                      </g>
                    )
                  })}
                  
                  {/* 垂直网格线 */}
                  {chartSeries.map((point, index) => {
                    if (chartSeries.length <= 1) return null
                    const x = (index / (chartSeries.length - 1)) * (width - padding * 2) + padding
                    return (
                      <g key={index}>
                        <line x1={x} y1={padding} x2={x} y2={height - padding} />
                        <text
                          x={x}
                          y={height - padding + 15}
                          textAnchor="middle"
                          fontSize="10"
                          fill="#6b7280"
                        >
                          {point.label.split('-').slice(1).join('/')}
                        </text>
                      </g>
                    )
                  })}
                </g>
                
                {/* 数据线和填充 */}
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
                
                {/* 数据点 */}
                {chartSeries.map((point, index) => {
                  const x =
                    chartSeries.length === 1
                      ? width / 2
                      : (index / (chartSeries.length - 1)) * (width - padding * 2) + padding
                  const y =
                    height -
                    padding -
                    ((point.value - minValue) / range) * (height - padding * 2)
                  return (
                    <g key={point.label}>
                      <circle cx={x} cy={y} r={4} fill="#2563eb" />
                      <circle cx={x} cy={y} r={6} fill="none" stroke="#2563eb" strokeWidth="2" opacity="0.3" />
                    </g>
                  )
                })}
              </svg>
            </div>
            
            {/* 图例和统计 */}
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="bg-blue-50 p-3 rounded">
                <div className="text-blue-600 font-medium">起始资金</div>
                <div className="text-lg font-semibold text-blue-800">
                  {formatCurrency(initialTotal, viewMode === 'individual' ? selectedCurrency : baseCurrency)}
                </div>
              </div>
              <div className={`p-3 rounded ${chartSeries.length > 0 ? 
                (chartSeries[chartSeries.length - 1].value >= initialTotal ? 'bg-green-50' : 'bg-red-50') : 'bg-gray-50'}`}>
                <div className={`font-medium ${chartSeries.length > 0 ? 
                  (chartSeries[chartSeries.length - 1].value >= initialTotal ? 'text-green-600' : 'text-red-600') : 'text-gray-600'}`}>
                  当前资产
                </div>
                <div className={`text-lg font-semibold ${chartSeries.length > 0 ? 
                  (chartSeries[chartSeries.length - 1].value >= initialTotal ? 'text-green-800' : 'text-red-800') : 'text-gray-800'}`}>
                  {chartSeries.length > 0 ? formatCurrency(chartSeries[chartSeries.length - 1].value, viewMode === 'individual' ? selectedCurrency : baseCurrency) : 'N/A'}
                </div>
              </div>
              <div className={`p-3 rounded ${chartSeries.length > 0 ? 
                (chartSeries[chartSeries.length - 1].value >= initialTotal ? 'bg-green-50' : 'bg-red-50') : 'bg-gray-50'}`}>
                <div className={`font-medium ${chartSeries.length > 0 ? 
                  (chartSeries[chartSeries.length - 1].value >= initialTotal ? 'text-green-600' : 'text-red-600') : 'text-gray-600'}`}>
                  总盈亏
                </div>
                <div className={`text-lg font-semibold ${chartSeries.length > 0 ? 
                  (chartSeries[chartSeries.length - 1].value >= initialTotal ? 'text-green-800' : 'text-red-800') : 'text-gray-800'}`}>
                  {chartSeries.length > 0 ? 
                    `${chartSeries[chartSeries.length - 1].value >= initialTotal ? '+' : ''}${formatCurrency(chartSeries[chartSeries.length - 1].value - initialTotal, viewMode === 'individual' ? selectedCurrency : baseCurrency)}` : 'N/A'}
                </div>
              </div>
            </div>
            
            {/* 合并视图下显示资产构成 */}
            {viewMode === 'combined' && chartSeries.length > 0 && chartSeries[chartSeries.length - 1].breakdown && (
              <div className="mt-4 p-3 bg-gray-50 rounded">
                <div className="text-sm font-medium text-gray-700 mb-2">资产构成明细 (按 {baseCurrency} 计算)</div>
                <div className="grid grid-cols-3 gap-4 text-xs">
                  <div>
                    <span className="text-gray-600">USD 市场:</span>
                    <span className="ml-2 font-medium">
                      {formatCurrency(chartSeries[chartSeries.length - 1].breakdown.usd, baseCurrency)}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">HKD 市场:</span>
                    <span className="ml-2 font-medium">
                      {formatCurrency(chartSeries[chartSeries.length - 1].breakdown.hkd, baseCurrency)}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">CNY 市场:</span>
                    <span className="ml-2 font-medium">
                      {formatCurrency(chartSeries[chartSeries.length - 1].breakdown.cny, baseCurrency)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </Card>

          <Card className="p-4">
            <h2 className="text-lg font-medium mb-4">
              资产明细 ({viewMode === 'individual' ? selectedCurrency : `总计-${baseCurrency}`})
            </h2>
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
                  {viewMode === 'individual' ? 
                    snapshots.map((point) => {
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
                    })
                    :
                    chartSeries.map((point, index) => {
                      const prevValue = index > 0 ? chartSeries[index - 1].value : chartSeries[0]?.value || 0
                      const dailyChange = point.value - prevValue
                      
                      return (
                        <tr key={point.label} className="border-t">
                          <td className="py-2 pr-4">{point.label}</td>
                          <td className={`py-2 pr-4 ${dailyChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {dailyChange >= 0 ? '+' : ''}
                            {formatCurrency(dailyChange, baseCurrency)}
                          </td>
                          <td className="py-2 pr-4">
                            {point.breakdown ? 
                              `${formatCurrency(point.breakdown.usd + point.breakdown.hkd + point.breakdown.cny - (chartSeries.find(s => s.label === point.label)?.value || 0) + (point.breakdown.usd + point.breakdown.hkd + point.breakdown.cny), baseCurrency)}` 
                              : 'N/A'}
                          </td>
                          <td className="py-2 pr-4">
                            {point.breakdown ? 'Mixed' : 'N/A'}
                          </td>
                          <td className="py-2 font-semibold">{formatCurrency(point.value, baseCurrency)}</td>
                        </tr>
                      )
                    })
                  }
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
