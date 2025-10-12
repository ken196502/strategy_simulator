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
}

const currencySymbols = {
  usd: '$',
  hkd: 'HK$',
  cny: '¥'
}

const currencyNames = {
  usd: 'USD (US Market)',
  hkd: 'HKD (HK Market)', 
  cny: 'CNY (A-Share Market)'
}

export default function MultiCurrencyBalance({ 
  balances, 
  totalAssetsUsd, 
  positionsValueUsd 
}: MultiCurrencyBalanceProps) {
  const formatCurrency = (amount: number, currency: keyof typeof currencySymbols) => {
    return `${currencySymbols[currency]}${amount.toLocaleString('en-US', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    })}`
  }

  const calculatePnL = (balance: CurrencyBalance) => {
    const pnl = balance.current_cash - balance.initial_capital
    const pnlPercent = (pnl / balance.initial_capital) * 100
    return { pnl, pnlPercent }
  }

  return (
    <div className="space-y-6">
      {/* 总览卡片 */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="text-sm text-muted-foreground mb-1">Total Assets (USD)</div>
          <div className="text-2xl font-bold text-blue-600">
            {formatCurrency(totalAssetsUsd, 'usd')}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground mb-1">Positions Value (USD)</div>
          <div className="text-2xl font-bold text-green-600">
            {formatCurrency(positionsValueUsd, 'usd')}
          </div>
        </Card>
      </div>

      {/* 各币种详情 */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Currency Balances</h3>
        
        {Object.entries(balances).map(([currency, balance]) => {
          const { pnl, pnlPercent } = calculatePnL(balance)
          const currencyKey = currency as keyof typeof currencySymbols
          
          return (
            <Card key={currency} className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium text-base">
                  {currencyNames[currencyKey]}
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
                  <div className="text-muted-foreground mb-1">Available Cash</div>
                  <div className="font-medium">
                    {formatCurrency(balance.current_cash, currencyKey)}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground mb-1">Frozen Cash</div>
                  <div className="font-medium text-orange-600">
                    {formatCurrency(balance.frozen_cash, currencyKey)}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground mb-1">Initial Capital</div>
                  <div className="font-medium text-gray-600">
                    {formatCurrency(balance.initial_capital, currencyKey)}
                  </div>
                </div>
              </div>
              
              {/* 进度条显示可用资金比例 */}
              <div className="mt-3">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Cash Usage</span>
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
  )
}