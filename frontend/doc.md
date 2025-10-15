# 自研模拟交易系统

## 改造概述

1. 不使用统一购买力，按币种显示购买力
2. 固定初始资金和汇率
3. 不监控盘口，只要买入价高于当前价或卖出价低于当前价就成交
3. 开盘时通过用持仓x最新价/（1+涨幅）/昨收价来校正持仓，应对公司行动
4. 不做比赛，但每个表预留match id字段


## 核心数据结构

### 1. 用户资产概览 (Overview)
```typescript
interface Overview {
  user: {
    id: number
    username: string
    // 美元账户
    current_cash_usd: number
    frozen_cash_usd: number
    // 港币账户  
    current_cash_hkd: number
    frozen_cash_hkd: number
    // 人民币账户
    current_cash_cny: number
    frozen_cash_cny: number
  }
  balances_by_currency: {
    usd: CurrencyBalance
    hkd: CurrencyBalance  
    cny: CurrencyBalance
  }
  total_assets_usd: number          // 美元计价总资产
  positions_value_usd: number      // 美元计价持仓价值
  positions_value_by_currency: {
    usd: number, hkd: number, cny: number
  }
  exchange_rates: {
    usd: 1, hkd: 0.1289, cny: 0.138
  }
}

interface CurrencyBalance {
  current_cash: number    // 可用现金
  frozen_cash: number     // 冻结资金
}
```

### 2. 持仓数据结构
```typescript
interface Position {
  id: number
  symbol: string           // 股票代码，如 "AAPL.US"
  quantity: number         // 持股数量
  avg_cost: number         // 平均成本价
  current_price: number    // 当前市价
  market_value: number     // 市值
  pnl: number             // 盈亏金额
  pnl_percent: number     // 盈亏百分比
  market: 'US' | 'HK' | 'CN'
  created_at: string
  updated_at: string
}
```

### 3. 订单数据结构
```typescript
interface Order {
  id: number
  order_no: string         // 唯一订单号
  symbol: string
  side: 'buy' | 'sell'
  quantity: number
  price: number           // 委托价格
  filled_quantity: number // 已成交数量
  order_type: 'limit' | 'market'
  status: 'pending' | 'filled' | 'cancelled'
  market: 'US' | 'HK' | 'CN'
  created_at: string
  updated_at: string
}
```

### 4. 成交记录结构
```typescript
interface Trade {
  id: number
  order_no: string
  symbol: string
  side: 'buy' | 'sell'
  quantity: number
  price: number           // 实际成交价
  commission: number      // 手续费
  market: 'US' | 'HK' | 'CN'
  executed_at: string
}
```

## 本地存储架构

### 初始化数据
系统首次运行时自动创建默认账户：
- 美元: $10,000
- 港币: HKD 78,000  
- 人民币: CNY 72,000

## 订单执行引擎

### 1. 订单状态机管理

#### 状态流转设计
订单生命周期采用严格的状态机控制，确保交易的确定性：

**状态定义**：
- **pending**: 下单成功后的待成交状态
- **filled**: 完全成交的终态
- **cancelled**: 用户取消的终态

**转换规则**：
- pending → filled: 成交条件满足时触发
- pending → cancelled: 用户主动取消触发
- filled/cancelled: 不可逆终态，确保交易记录完整性

#### 设计决策
采用状态机而非简单的布尔值标记状态，避免了并发操作下的状态混乱，为后续扩展部分成交、分批处理等功能预留了架构空间。

### 2. 多层验证策略

#### 验证架构
采用两层验证机制，快速失败并精确定位错误原因：

**第一层：参数完整性验证**
- 必填字段检查（股票代码、买卖方向、数量、价格等）
- 数值范围验证（价格和数量必须为正数）
- 市场代码有效性验证（仅支持US/HK/CN）

**第二层：业务逻辑验证**
- 资金充足性检查（买单是否满足交易金额）
- 持仓可用性检查（卖单是否有足够数量）
- 币种余额实时验证

#### 容错设计
每层验证都返回结构化错误信息，前端可根据错误类型进行精准的用户提示和操作引导。

### 3. 资金冻结与解冻机制

#### 原子性操作设计
买入订单采用立即冻结策略，卖出订单采用成交时扣款策略：

**买单冻结逻辑**：
- 计算冻结总额 = 交易金额 + 预估佣金
- 从可用现金扣减，等额增加冻结资金
- 使用深度拷贝保证状态更新的原子性
- 同步更新用户字段和余额字段，保持数据一致性

**卖单处理策略**：
- 下单时不冻结持仓，避免复杂的持仓部分冻结逻辑
- 成交时直接扣减持仓，简化并发处理复杂度

#### 精度控制
所有金额计算采用四舍五入保留2位小数，避免浮点数精度问题导致的资金计算偏差。

### 4. 智能成交判断

#### 行情时效性验证
系统对行情数据进行多重验证，确保成交决策基于有效信息：

**数据有效性检查**：
- 检查是否存在对应股票的实时行情
- 验证行情数据的时间戳，拒绝超过30秒的过期数据
- 为网络延迟和系统故障提供容错处理

#### 成交条件决策
基于订单类型和市场价格的精确条件判断：

**市价单策略**：
- 有有效行情即可立即成交
- 成交价格使用当前市价，确保执行效率

**限价单策略**：
- 买单：委托价格 >= 市价时成交（用户愿意高价买入）
- 卖单：委托价格 <= 市价时成交（用户愿意低价卖出）
- 成交价格使用委托价格，保证价格确定性

### 5. 持仓动态更新算法

#### 持仓合并策略
买入交易的持仓更新采用加权平均成本算法：

**新增持仓逻辑**：
- 首次买入该股票时创建新持仓记录
- 成本价使用成交价格，初始盈亏设为零

**现有持仓合并**：
- 新的持仓数量 = 原数量 + 新买入数量
- 新的平均成本 = (原成本×原数量 + 新成本×新数量) / 新数量
- 保持成本计算的连续性和准确性

#### 卖出处理机制
卖出时采用精确的持仓扣减策略：

**部分卖出处理**：
- 按卖出数量等比例扣减持仓
- 平均成本保持不变，确保盈亏计算一致性
- 持仓归零时自动删除该记录，保持数据整洁

### 6. 多币种资金结算

#### 币种隔离设计
每个市场的资金独立管理，避免跨市场资金混用：

**买入结算**：
- 买入资金从对应币种的冻结资金中扣除
- 持仓价值不计入可用现金，而是单独计算
- 保持现金和投资的清晰分离

**卖出结算**：
- 卖出所得计入对应币种的可用现金
- 佣金从卖出所得中扣除
- 现金增加 = 交易金额 - 佣金

#### 汇率转换统一
所有资产最终转换为美元计价显示，但底层数据保持原币种存储，确保数据准确性和可追溯性。

### 7. 佣金计算体系

#### 市场差异化定价
不同市场采用独立的佣金计算规则：

**美国市场**：
- 按交易金额0.3%计算
- 最低收费1美元
- 典型的大额交易佣金率较低

**香港市场**：
- 按交易金额0.05%计算  
- 最低收费5港币
- 整体费率相对较低

**中国A股**：
- 按交易金额0.03%计算
- 最低收费5人民币
- 费率最低，但有限额要求

#### 风险控制机制
系统识别特殊交易场景并进行风控提示：

**碎股交易识别**：
- 港股要求100股整数倍，检测碎股交易
- 提供用户友好的错误提示

**大额交易监控**：
- 单笔交易超过10万美元时触发风控提示
- 防止用户误操作导致的重大风险

### 8. 批量处理引擎

#### 并发安全设计
批量订单处理采用时间顺序优先的策略：

**处理优先级**：
- 按订单创建时间排序，确保FIFO（先进先出）
- 使用Set防止重复处理同一订单
- 状态实时同步，避免脏数据

**容错恢复**：
- 单个订单处理失败不影响其他订单
- 提供处理结果统计，便于问题排查
- 自动重试机制处理临时性失败

### 9. 订单取消机制

#### 取消条件验证
严格的取消条件检查，确保业务规则的严谨性：

**状态检查**：
- 仅pending状态订单可取消
- 已成交订单不可取消，确保交易记录完整性
- 支持未来扩展部分成交订单的取消逻辑

**资金释放逻辑**：
- 仅买单需要释放冻结资金
- 卖单无需资金操作，简化处理逻辑
- 释放金额精确到分，避免资金损失

## 行情数据管理

### 实时行情服务 (MarketDataService)
```typescript
class MarketDataService {
  private quotes: Map<string, StockQuote>  // 内存缓存
  private positions: Set<string>           // 持仓股票列表
  
  // 智能刷新策略
  shouldRefresh(): boolean {
    // 1. 防频繁请求 (最小3秒间隔)
    // 2. 检查市场开盘时间
    // 3. 非交易时间降低频率 (60秒)
  }
}
```

### 行情来源
1. **WebSocket推送**: 后端实时推送持仓股票价格
2. **主动请求**: `requestSnapshot()` 按需获取最新数据
3. **市场过滤**: 只刷新开盘市场的股票

## 历史价格服务

### PriceHistoryService
```typescript
interface DailyPrice {
  symbol: string
  price: number
  timestamp: number
}

interface DailyPriceSnapshot {
  date: string              // YYYY-MM-DD (UTC)
  prices: Record<string, number>  // symbol -> price
  timestamp: number         // 最后更新时间
}
```

### 数据存储策略
- **按日存储**: 每个交易日创建独立价格快照
- **覆盖更新**: 同一天多次更新会覆盖当日数据
- **自动清理**: 保留最近90天，自动清理旧数据
- **备份恢复**: 支持数据导出/导入

## 资产曲线计算

### 实时资产计算
```typescript
// 总资产 = 现金 + 持仓市值
total_assets_usd = sum(current_cash_by_currency_usd) + 
                   sum(positions_value_usd)

// 持仓市值计算
positions.forEach(pos => {
  const currentQuote = marketDataService.getQuote(pos.symbol)
  pos.current_price = currentQuote?.current_price || pos.current_price
  pos.market_value = pos.current_price * pos.quantity
  pos.pnl = (pos.current_price - pos.avg_cost) * pos.quantity
  pos.pnl_percent = ((pos.current_price / pos.avg_cost) - 1) * 100
})
```

### 多币种统一汇率
```typescript
// 汇率转换
exchange_rates = { usd: 1, hkd: 0.1289, cny: 0.138 }

// 非美元资产转换美元
const usdValue = {
  usd: value * 1,
  hkd: value * 0.1289, 
  cny: value * 0.138
}
```

### 资产曲线生成
1. **每日快照**: 结合历史价格和当日持仓计算每日资产
2. **时间序列**: 按日期排序生成资产变化曲线
3. **收益计算**: 相对于初始资产的累计收益和百分比