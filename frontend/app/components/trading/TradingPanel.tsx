import React, { useState } from 'react'
import { useTranslation } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'

interface CurrencyBalance {
  current_cash: number
  frozen_cash: number
}

interface TradingPanelProps {
  onPlace: (payload: any) => void
  balances?: {
    usd: CurrencyBalance
    hkd: CurrencyBalance
    cny: CurrencyBalance
  }
}

export default function TradingPanel({ onPlace, balances }: TradingPanelProps) {
  const { t } = useTranslation()
  const [symbol, setSymbol] = useState('00005')
  const [name, setName] = useState('HSBC Holdings')
  const [market, setMarket] = useState<'US' | 'HK' | 'CN'>('HK')
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('LIMIT')
  const [price, setPrice] = useState<number>(2)
  const [quantity, setQuantity] = useState<number>(2)

  // 市场到币种的映射
  const marketToCurrency = {
    'US': 'usd',
    'HK': 'hkd', 
    'CN': 'cny'
  } as const

  // 币种符号映射
  const currencySymbols = {
    'usd': '$',
    'hkd': 'HK$',
    'cny': '¥'
  } as const

  const adjustPrice = (delta: number) => {
    const newPrice = Math.max(0, price + delta)
    setPrice(Math.round(newPrice * 100) / 100) // 保证两位小数
  }

  const handlePriceChange = (value: string) => {
    // 只允许数字和一个小数点
    if (!/^\d*\.?\d{0,2}$/.test(value)) return
    
    const numValue = parseFloat(value) || 0
    setPrice(numValue)
  }

  const adjustQuantity = (delta: number) => {
    setQuantity(Math.max(0, quantity + delta))
  }

  // 获取当前市场对应的币种余额
  const getCurrentBalance = () => {
    if (!balances) return null
    const currency = marketToCurrency[market]
    return balances[currency]
  }

  const currentBalance = getCurrentBalance()
  const currentCurrency = marketToCurrency[market]
  const currencySymbol = currencySymbols[currentCurrency]

  const amount = price * quantity
  const cashAvailable = currentBalance?.current_cash || 0
  const frozenCash = currentBalance?.frozen_cash || 0
  const positionAvailable = 0 // TODO: Calculate from position data
  const maxBuyable = Math.floor(cashAvailable / price) || 0

  const handleBuy = () => {
    onPlace({
      symbol,
      name,
      market,
      side: 'BUY',
      order_type: orderType,
      price: orderType === 'LIMIT' ? price : undefined,
      quantity,
      currency: currentCurrency
    })
  }

  const handleSell = () => {
    onPlace({
      symbol,
      name,
      market,
      side: 'SELL',
      order_type: orderType,
      price: orderType === 'LIMIT' ? price : undefined,
      quantity,
      currency: currentCurrency
    })
  }

  return (
    <div className="space-y-4 w-[320px] flex-shrink-0">
      {/* 市场选择 */}
      <div className="space-y-2">
        <label className="text-xs">Market</label>
        <Select value={market} onValueChange={(v) => setMarket(v as 'US' | 'HK' | 'CN')}>
          <SelectTrigger className="text-xs h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="US">{t('trading.us')} ({currencySymbols.usd})</SelectItem>
            <SelectItem value="HK">{t('trading.hk')} ({currencySymbols.hkd})</SelectItem>
            <SelectItem value="CN">{t('trading.cn')} ({currencySymbols.cny})</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 代码 */}
      <div className="space-y-2">
        <label className="text-xs">Code</label>
        <div className="relative">
          <Input 
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
          />
        </div>
        <div className="text-xs text-muted-foreground">{name}</div>
      </div>

      {/* 订单类型 */}
      <div className="space-y-2">
        <div className="flex items-center gap-1">
          <label className="text-xs text-muted-foreground">{t('trading.orderType')}</label>
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-info w-3 h-3 text-muted-foreground">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M12 16v-4"></path>
            <path d="M12 8h.01"></path>
          </svg>
        </div>
        <Select value={orderType} onValueChange={(v) => setOrderType(v as 'MARKET' | 'LIMIT')}>
          <SelectTrigger className="text-xs h-6">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="LIMIT">Limit Order</SelectItem>
            <SelectItem value="MARKET">Market Order</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 价格 */}
      <div className="space-y-2">
        <label className="text-xs">Price</label>
        <div className="flex items-center gap-2">
          <Button 
            onClick={() => adjustPrice(-0.01)}
            variant="outline"
          >
            -
          </Button>
          <div className="relative flex-1">
            <Input 
              inputMode="decimal"
              value={price.toString()}
              onChange={(e) => handlePriceChange(e.target.value)}
              className="text-center"
            />
          </div>
          <Button 
            onClick={() => adjustPrice(0.01)}
            variant="outline"
          >
            +
          </Button>
        </div>
      </div>

      {/* 数量 */}
      <div className="space-y-2">
        <label className="text-xs">Quantity</label>
        <div className="flex items-center gap-2">
          <Button 
            onClick={() => adjustQuantity(-1)}
            variant="outline"
          >
            -
          </Button>
          <div className="relative flex-1">
            <Input 
              inputMode="numeric"
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
              className="text-center"
            />
          </div>
          <Button 
            onClick={() => adjustQuantity(1)}
            variant="outline"
          >
            +
          </Button>
        </div>
      </div>

      {/* 交易信息 */}
      <div className="space-y-3 pt-4">
        <div className="flex justify-between">
          <span className="text-xs">{t('trading.amount')}</span>
          <span className="text-xs">{currencySymbol}{amount.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-xs">{t('trading.availableCash')}</span>
          <span className="text-xs text-[#16BA71]">{currencySymbol}{cashAvailable.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-xs">{t('trading.frozenCash')}</span>
          <span className="text-xs text-orange-500">{currencySymbol}{frozenCash.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-xs">{t('trading.sellablePosition')}</span>
          <span className="text-xs text-[#F44345]">{positionAvailable}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-xs">{t('trading.maxBuyable')}</span>
          <span className="text-xs">{maxBuyable} {t('trading.shares')}</span>
        </div>
      </div>

      {/* 买卖按钮 */}
      <div className="flex gap-2 pt-4">
        <Button 
          className="flex-1 text-xs h-6 rounded-xl bg-[#F44345] hover:bg-[#d63b3d] text-white"
          onClick={handleBuy}
        >
          {t('trading.buy')}
        </Button>
        <Button 
          className="flex-1 text-xs h-6 rounded-xl bg-[#16BA71] hover:bg-[#10975c] text-white"
          onClick={handleSell}
        >
          {t('trading.sell')}
        </Button>
      </div>
    </div>
  )
}