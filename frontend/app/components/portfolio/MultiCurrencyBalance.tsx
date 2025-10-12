import React from 'react'
import { Card } from '@/components/ui/card'

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

import { useTranslation } from '@/lib/i18n'

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
  const formatCurrency = (amount: number, currency: keyof typeof currencySymbols) => {
    return `${currencySymbols[currency]}${amount.toLocaleString('en-US', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    })}`
  }

  const calculatePnL = (balance: CurrencyBalance, currency: keyof typeof currencySymbols) => {
    const positionsValue = positionsValueByCurrency[currency]
    const equity = balance.current_cash + balance.frozen_cash + positionsValue
    const pnl = equity - balance.initial_capital
    const pnlPercent = balance.initial_capital !== 0 ? (pnl / balance.initial_capital) * 100 : 0
    return { pnl, pnlPercent }
  }

  return (
    <div className="space-y-6">
      {/* 总览卡片 */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="text-sm text-muted-foreground mb-1">{t('portfolio.totalAssets')}</div>
          <div className="text-2xl font-bold text-blue-600">
            {formatCurrency(totalAssetsUsd, 'usd')}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground mb-1">{t('portfolio.positionsValue')}</div>
          <div className="text-2xl font-bold text-green-600">
            {formatCurrency(positionsValueUsd, 'usd')}
          </div>
        </Card>
      </div>

      {/* 各币种详情 */}
      <div className="space-y-4">        
        <div className="grid grid-cols-3 gap-4">
          {Object.entries(balances).map(([currency, balance]) => {
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
                    {((balance.initial_capital - balance.current_cash) / balance.initial_capital * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                    style={{ 
                      width: `${Math.min(100, (balance.initial_capital - balance.current_cash) / balance.initial_capital * 100)}%` 
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