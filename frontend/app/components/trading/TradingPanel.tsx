import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import {
  normalizeSymbol,
  sanitizeSymbolInput,
  formatSymbolForMarket,
  formatSymbolForDisplay,
  symbolPlaceholders,
  marketToCurrency,
  getCurrentBalance,
  type MarketType,
  type BalancesByCurrency,
  type PendingHkRequestsMap,
  requestHkStockInfo as requestHkStockInfoHelper,
} from '@/lib/trading'

interface TradingPanelProps {
  onPlace: (payload: any) => void
  balances?: BalancesByCurrency
  wsRef?: React.RefObject<WebSocket | null>
}

export default function TradingPanel({ onPlace, balances, wsRef }: TradingPanelProps) {
  const { t } = useTranslation()
  const [symbol, setSymbol] = useState('')
  const [market, setMarket] = useState<MarketType>('US')
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('LIMIT')
  const [price, setPrice] = useState<number>(0)
  const [quantity, setQuantity] = useState<number>(0)
  const [hkTradeUnit, setHkTradeUnit] = useState<number>(100)
  const [stockInfo, setStockInfo] = useState<any>(null)
  const [isValidatingHkSymbol, setIsValidatingHkSymbol] = useState(false)
  const [hkInfoError, setHkInfoError] = useState<string | null>(null)
  const pendingHkRequests = useRef<PendingHkRequestsMap>(new Map())
  const socket = wsRef?.current

  useEffect(() => {
    const ws = socket
    if (!ws) return

    const handleMessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'hk_stock_info' || msg.type === 'hk_stock_info_error') {
          const symbolValue = msg.symbol || ''
          const key = normalizeSymbol(symbolValue)
          const formattedSymbol = formatSymbolForMarket(symbolValue, 'HK')
          const fallbackKey = formattedSymbol ? normalizeSymbol(formattedSymbol) : null
          const targetKey = pendingHkRequests.current.has(key)
            ? key
            : (fallbackKey && pendingHkRequests.current.has(fallbackKey) ? fallbackKey : null)
          if (!targetKey) {
            return
          }
          const pending = pendingHkRequests.current.get(targetKey)
          if (!pending) {
            return
          }
          clearTimeout(pending.timeoutId)
          if (msg.type === 'hk_stock_info') {
            pending.resolve.forEach((resolver) => resolver(msg.info))
          } else {
            pending.reject.forEach((rejecter) => rejecter(new Error(msg.message || '无法获取港股信息')))
          }
          pendingHkRequests.current.delete(targetKey)
          return
        }
      } catch (error) {
        // 忽略无法解析的消息
      }
    }

    ws.addEventListener('message', handleMessage)
    return () => {
      ws.removeEventListener('message', handleMessage)
      pendingHkRequests.current.forEach(({ reject, timeoutId }) => {
        clearTimeout(timeoutId)
        reject.forEach((rejecter) => rejecter(new Error('连接已断开')))
      })
      pendingHkRequests.current.clear()
    }
  }, [socket])

  const requestHkStockInfo = (inputSymbol: string) => {
    if (!wsRef?.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('交易连接未就绪'))
    }

    return requestHkStockInfoHelper({
      ws: wsRef.current,
      pendingRequests: pendingHkRequests.current,
      inputSymbol,
    })
  }

  const validateHkSymbol = async (inputSymbol: string) => {
    const sanitized = sanitizeSymbolInput(inputSymbol, 'HK')
    if (!sanitized) {
      setHkInfoError('请输入股票代码')
      throw new Error('请输入股票代码')
    }

    setIsValidatingHkSymbol(true)
    setHkInfoError(null)
    try {
      const info = await requestHkStockInfo(sanitized)
      const sanitizedSymbol = sanitizeSymbolInput(info?.symbol ?? sanitized, 'HK')
      const displaySymbol = formatSymbolForDisplay(sanitizedSymbol, 'HK')
      if (displaySymbol !== symbol) {
        setSymbol(displaySymbol)
      }
      setStockInfo(info)
      const tradeUnit = Math.max(1, Number(info?.trade_unit) || 0) || 100
      setHkTradeUnit(tradeUnit)
      return info
    } catch (error: any) {
      setStockInfo(null)
      setHkTradeUnit(100)
      setHkInfoError(error?.message || '获取港股信息失败')
      throw error
    } finally {
      setIsValidatingHkSymbol(false)
    }
  }

  const handleMarketChange = (newMarket: MarketType) => {
    setMarket(newMarket)
    setSymbol('')
    setPrice(0)
    setQuantity(0)
    setStockInfo(null)
    setHkInfoError(null)
    setIsValidatingHkSymbol(false)
    setHkTradeUnit(newMarket === 'HK' ? 100 : 1)
    pendingHkRequests.current.forEach(({ reject, timeoutId }) => {
      clearTimeout(timeoutId)
      reject.forEach((rejecter) => rejecter(new Error('市场已切换')))
    })
    pendingHkRequests.current.clear()
  }

  const handleSymbolBlur = () => {
    if (market === 'HK') {
      const sanitized = sanitizeSymbolInput(symbol, 'HK')
      if (!sanitized) {
        setSymbol('')
        setHkInfoError('请输入股票代码')
        return
      }
      const displaySymbol = formatSymbolForDisplay(sanitized, 'HK')
      if (displaySymbol !== symbol) {
        setSymbol(displaySymbol)
      }
      void validateHkSymbol(sanitized)
    }
  }

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
    // Adjust by lot size for each market
    const lotSize = market === 'HK' ? Math.max(1, hkTradeUnit) : 1
    const adjustment = delta * lotSize
    setQuantity(Math.max(0, quantity + adjustment))
  }

  const currentBalance = getCurrentBalance(balances, market)
  const currentCurrency = marketToCurrency[market]
  const displayCurrency = currentCurrency.toUpperCase()

  const amount = price > 0 ? price * quantity : 0
  const cashAvailable = currentBalance?.current_cash || 0
  const frozenCash = currentBalance?.frozen_cash || 0
  const positionAvailable = 0 // TODO: Calculate from position data
  
  // Calculate max buyable considering lot size
  const lotSize = market === 'HK' ? Math.max(1, hkTradeUnit) : 1
  const maxSharesAffordable = price > 0 ? Math.floor(cashAvailable / price) : 0
  const maxBuyable = lotSize > 0 ? Math.floor(maxSharesAffordable / lotSize) * lotSize : 0

  const submitOrder = async (side: 'BUY' | 'SELL') => {
    const sanitizedSymbol = sanitizeSymbolInput(symbol, market)

    if (!sanitizedSymbol) {
      if (market === 'HK') {
        setHkInfoError('请输入股票代码')
      }
      return
    }

    if (quantity <= 0) {
      return
    }

    if (orderType === 'LIMIT' && price <= 0) {
      return
    }

    let displaySymbol = formatSymbolForDisplay(sanitizedSymbol, market)
    let formattedSymbol = formatSymbolForMarket(sanitizedSymbol, market)

    if (market === 'HK') {
      try {
        const info = await validateHkSymbol(sanitizedSymbol)
        const infoSymbol = info?.symbol ?? sanitizedSymbol
        const infoSanitized = sanitizeSymbolInput(infoSymbol, 'HK') || sanitizedSymbol
        displaySymbol = formatSymbolForDisplay(infoSanitized, 'HK')
        formattedSymbol = formatSymbolForMarket(infoSanitized, 'HK')
      } catch {
        return
      }
    }

    if (displaySymbol !== symbol) {
      setSymbol(displaySymbol)
    }

    onPlace({
      symbol: formattedSymbol,
      market,
      side,
      order_type: orderType,
      price: orderType === 'LIMIT' ? price : undefined,
      quantity,
      currency: currentCurrency,
    })
  }

  const handleBuy = () => {
    void submitOrder('BUY')
  }

  const handleSell = () => {
    void submitOrder('SELL')
  }

  return (
    <div className="space-y-4 w-[320px] flex-shrink-0">
      {/* 市场选择 */}
      <div className="space-y-2">
        <label className="text-xs">Market</label>
        <Select value={market} onValueChange={(value) => handleMarketChange(value as MarketType)}>
          <SelectTrigger className="text-xs h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="US">{t('trading.us')} ({marketToCurrency.US.toUpperCase()})</SelectItem>
            <SelectItem value="HK">{t('trading.hk')} ({marketToCurrency.HK.toUpperCase()})</SelectItem>
            <SelectItem value="CN">{t('trading.cn')} ({marketToCurrency.CN.toUpperCase()})</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 股票选择 */}
      <div className="space-y-2">
        <label className="text-xs">Symbol</label>
        <div className="flex gap-2">
          <Input
            value={symbol}
            onChange={(e) => {
              const sanitizedValue = sanitizeSymbolInput(e.target.value, market)
              setSymbol(sanitizedValue)
              if (market === 'HK') {
                setHkInfoError(null)
              }
            }}
            onBlur={handleSymbolBlur}
            placeholder={symbolPlaceholders[market]}
            className="text-xs"
          />
          {market === 'HK' && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (symbol.trim()) {
                  void validateHkSymbol(symbol.trim())
                } else {
                  setHkInfoError('请输入股票代码')
                }
              }}
              disabled={isValidatingHkSymbol || !wsRef?.current}
            >
              {isValidatingHkSymbol ? '检查中' : '检查'}
            </Button>
          )}
        </div>
        {market === 'HK' && stockInfo && (
          <div className="text-xs text-muted-foreground">
            {stockInfo.name ? `${stockInfo.name} · 每手 ${hkTradeUnit} 股` : `每手 ${hkTradeUnit} 股`}
          </div>
        )}
        {market === 'HK' && hkInfoError && (
          <div className="text-xs text-red-500">{hkInfoError}</div>
        )}
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
        <div className="flex items-center justify-between">
          <label className="text-xs">Quantity</label>
          {market === 'HK' && (
            <span className="text-xs text-muted-foreground">
              每手 {Math.max(1, hkTradeUnit)} 股{stockInfo?.name ? ` · ${stockInfo.name}` : ''}
            </span>
          )}
        </div>
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
              onChange={(e) => {
                const inputValue = parseInt(e.target.value, 10) || 0
                // For HK market, round to nearest lot size
                if (market === 'HK') {
                  const lot = Math.max(1, hkTradeUnit)
                  const roundedValue = Math.round(inputValue / lot) * lot
                  setQuantity(Math.max(0, roundedValue))
                } else {
                  setQuantity(Math.max(0, inputValue))
                }
              }}
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
          <span className="text-xs">{`${displayCurrency} ${amount.toFixed(2)}`}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-xs">{t('trading.availableCash')}</span>
          <span className="text-xs text-[#16BA71]">{`${displayCurrency} ${cashAvailable.toFixed(2)}`}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-xs">{t('trading.frozenCash')}</span>
          <span className="text-xs text-orange-500">{`${displayCurrency} ${frozenCash.toFixed(2)}`}</span>
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