import { useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { useTranslation } from '@/lib/i18n'

interface AssetTrendProps {
  userId: number | null
}

interface ApiSnapshot {
  date: string
  daily_change_usd: number
  total_assets_usd: number
  cumulative_change_usd: number
  cash_usd: number
  cash_breakdown: Record<string, number>
  positions_usd: number
  positions_breakdown: Record<string, number>
}

const API_BASE_URL =  'http://localhost:2314'

const formatUsd = (value: number) =>
  `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function AssetTrend({ userId }: AssetTrendProps) {
  const { t } = useTranslation()
  const [snapshots, setSnapshots] = useState<ApiSnapshot[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) {
      setSnapshots([])
      return
    }

    let active = true
    setLoading(true)
    setError(null)

    fetch(`${API_BASE_URL}/asset-trend?user_id=${userId}`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await response.text())
        }
        return response.json()
      })
      .then((data) => {
        if (!active) return
        setSnapshots(Array.isArray(data?.snapshots) ? data.snapshots : [])
      })
      .catch((err: Error) => {
        if (!active) return
        setError(err.message || 'Failed to load asset trend')
      })
      .finally(() => {
        if (!active) return
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [userId])

  const chartSeries = useMemo(() => {
    if (!snapshots.length) {
      return []
    }
    const initial = snapshots[0]?.total_assets_usd ?? 0
    return [
      { label: t('assetTrend.initialLabel'), totalUsd: initial },
      ...snapshots.map((point) => ({ label: point.date, totalUsd: point.total_assets_usd })),
    ]
  }, [snapshots, t])

  const totals = chartSeries.map((item) => item.totalUsd)
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
        ((point.totalUsd - minValue) / range) * (height - padding * 2)
      return `${x},${y}`
    })
    .join(' ')

  const initialTotal = snapshots[0]?.total_assets_usd ?? 0

  return (
    <div className="space-y-4 overflow-y-auto h-full pr-2">
      <Card className="p-4">
        <div className="text-sm text-muted-foreground mb-1">
          {t('assetTrend.initialCapital')}
        </div>
        <div className="text-2xl font-semibold text-blue-600">
          {formatUsd(initialTotal)}
        </div>
        {loading && (
          <div className="mt-2 text-sm text-muted-foreground">
            {t('assetTrend.loading')}
          </div>
        )}
        {error && (
          <div className="mt-2 text-sm text-red-600">
            {error}
          </div>
        )}
        {!loading && !error && snapshots.length === 0 && (
          <div className="mt-2 text-sm text-muted-foreground">
            {t('assetTrend.noTrades')}
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
                    ((point.totalUsd - minValue) / range) * (height - padding * 2)
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
            <h2 className="text-lg font-medium mb-4">{t('assetTrend.tableTitle')}</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4 font-medium">{t('assetTrend.date')}</th>
                    <th className="py-2 pr-4 font-medium">{t('assetTrend.dailyChange')}</th>
                    <th className="py-2 pr-4 font-medium">{t('assetTrend.cash')}</th>
                    <th className="py-2 pr-4 font-medium">{t('assetTrend.positions')}</th>
                    <th className="py-2 pr-4 font-medium">{t('assetTrend.total')}</th>
                    <th className="py-2 font-medium">{t('assetTrend.cumulativeChange')}</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshots.map((point) => (
                    <tr key={point.date} className="border-t">
                      <td className="py-2 pr-4">{point.date}</td>
                      <td className={`py-2 pr-4 ${point.daily_change_usd >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {point.daily_change_usd >= 0 ? '+' : ''}
                        {formatUsd(point.daily_change_usd)}
                      </td>
                      <td className="py-2 pr-4">{formatUsd(point.cash_usd)}</td>
                      <td className="py-2 pr-4">{formatUsd(point.positions_usd)}</td>
                      <td className="py-2 pr-4 font-semibold">{formatUsd(point.total_assets_usd)}</td>
                      <td className={`py-2 ${point.cumulative_change_usd >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {point.cumulative_change_usd >= 0 ? '+' : ''}
                        {formatUsd(point.cumulative_change_usd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
