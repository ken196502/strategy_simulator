# 前端本地存储架构说明

## 概述

本项目已修改为前端独立运行的模拟交易系统。除了行情数据从后端获取外，所有交易逻辑（下单、撤单、持仓管理等）都在前端执行，并使用浏览器的 localStorage 进行数据持久化。

## 架构变更

### 数据存储

所有交易数据现在存储在浏览器的 localStorage 中：

1. **资金数据** (`trading_overview`)
   - 初始资金：USD $10,000、HKD $78,000、CNY ¥72,000
   - 可用资金和冻结资金
   - 汇率信息

2. **持仓数据** (`trading_positions`)
   - 持仓列表
   - 持仓数量、成本价、市值、盈亏

3. **订单数据** (`trading_orders`)
   - 所有订单（待成交、已成交、已取消）
   - 订单详情（代码、方向、数量、价格等）

4. **成交记录** (`trading_trades`)
   - 所有成交历史
   - 成交价格、佣金等

### 核心模块

#### 1. storage.ts
提供本地存储的封装：
- `tradingStorage.initialize()` - 初始化默认数据
- `tradingStorage.getOverview()` - 获取资金概览
- `tradingStorage.saveOverview()` - 保存资金数据
- `tradingStorage.getPositions()` - 获取持仓
- `tradingStorage.savePositions()` - 保存持仓
- `tradingStorage.getOrders()` - 获取订单
- `tradingStorage.saveOrders()` - 保存订单
- `tradingStorage.getTrades()` - 获取成交记录
- `tradingStorage.saveTrades()` - 保存成交记录
- `tradingStorage.reset()` - 重置所有数据

#### 2. orderExecutor.ts
实现前端交易逻辑：
- `executePlaceOrder()` - 下单逻辑（验证余额、冻结资金）
- `executeFillOrder()` - 成交逻辑（更新持仓、解冻资金）
- `executeCancelOrder()` - 撤单逻辑（解冻资金、更新状态）

### 工作流程

#### 下单流程
1. 用户在 TradingPanel 输入订单信息
2. 调用 `placeOrder(payload)`
3. 前端执行 `executePlaceOrder()` 验证：
   - 买单：检查余额是否足够
   - 卖单：检查持仓是否足够
4. 验证通过后：
   - 创建订单（状态：pending）
   - 冻结相应资金（买单）
   - 保存到 localStorage
   - 立即请求刷新行情
5. 订单进入等待队列，等待行情匹配

#### 订单撮合流程
系统每 3 秒自动刷新行情，每次行情更新时：
1. 检查是否有待成交订单（status = pending）
2. 对每个待成交订单执行 `checkOrderCanFill()`：
   - **市价单**：有行情即可成交
   - **限价买单**：委托价 >= 当前市价时成交
   - **限价卖单**：委托价 <= 当前市价时成交
3. 满足条件的订单执行 `executeFillOrder()`：
   - 使用当前市价作为成交价（市价单）或委托价（限价单）
   - 更新订单状态为 filled
   - 更新持仓（买入增加、卖出减少）
   - 解冻资金并扣除佣金
   - 创建成交记录
   - 保存所有变更到 localStorage

#### 撤单流程
1. 用户点击撤单按钮
2. 调用 `cancelOrder(orderNo)`
3. 前端执行 `executeCancelOrder()`：
   - 更新订单状态为 cancelled
   - 解冻资金（如果是买单）
   - 保存到 localStorage

### 后端职责

后端现在仅负责：
1. **行情数据获取**：通过雪球API获取实时股票价格
2. **汇率更新**：提供最新的货币汇率
3. **价格推送**：通过WebSocket定时推送最新价格给前端

前端通过WebSocket接收：
- `snapshot` 消息中的持仓当前价格
- 汇率更新
- 行情状态（是否需要配置雪球Cookie）

### 数据同步

- **状态更新时机**：每次订单操作后立即保存到 localStorage
- **价格更新**：每10秒从后端获取最新价格，更新持仓市值和盈亏
- **页面刷新**：从 localStorage 恢复所有数据，不会丢失

### 佣金计算

简化的佣金规则：
- **美股**：0.3%，最低 $1
- **港股**：0.05%，最低 HKD $5
- **A股**：0.03%，最低 CNY ¥5

### 重置数据

如需重置所有交易数据，可在浏览器控制台执行：
```javascript
localStorage.removeItem('trading_overview')
localStorage.removeItem('trading_positions')
localStorage.removeItem('trading_orders')
localStorage.removeItem('trading_trades')
localStorage.removeItem('trading_initialized')
// 然后刷新页面
```

或使用 storage API：
```javascript
import { tradingStorage } from '@/lib/storage'
tradingStorage.reset()
```

## 优势

1. **独立运行**：前端可以完全离线运行模拟交易（除了获取行情）
2. **快速响应**：订单操作无需网络延迟，即时反馈
3. **数据持久化**：刷新页面不会丢失交易数据
4. **简单部署**：不需要复杂的后端订单管理系统
5. **易于测试**：可以在浏览器中直接查看和修改 localStorage 数据

## 限制

1. **单浏览器**：数据存储在浏览器本地，不同浏览器/设备无法共享
2. **存储限制**：localStorage 通常有 5-10MB 的限制
3. **无多用户**：目前是单用户模拟系统
4. **行情依赖**：仍需要后端提供实时行情数据
