import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'

export type Language = 'en' | 'cn'

interface I18nContextValue {
  lang: Language
  setLang: (lang: Language) => void
  t: (key: string) => string
}

const I18N_KEY = 'app_lang'

const dictionaries: Record<Language, Record<string, string>> = {
  en: {
    'header.title': 'Simulated US/HK Trading',
    'header.lang.en': 'EN',
    'header.lang.cn': '中文',

    'sidebar.portfolio': 'Portfolio',
    'sidebar.trading': 'Trading',
    'sidebar.assetTrend': 'Asset Trend',

    'tabs.positions': 'Positions',
    'tabs.orders': 'Orders',
    'tabs.trades': 'Trades',

    'portfolio.totalAssets': 'Total Assets (USD)',
    'portfolio.positionsValue': 'Positions Value (USD)',
    'portfolio.availableCash': 'Available Cash',
    'portfolio.frozenCash': 'Frozen Cash',
    'portfolio.initialCapital': 'Initial Capital',
    'portfolio.cashUsage': 'Cash Usage',

    'currency.usd': 'USD (US Market)',
    'currency.hkd': 'HKD (HK Market)',
    'currency.cny': 'CNY (A-Share Market)',

    'trading.us': 'US Stock',
    'trading.hk': 'HK Stock',
    'trading.cn': 'A-Share',
    'trading.orderType': 'Order Type',
    'trading.amount': 'Amount',
    'trading.availableCash': 'Available Cash',
    'trading.frozenCash': 'Frozen Cash',
    'trading.sellablePosition': 'Sellable Position',
    'trading.maxBuyable': 'Max Buyable',
    'trading.shares': 'shares',
    'trading.buy': 'Buy',
    'trading.sell': 'Sell',

    'assetTrend.initialLabel': 'Initial',
    'assetTrend.initialCapital': 'Initial Capital (USD)',
    'assetTrend.noTrades': 'No trades yet. Showing initial capital.',
    'assetTrend.missingRates': 'Missing exchange rates for',
    'assetTrend.chartTitle': 'Asset Trend',
    'assetTrend.tableTitle': 'Daily Asset Summary',
    'assetTrend.date': 'Date',
    'assetTrend.dailyChange': 'Daily Change (USD)',
    'assetTrend.cash': 'Cash (USD)',
    'assetTrend.positions': 'Positions Value (USD)',
    'assetTrend.total': 'Total Assets (USD)',
    'assetTrend.cumulativeChange': 'Cumulative Change (USD)',
    'assetTrend.loading': 'Loading asset trend...',
  },
  cn: {
    'header.title': '美股/港股 模拟交易',
    'header.lang.en': 'EN',
    'header.lang.cn': '中文',

    'sidebar.portfolio': '资产',
    'sidebar.trading': '交易',
    'sidebar.assetTrend': '资产曲线',

    'tabs.positions': '持仓',
    'tabs.orders': '委托',
    'tabs.trades': '成交',

    'portfolio.totalAssets': '总资产',
    'portfolio.positionsValue': '持仓市值',
    'portfolio.availableCash': '可用资金',
    'portfolio.frozenCash': '冻结资金',
    'portfolio.initialCapital': '初始资金',
    'portfolio.cashUsage': '资金使用率',

    'currency.usd': '美元（美股）',
    'currency.hkd': '港币（港股）',
    'currency.cny': '人民币（A股）',

    'trading.us': '美股',
    'trading.hk': '港股',
    'trading.cn': 'A股',
    'trading.orderType': '下单类型',
    'trading.amount': '成交金额',
    'trading.availableCash': '可用资金',
    'trading.frozenCash': '冻结资金',
    'trading.sellablePosition': '可卖数量',
    'trading.maxBuyable': '最大可买',
    'trading.shares': '股',
    'trading.buy': '买入',
    'trading.sell': '卖出',

    'assetTrend.initialLabel': '初始',
    'assetTrend.initialCapital': '初始资金 (USD)',
    'assetTrend.noTrades': '暂无成交，仅展示初始资金。',
    'assetTrend.missingRates': '缺少汇率数据',
    'assetTrend.chartTitle': '每日资产曲线',
    'assetTrend.tableTitle': '每日资产汇总',
    'assetTrend.date': '日期',
    'assetTrend.dailyChange': '当日变动 (USD)',
    'assetTrend.cash': '现金 (USD)',
    'assetTrend.positions': '持仓市值 (USD)',
    'assetTrend.total': '当日资产 (USD)',
    'assetTrend.cumulativeChange': '累计变动 (USD)',
    'assetTrend.loading': '资产曲线加载中...',
  },
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Language>('en')

  useEffect(() => {
    const saved = (localStorage.getItem(I18N_KEY) as Language) || 'en'
    setLangState(saved)
  }, [])

  const setLang = (l: Language) => {
    setLangState(l)
    localStorage.setItem(I18N_KEY, l)
  }

  const t = useMemo(() => {
    return (key: string) => {
      const dict = dictionaries[lang] || dictionaries.en
      return dict[key] ?? key
    }
  }, [lang])

  const value = useMemo(() => ({ lang, setLang, t }), [lang])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useTranslation() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useTranslation must be used within LanguageProvider')
  return ctx
}
