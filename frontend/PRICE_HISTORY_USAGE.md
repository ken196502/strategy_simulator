# 历史价格数据存储使用指南

## 概述

系统会自动保存每日股票价格到浏览器 localStorage，用于绘制资产曲线和分析历史表现。

## 数据结构

### 存储格式

每天的价格数据以 UTC 日期为键存储：

```
localStorage: {
  "price_history_2025-01-15": {
    "date": "2025-01-15",
    "prices": {
      "00700.HK": 320.50,
      "AAPL.US": 185.23,
      "600519.CN": 1650.00
    },
    "timestamp": 1736899200000
  }
}
```

## 自动保存机制

### 触发时机

每次行情更新时自动保存：
- WebSocket 推送持仓价格
- 前端刷新行情数据
- **同一天的数据会覆盖**（保留最新价格）

### 保存逻辑

```typescript
// 单个股票更新
marketDataService.updateQuote({
  symbol: '00700.HK',
  current_price: 320.50,
  timestamp: Date.now()
})
// ✅ 自动保存到当日价格快照

// 批量更新（推荐）
marketDataService.updateQuotes([
  { symbol: '00700.HK', current_price: 320.50, timestamp: Date.now() },
  { symbol: 'AAPL.US', current_price: 185.23, timestamp: Date.now() }
])
// ✅ 批量保存，性能更好
```

## API 使用

### 1. 查询今日价格

```typescript
import { priceHistoryService } from '@/lib/priceHistory'

// 获取今日所有股票价格
const todaySnapshot = priceHistoryService.getTodaySnapshot()
console.log(todaySnapshot)
// {
//   date: "2025-01-15",
//   prices: { "00700.HK": 320.50, ... },
//   timestamp: 1736899200000
// }
```

### 2. 查询历史某天价格

```typescript
// 获取指定日期的快照
const snapshot = priceHistoryService.getDailySnapshot('2025-01-10')

// 获取单个股票在某天的价格
const price = priceHistoryService.getPrice('00700.HK', '2025-01-10')
console.log(price) // 315.20 or null
```

### 3. 查询价格历史（多日）

```typescript
// 获取某股票的历史价格
const history = priceHistoryService.getPriceHistory(
  '00700.HK',
  '2025-01-01',  // 开始日期
  '2025-01-15'   // 结束日期（可选，默认今天）
)

console.log(history)
// [
//   { date: '2025-01-01', price: 310.00 },
//   { date: '2025-01-02', price: 312.50 },
//   { date: '2025-01-03', price: 315.20 },
//   ...
// ]
```

### 4. 获取所有历史日期

```typescript
// 获取有数据的所有日期
const dates = priceHistoryService.getAllHistoryDates()
console.log(dates)
// ['2025-01-01', '2025-01-02', '2025-01-03', ...]

// 获取所有快照
const snapshots = priceHistoryService.getAllSnapshots()
```

### 5. 统计信息

```typescript
const stats = priceHistoryService.getStats()
console.log(stats)
// {
//   totalDays: 30,
//   totalSymbols: 15,
//   dateRange: { start: '2025-01-01', end: '2025-01-30' },
//   storageSize: 245760  // bytes
// }
```

### 6. 数据清理

```typescript
// 清理90天前的旧数据（每次启动自动执行）
priceHistoryService.cleanOldData(90)

// 清理30天前的数据
priceHistoryService.cleanOldData(30)
```

### 7. 数据导出/导入

```typescript
// 导出所有数据（用于备份）
const jsonData = priceHistoryService.exportAllData()
// 保存到文件或上传到服务器

// 导入数据（从备份恢复）
const success = priceHistoryService.importData(jsonData)
console.log(success) // true or false
```

## 绘制资产曲线示例

### 单股票价格曲线

```typescript
import { priceHistoryService } from '@/lib/priceHistory'

function renderStockChart(symbol: string, days: number = 30) {
  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)
  
  const history = priceHistoryService.getPriceHistory(
    symbol,
    startDate.toISOString().split('T')[0],
    endDate.toISOString().split('T')[0]
  )
  
  // 绘制图表
  const chartData = {
    labels: history.map(h => h.date),
    datasets: [{
      label: symbol,
      data: history.map(h => h.price),
      borderColor: 'rgb(75, 192, 192)',
      tension: 0.1
    }]
  }
  
  // 使用 Chart.js 或其他图表库渲染
  return chartData
}
```

### 多股票组合价值曲线

```typescript
function renderPortfolioChart(positions: Position[], days: number = 30) {
  const snapshots = priceHistoryService.getAllSnapshots()
    .filter(s => {
      const date = new Date(s.date)
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - days)
      return date >= cutoff
    })
    .sort((a, b) => a.date.localeCompare(b.date))
  
  const chartData = snapshots.map(snapshot => {
    // 计算当日组合市值
    const totalValue = positions.reduce((sum, pos) => {
      const price = snapshot.prices[pos.symbol]
      return sum + (price ? price * pos.quantity : 0)
    }, 0)
    
    return {
      date: snapshot.date,
      value: totalValue
    }
  })
  
  return {
    labels: chartData.map(d => d.date),
    datasets: [{
      label: '组合市值',
      data: chartData.map(d => d.value),
      borderColor: 'rgb(54, 162, 235)',
      fill: true,
      tension: 0.1
    }]
  }
}
```

### 收益率曲线

```typescript
function renderReturnChart(positions: Position[], days: number = 30) {
  const snapshots = priceHistoryService.getAllSnapshots()
    .filter(s => {
      const date = new Date(s.date)
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - days)
      return date >= cutoff
    })
    .sort((a, b) => a.date.localeCompare(b.date))
  
  if (snapshots.length === 0) return null
  
  // 计算初始成本
  const initialCost = positions.reduce((sum, pos) => 
    sum + pos.avg_cost * pos.quantity, 0
  )
  
  const chartData = snapshots.map(snapshot => {
    const totalValue = positions.reduce((sum, pos) => {
      const price = snapshot.prices[pos.symbol]
      return sum + (price ? price * pos.quantity : 0)
    }, 0)
    
    const returnPercent = ((totalValue - initialCost) / initialCost) * 100
    
    return {
      date: snapshot.date,
      return: returnPercent
    }
  })
  
  return {
    labels: chartData.map(d => d.date),
    datasets: [{
      label: '收益率 (%)',
      data: chartData.map(d => d.return),
      borderColor: chartData.map(d => 
        d.return >= 0 ? 'rgb(75, 192, 75)' : 'rgb(255, 99, 132)'
      ),
      tension: 0.1
    }]
  }
}
```

## 存储空间管理

### 估算存储大小

- 每个股票价格：~50 bytes
- 每天10个股票：~500 bytes
- 90天数据：~45 KB
- 非常节省空间！

### 自动清理策略

系统启动时自动清理90天前的数据：

```typescript
// 在 main.tsx 中
useEffect(() => {
  priceHistoryService.cleanOldData(90)
}, [])
```

### 手动管理

```typescript
// 查看当前存储大小
const stats = priceHistoryService.getStats()
console.log(`存储大小: ${(stats.storageSize / 1024).toFixed(2)} KB`)

// 如果存储空间不足，减少保留天数
if (stats.storageSize > 500000) { // 500KB
  priceHistoryService.cleanOldData(30) // 只保留30天
}
```

## 注意事项

1. **UTC 时间**
   - 所有日期使用 UTC 时区
   - 避免夏令时和时区问题

2. **数据覆盖**
   - 同一天的数据会被覆盖
   - 保留的是当天最后一次更新的价格

3. **缺失数据**
   - 如果某天没有交易，该日期不会有数据
   - 查询时需要处理 `null` 值

4. **存储限制**
   - localStorage 通常限制 5-10MB
   - 当前设计90天数据远小于限制

5. **浏览器清理**
   - 清除浏览器数据会丢失历史价格
   - 建议定期导出备份

## 未来优化

- [ ] 支持 IndexedDB（更大存储空间）
- [ ] 压缩历史数据
- [ ] 云端同步备份
- [ ] 增量更新优化
- [ ] 支持分钟级历史数据
