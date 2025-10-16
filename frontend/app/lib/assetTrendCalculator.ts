// 资产曲线计算器 - 基于成交记录和价格快照计算每日资产变化
import type { Trade } from '@/components/trading/PositionsOrdersTrades'
import type { Overview } from '@/types/overview'
import { priceHistoryService } from '@/lib/priceHistory'

export interface DailyAssetSnapshot {
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

// 从股票代码提取市场/货币
export const getCurrencyFromSymbol = (symbol: string): 'USD' | 'HKD' | 'CNY' => {
  if (symbol.endsWith('.HK')) return 'HKD'
  if (symbol.endsWith('.CN') || symbol.endsWith('.SH') || symbol.endsWith('.SZ')) return 'CNY'
  return 'USD'
}

// 获取UTC日期字符串 YYYY-MM-DD
const getUTCDateString = (date: Date): string => {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// 获取前一天的日期字符串
const getPreviousDate = (dateStr: string): string => {
  const date = new Date(dateStr + 'T00:00:00Z')
  date.setUTCDate(date.getUTCDate() - 1)
  return getUTCDateString(date)
}

/**
 * 计算资产曲线
 * @param trades 成交记录数组
 * @param overview 账户概览（包含初始资金）
 * @returns 每日资产快照数组
 */
export function calculateAssetTrend(trades: Trade[], overview: Overview): DailyAssetSnapshot[] {
  console.log('📊 开始计算资产曲线...')
  console.log('成交记录数量:', trades.length)
  console.log('初始资金:', overview.user)

  if (trades.length === 0) {
    console.log('⚠️ 没有成交记录，返回空数组')
    return []
  }

  // 1. 找出最早的交易日期
  const tradeDates = trades.map(t => t.trade_time.split('T')[0])
  const earliestDate = tradeDates.sort()[0]
  console.log('最早交易日期:', earliestDate)
  
  // 2. 创建第一个点：交易前一天的初始资金
  const dayBeforeFirstTrade = getPreviousDate(earliestDate)
  console.log('起始计算日期（交易前一天）:', dayBeforeFirstTrade)
  
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
    const date = trade.trade_time.split('T')[0]
    if (!acc[date]) acc[date] = []
    acc[date].push(trade)
    return acc
  }, {} as Record<string, Trade[]>)

  console.log('按日期分组的交易:', Object.keys(tradesByDate))

  // 4. 获取所有有交易的日期，排序
  const allTradeDates = Object.keys(tradesByDate).sort()
  console.log('所有交易日期:', allTradeDates)

  // 5. 计算每日资产
  const snapshots: DailyAssetSnapshot[] = [initialSnapshot]
  
  // 追踪每个币种的现金和持仓
  let cash_usd = overview.user.initial_capital_usd
  let cash_hkd = overview.user.initial_capital_hkd
  let cash_cny = overview.user.initial_capital_cny
  
  // 持仓：symbol -> quantity
  const positions: Record<string, number> = {}
  
  allTradeDates.forEach((date, dateIndex) => {
    console.log(`\n处理日期: ${date} (${dateIndex + 1}/${allTradeDates.length})`)
    
    const dayTrades = tradesByDate[date] || []
    console.log(`当日交易数量: ${dayTrades.length}`)
    
    // 处理当天所有交易
    dayTrades.forEach((trade, tradeIndex) => {
      const currency = getCurrencyFromSymbol(trade.symbol)
      const totalCost = trade.price * trade.quantity + trade.commission
      
      console.log(`  交易 ${tradeIndex + 1}: ${trade.side} ${trade.quantity} ${trade.symbol} @ ${trade.price} (佣金: ${trade.commission})`)
      console.log(`    币种: ${currency}, 总成本: ${totalCost.toFixed(2)}`)
      
      if (trade.side.toLowerCase() === 'buy') {
        // 买入：扣除现金，增加持仓
        if (currency === 'USD') {
          cash_usd -= totalCost
          console.log(`    USD现金: ${cash_usd.toFixed(2)} (减少 ${totalCost.toFixed(2)})`)
        } else if (currency === 'HKD') {
          cash_hkd -= totalCost
          console.log(`    HKD现金: ${cash_hkd.toFixed(2)} (减少 ${totalCost.toFixed(2)})`)
        } else if (currency === 'CNY') {
          cash_cny -= totalCost
          console.log(`    CNY现金: ${cash_cny.toFixed(2)} (减少 ${totalCost.toFixed(2)})`)
        }
        
        positions[trade.symbol] = (positions[trade.symbol] || 0) + trade.quantity
        console.log(`    持仓 ${trade.symbol}: ${positions[trade.symbol]} (增加 ${trade.quantity})`)
      } else {
        // 卖出：增加现金，减少持仓
        const proceeds = trade.price * trade.quantity - trade.commission
        if (currency === 'USD') {
          cash_usd += proceeds
          console.log(`    USD现金: ${cash_usd.toFixed(2)} (增加 ${proceeds.toFixed(2)})`)
        } else if (currency === 'HKD') {
          cash_hkd += proceeds
          console.log(`    HKD现金: ${cash_hkd.toFixed(2)} (增加 ${proceeds.toFixed(2)})`)
        } else if (currency === 'CNY') {
          cash_cny += proceeds
          console.log(`    CNY现金: ${cash_cny.toFixed(2)} (增加 ${proceeds.toFixed(2)})`)
        }
        
        positions[trade.symbol] = (positions[trade.symbol] || 0) - trade.quantity
        if (positions[trade.symbol] <= 0) {
          console.log(`    持仓 ${trade.symbol}: 已清空`)
          delete positions[trade.symbol]
        } else {
          console.log(`    持仓 ${trade.symbol}: ${positions[trade.symbol]} (减少 ${trade.quantity})`)
        }
      }
    })
    
    // 获取当天收盘价，计算持仓市值
    const priceSnapshot = priceHistoryService.getDailySnapshot(date)
    console.log(`获取 ${date} 价格快照:`, priceSnapshot ? `${Object.keys(priceSnapshot.prices).length}个股票` : '无数据')
    
    let positions_value_usd = 0
    let positions_value_hkd = 0
    let positions_value_cny = 0
    
    Object.entries(positions).forEach(([symbol, quantity]) => {
      const price = priceSnapshot?.prices[symbol]
      if (price && quantity > 0) {
        const marketValue = price * quantity
        const currency = getCurrencyFromSymbol(symbol)
        
        console.log(`  持仓估值 ${symbol}: ${quantity} × ${price} = ${marketValue.toFixed(2)} ${currency}`)
        
        if (currency === 'USD') positions_value_usd += marketValue
        else if (currency === 'HKD') positions_value_hkd += marketValue
        else if (currency === 'CNY') positions_value_cny += marketValue
      } else {
        console.log(`  ⚠️ ${symbol}: 数量=${quantity}, 价格=${price || 'N/A'}`)
      }
    })
    
    const total_usd = cash_usd + positions_value_usd
    const total_hkd = cash_hkd + positions_value_hkd
    const total_cny = cash_cny + positions_value_cny
    
    const prevSnapshot = snapshots[snapshots.length - 1]
    
    const dailySnapshot: DailyAssetSnapshot = {
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
    }
    
    console.log(`日终结果:`)
    console.log(`  现金: USD ${cash_usd.toFixed(2)}, HKD ${cash_hkd.toFixed(2)}, CNY ${cash_cny.toFixed(2)}`)
    console.log(`  持仓: USD ${positions_value_usd.toFixed(2)}, HKD ${positions_value_hkd.toFixed(2)}, CNY ${positions_value_cny.toFixed(2)}`)
    console.log(`  总计: USD ${total_usd.toFixed(2)}, HKD ${total_hkd.toFixed(2)}, CNY ${total_cny.toFixed(2)}`)
    console.log(`  日变化: USD ${dailySnapshot.daily_change_usd.toFixed(2)}, HKD ${dailySnapshot.daily_change_hkd.toFixed(2)}, CNY ${dailySnapshot.daily_change_cny.toFixed(2)}`)
    
    snapshots.push(dailySnapshot)
  })

  console.log(`\n✅ 资产曲线计算完成，共 ${snapshots.length} 个数据点`)
  return snapshots
}

// 验证计算结果的函数
export function validateAssetTrend(snapshots: DailyAssetSnapshot[], trades: Trade[], overview: Overview): boolean {
  console.log('\n🔍 验证资产曲线计算结果...')
  
  if (snapshots.length === 0) {
    console.log('❌ 验证失败：快照数组为空')
    return false
  }
  
  // 验证第一个快照是否等于初始资金
  const firstSnapshot = snapshots[0]
  const expectedInitialUSD = overview.user.initial_capital_usd
  const expectedInitialHKD = overview.user.initial_capital_hkd
  const expectedInitialCNY = overview.user.initial_capital_cny
  
  if (Math.abs(firstSnapshot.total_usd - expectedInitialUSD) > 0.01 ||
      Math.abs(firstSnapshot.total_hkd - expectedInitialHKD) > 0.01 ||
      Math.abs(firstSnapshot.total_cny - expectedInitialCNY) > 0.01) {
    console.log('❌ 验证失败：初始资金不匹配')
    console.log('预期:', { expectedInitialUSD, expectedInitialHKD, expectedInitialCNY })
    console.log('实际:', { 
      total_usd: firstSnapshot.total_usd, 
      total_hkd: firstSnapshot.total_hkd, 
      total_cny: firstSnapshot.total_cny 
    })
    return false
  }
  
  // 验证日期连续性
  for (let i = 1; i < snapshots.length; i++) {
    const prev = snapshots[i - 1]
    const curr = snapshots[i]
    
    // 检查日涨跌计算是否正确
    const expectedChangeUSD = curr.total_usd - prev.total_usd
    const expectedChangeHKD = curr.total_hkd - prev.total_hkd
    const expectedChangeCNY = curr.total_cny - prev.total_cny
    
    if (Math.abs(curr.daily_change_usd - expectedChangeUSD) > 0.01 ||
        Math.abs(curr.daily_change_hkd - expectedChangeHKD) > 0.01 ||
        Math.abs(curr.daily_change_cny - expectedChangeCNY) > 0.01) {
      console.log(`❌ 验证失败：第 ${i} 个快照的日涨跌计算错误`)
      console.log('日期:', curr.date)
      console.log('预期日涨跌:', { expectedChangeUSD, expectedChangeHKD, expectedChangeCNY })
      console.log('实际日涨跌:', { 
        daily_change_usd: curr.daily_change_usd,
        daily_change_hkd: curr.daily_change_hkd,
        daily_change_cny: curr.daily_change_cny
      })
      return false
    }
  }
  
  console.log('✅ 验证通过：资产曲线计算正确')
  return true
}