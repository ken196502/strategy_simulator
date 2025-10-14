// 历史行情数据存储 - 用于资产曲线绘制

export interface DailyPrice {
  symbol: string
  price: number
  timestamp: number
}

export interface DailyPriceSnapshot {
  date: string // YYYY-MM-DD format (UTC)
  prices: Record<string, number> // symbol -> price
  timestamp: number // 最后更新时间
}

const STORAGE_KEY_PREFIX = 'price_history_'

class PriceHistoryService {
  // 获取UTC日期字符串 YYYY-MM-DD
  private getUTCDateString(date: Date = new Date()): string {
    const year = date.getUTCFullYear()
    const month = String(date.getUTCMonth() + 1).padStart(2, '0')
    const day = String(date.getUTCDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  // 获取存储键
  private getStorageKey(dateStr: string): string {
    return `${STORAGE_KEY_PREFIX}${dateStr}`
  }

  // 保存当日价格（同一天会覆盖）
  savePrices(prices: DailyPrice[]) {
    if (prices.length === 0) return

    const dateStr = this.getUTCDateString()
    const key = this.getStorageKey(dateStr)

    // 读取当日已有数据
    let snapshot: DailyPriceSnapshot
    const existing = localStorage.getItem(key)
    
    if (existing) {
      snapshot = JSON.parse(existing)
    } else {
      snapshot = {
        date: dateStr,
        prices: {},
        timestamp: Date.now(),
      }
    }

    // 更新价格（覆盖相同股票）
    prices.forEach(({ symbol, price }) => {
      snapshot.prices[symbol] = price
    })
    
    snapshot.timestamp = Date.now()

    // 保存到localStorage
    localStorage.setItem(key, JSON.stringify(snapshot))
    
    console.log(`💾 保存历史价格: ${dateStr} (${Object.keys(snapshot.prices).length}个股票)`)
  }

  // 获取指定日期的价格快照
  getDailySnapshot(dateStr: string): DailyPriceSnapshot | null {
    const key = this.getStorageKey(dateStr)
    const data = localStorage.getItem(key)
    return data ? JSON.parse(data) : null
  }

  // 获取今日快照
  getTodaySnapshot(): DailyPriceSnapshot | null {
    const dateStr = this.getUTCDateString()
    return this.getDailySnapshot(dateStr)
  }

  // 获取指定股票在某日的价格
  getPrice(symbol: string, dateStr: string): number | null {
    const snapshot = this.getDailySnapshot(dateStr)
    return snapshot?.prices[symbol] ?? null
  }

  // 获取指定股票的历史价格（多日）
  getPriceHistory(symbol: string, startDate: string, endDate?: string): Array<{ date: string; price: number }> {
    const result: Array<{ date: string; price: number }> = []
    const start = new Date(startDate + 'T00:00:00Z')
    const end = endDate ? new Date(endDate + 'T00:00:00Z') : new Date()

    // 遍历日期范围
    const currentDate = new Date(start)
    while (currentDate <= end) {
      const dateStr = this.getUTCDateString(currentDate)
      const price = this.getPrice(symbol, dateStr)
      
      if (price !== null) {
        result.push({ date: dateStr, price })
      }
      
      // 下一天
      currentDate.setUTCDate(currentDate.getUTCDate() + 1)
    }

    return result
  }

  // 获取所有历史日期列表
  getAllHistoryDates(): string[] {
    const dates: string[] = []
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(STORAGE_KEY_PREFIX)) {
        const dateStr = key.replace(STORAGE_KEY_PREFIX, '')
        dates.push(dateStr)
      }
    }
    
    return dates.sort()
  }

  // 获取所有历史快照
  getAllSnapshots(): DailyPriceSnapshot[] {
    const dates = this.getAllHistoryDates()
    return dates
      .map(date => this.getDailySnapshot(date))
      .filter((snapshot): snapshot is DailyPriceSnapshot => snapshot !== null)
  }

  // 清理旧数据（保留最近N天）
  cleanOldData(daysToKeep: number = 90) {
    const dates = this.getAllHistoryDates()
    const today = new Date()
    const cutoffDate = new Date(today)
    cutoffDate.setUTCDate(cutoffDate.getUTCDate() - daysToKeep)
    const cutoffStr = this.getUTCDateString(cutoffDate)

    let removedCount = 0
    dates.forEach(dateStr => {
      if (dateStr < cutoffStr) {
        const key = this.getStorageKey(dateStr)
        localStorage.removeItem(key)
        removedCount++
      }
    })

    if (removedCount > 0) {
      console.log(`🗑️ 清理历史数据: 删除 ${removedCount} 天的旧数据`)
    }
  }

  // 导出所有历史数据（用于备份）
  exportAllData(): string {
    const snapshots = this.getAllSnapshots()
    return JSON.stringify(snapshots, null, 2)
  }

  // 导入历史数据（从备份恢复）
  importData(jsonData: string): boolean {
    try {
      const snapshots: DailyPriceSnapshot[] = JSON.parse(jsonData)
      
      snapshots.forEach(snapshot => {
        const key = this.getStorageKey(snapshot.date)
        localStorage.setItem(key, JSON.stringify(snapshot))
      })
      
      console.log(`📥 导入历史数据: ${snapshots.length} 天`)
      return true
    } catch (error) {
      console.error('❌ 导入数据失败:', error)
      return false
    }
  }

  // 获取统计信息
  getStats(): {
    totalDays: number
    totalSymbols: number
    dateRange: { start: string; end: string } | null
    storageSize: number
  } {
    const dates = this.getAllHistoryDates()
    const allSymbols = new Set<string>()
    
    dates.forEach(date => {
      const snapshot = this.getDailySnapshot(date)
      if (snapshot) {
        Object.keys(snapshot.prices).forEach(symbol => allSymbols.add(symbol))
      }
    })

    // 估算存储大小
    let storageSize = 0
    dates.forEach(date => {
      const key = this.getStorageKey(date)
      const data = localStorage.getItem(key)
      if (data) {
        storageSize += data.length * 2 // UTF-16 编码，每字符2字节
      }
    })

    return {
      totalDays: dates.length,
      totalSymbols: allSymbols.size,
      dateRange: dates.length > 0 ? { start: dates[0], end: dates[dates.length - 1] } : null,
      storageSize,
    }
  }
}

export const priceHistoryService = new PriceHistoryService()
