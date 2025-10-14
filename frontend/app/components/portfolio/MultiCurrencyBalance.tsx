import React, { useState } from 'react'
import { Card } from '@/components/ui/card'
import { useTranslation } from '@/lib/i18n'
import { type CurrencyCode, convertCurrency } from '@/lib/exchange'

interface CurrencyBalance {
  initial_capital: number
  current_cash: number
  frozen_cash: number
}

interface MultiCurrencyBalanceProps {
  balances: {
    usd: CurrencyBalance
    hkd: CurrencyBalance
    cny: CurrencyBalance
  }
  totalAssetsUsd: number
  positionsValueUsd: number
  positionsValueByCurrency: {
    usd: number
    hkd: number
    cny: number
  }
}

const currencySymbols = {
  usd: '$',
  hkd: 'HK$',
  cny: '¥'
}

const currencyNames = {
  usd: 'currency.usd',
  hkd: 'currency.hkd', 
  cny: 'currency.cny'
} as const

export default function MultiCurrencyBalance({ 
  balances, 
  totalAssetsUsd, 
  positionsValueUsd,
  positionsValueByCurrency,
}: MultiCurrencyBalanceProps) {
  const { t } = useTranslation()
  const currencyOrder: CurrencyCode[] = ['usd', 'hkd', 'cny']
  const [selectedCurrency, setSelectedCurrency] = useState<CurrencyCode>('usd')
  
  // 安全检查：如果 balances 为 undefined 或 null，使用默认值
  const safeBalances = balances || {
    usd: { initial_capital: 0, current_cash: 0, frozen_cash: 0 },
    hkd: { initial_capital: 0, current_cash: 0, frozen_cash: 0 },
    cny: { initial_capital: 0, current_cash: 0, frozen_cash: 0 },
  }
  
  const safePositionsValueByCurrency = positionsValueByCurrency || {
    usd: 0, hkd: 0, cny: 0
  }
  const formatCurrency = (amount: number | undefined, currency: keyof typeof currencySymbols) => {
    const safeAmount = amount ?? 0
    return `${currencySymbols[currency]}${safeAmount.toLocaleString('en-US', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    })}`
  }

  const calculatePnL = (balance: CurrencyBalance, currency: keyof typeof currencySymbols) => {
    const positionsValue = safePositionsValueByCurrency[currency]
    const equity = balance.current_cash + balance.frozen_cash + positionsValue
    const pnl = equity - balance.initial_capital
    const pnlPercent = balance.initial_capital !== 0 ? (pnl / balance.initial_capital) * 100 : 0
    return { pnl, pnlPercent }
  }

  const equityByCurrency = currencyOrder.reduce((acc, currency) => {
    const balance = safeBalances[currency]
    const positionsValue = safePositionsValueByCurrency[currency]
    acc[currency] = balance.current_cash + balance.frozen_cash + positionsValue
    return acc
  }, {} as Record<CurrencyCode, number>)

  const totalsByCurrency = currencyOrder.reduce((acc, target) => {
    const totalAssets = currencyOrder.reduce((sum, currency) => {
      return sum + convertCurrency(equityByCurrency[currency], currency, target)
    }, 0)

    const positionsValue = currencyOrder.reduce((sum, currency) => {
      return sum + convertCurrency(safePositionsValueByCurrency[currency], currency, target)
    }, 0)

    acc[target] = { totalAssets, positionsValue }
    return acc
  }, {} as Record<CurrencyCode, { totalAssets: number; positionsValue: number }>)
  const selectedTotals = totalsByCurrency[selectedCurrency]
  const selectedTotalAssets =
    selectedCurrency === 'usd' && selectedTotals.totalAssets === 0
      ? totalAssetsUsd
      : selectedTotals.totalAssets
  const selectedPositionsValue =
    selectedCurrency === 'usd' && selectedTotals.positionsValue === 0
      ? positionsValueUsd
      : selectedTotals.positionsValue

  return (
    <div className="space-y-2">
      {/* 总览卡片 */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-1">
            <div className="text-sm text-muted-foreground">{t('portfolio.totalAssets')}</div>
            <div className="flex gap-2">
              {currencyOrder.map((currency) => (
                <button
                  key={currency}
                  type="button"
                  onClick={() => setSelectedCurrency(currency)}
                  className={`px-2 py-1 text-xs rounded border transition-colors ${
                    selectedCurrency === currency
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-muted text-muted-foreground border-transparent'
                  }`}
                >
                  {currency.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <div className="text-2xl font-bold text-blue-600">
            {formatCurrency(selectedTotalAssets, selectedCurrency)}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground mb-1">{t('portfolio.positionsValue')}</div>
          <div className="text-2xl font-bold text-green-600">
            {formatCurrency(selectedPositionsValue, selectedCurrency)}
          </div>
        </Card>
      </div>

      {/* 各币种详情 */}
      <div className="space-y-4">        
        <div className="grid grid-cols-3 gap-4">
          {Object.entries(safeBalances).map(([currency, balance]) => {
          const currencyKey = currency as keyof typeof currencySymbols
          const { pnl, pnlPercent } = calculatePnL(balance, currencyKey)
          
          return (
            <Card key={currency} className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium text-base">
                  {t(currencyNames[currencyKey])}
                </h4>
                <div className="text-right">
                  <div className={`text-sm font-medium ${
                    pnl >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {pnl >= 0 ? '+' : ''}{formatCurrency(pnl, currencyKey)}
                  </div>
                  <div className={`text-xs ${
                    pnl >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {pnl >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <div className="text-muted-foreground mb-1">{t('portfolio.availableCash')}</div>
                  <div className="font-medium">
                    {formatCurrency(balance.current_cash, currencyKey)}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground mb-1">{t('portfolio.frozenCash')}</div>
                  <div className="font-medium text-orange-600">
                    {formatCurrency(balance.frozen_cash, currencyKey)}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground mb-1">{t('portfolio.initialCapital')}</div>
                  <div className="font-medium text-gray-600">
                    {formatCurrency(balance.initial_capital, currencyKey)}
                  </div>
                </div>
              </div>
              
              {/* 进度条显示可用资金比例 */}
              <div className="mt-3">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>{t('portfolio.cashUsage')}</span>
                  <span>
                    {balance.initial_capital > 0
                      ? (((balance.initial_capital - balance.current_cash) / balance.initial_capital) * 100).toFixed(1)
                      : '0.0'}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                    style={{ 
                      width: `${Math.min(
                        100,
                        balance.initial_capital > 0
                          ? ((balance.initial_capital - balance.current_cash) / balance.initial_capital) * 100
                          : 0,
                      )}%` 
                    }}
                  />
                </div>
              </div>
            </Card>
          )
        })}
        </div>
      </div>
    </div>
  )
}