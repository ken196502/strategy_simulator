import { WebSocket, WebSocketServer } from 'ws'
import {
  getOrders,
  getPositions,
  getTrades,
  getTradingOverview,
  placeOrder,
  executeOrder,
  cancelOrder,
  OrderError,
} from './orderService'
import { XueqiuMarketDataError, setCookieString } from './xueqiu'
import { getHKStockInfo } from './hk_stock_info'
import { getLatestPrice as getLatestPriceEastmoney } from './eastmoney'

interface WebSocketMessage {
  type: string
  [key: string]: any
}

interface ClientConnection {
  ws: WebSocket
  userId?: string
}

class ConnectionManager {
  private connections = new Map<string, Set<WebSocket>>()
  private userSubscriptions = new Map<string, Set<string>>() // userId -> Set<symbol>

  register(userId: string, ws: WebSocket) {
    if (!this.connections.has(userId)) {
      this.connections.set(userId, new Set())
    }
    this.connections.get(userId)!.add(ws)
    
    if (!this.userSubscriptions.has(userId)) {
      this.userSubscriptions.set(userId, new Set())
    }
  }

  unregister(userId: string, ws: WebSocket) {
    const userConnections = this.connections.get(userId)
    if (userConnections) {
      userConnections.delete(ws)
      if (userConnections.size === 0) {
        this.connections.delete(userId)
        this.userSubscriptions.delete(userId)
      }
    }
  }
  
  subscribeSymbol(userId: string, symbol: string) {
    if (!this.userSubscriptions.has(userId)) {
      this.userSubscriptions.set(userId, new Set())
    }
    this.userSubscriptions.get(userId)!.add(symbol)
    console.log(`📌 [订阅] 用户 ${userId} 订阅了 ${symbol}`)
  }
  
  getSubscribedSymbols(userId: string): Set<string> {
    return this.userSubscriptions.get(userId) || new Set()
  }

  async sendToUser(userId: string, message: any) {
    const userConnections = this.connections.get(userId)
    if (!userConnections) return

    const payload = JSON.stringify(message)
    const deadConnections: WebSocket[] = []

    for (const ws of userConnections) {
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(payload)
        } else {
          deadConnections.push(ws)
        }
      } catch (error) {
        console.error('Error sending message to client:', error)
        deadConnections.push(ws)
      }
    }

    // Clean up dead connections
    deadConnections.forEach(ws => userConnections.delete(ws))
  }

  // 获取所有连接
  getAllConnections(): Map<string, Set<WebSocket>> {
    return new Map(this.connections)
  }
}

const connectionManager = new ConnectionManager()

// 限流：每个用户最多5秒推送一次
const lastPushTime = new Map<string, number>()
const PUSH_INTERVAL = 5000 // 5秒

async function sendSnapshot(userId: string, force: boolean = false) {
  const now = Date.now()
  const lastTime = lastPushTime.get(userId) || 0
  
  if (!force && now - lastTime < PUSH_INTERVAL) {
    console.log(`⏱️  [WebSocket] 跳过推送 ${userId}，距离上次推送 ${Math.floor((now - lastTime) / 1000)}秒`)
    return
  }
  
  lastPushTime.set(userId, now)
  try {
    const positions = getPositions()
    const orders = getOrders()
    
    console.log(`📊 [sendSnapshot] 用户 ${userId}: ${positions.length} 个持仓, ${orders.length} 个订单`)

    // 获取需要推送行情的股票代码：持仓 + 订单 + 用户订阅
    const symbols = new Set<string>()
    positions.forEach(p => symbols.add(p.symbol))
    orders.forEach(o => symbols.add(o.symbol))
    
    // 重要：添加前端订阅的股票（即使后端没有订单/持仓）
    const subscribedSymbols = connectionManager.getSubscribedSymbols(userId)
    subscribedSymbols.forEach(s => symbols.add(s))
    
    console.log(`📋 [sendSnapshot] 需要获取行情的股票: ${Array.from(symbols).join(', ') || '(无)'}`)

    // 批量获取行情数据
    const quotes: Array<{ symbol: string; date: string; price: number }> = []
    const currentDate = new Date().toISOString().split('T')[0]
    
    for (const symbol of symbols) {
      try {
        const price = await getLatestPriceEastmoney(symbol)
        if (price > 0) {
          quotes.push({ 
            symbol, 
            date: currentDate, 
            price 
          })
          console.log(`📈 [WebSocket] 推送行情: ${symbol} ${currentDate} $${price}`)
        }
      } catch (error) {
        console.warn(`⚠️  [WebSocket] 获取行情失败: ${symbol}`, error)
      }
    }

    console.log(`📤 [sendSnapshot] 推送给 ${userId}: ${quotes.length} 条行情数据`)
    
    await connectionManager.sendToUser(userId, {
      type: 'market_data',
      quotes,
    })
    
  } catch (error) {
    console.error('Error sending market data:', error)
    await connectionManager.sendToUser(userId, {
      type: 'error',
      message: 'Failed to fetch market data',
    })
  }
}

export function setupWebSocketServer(server: any) {
  const wss = new WebSocketServer({ server })

  wss.on('connection', (ws: WebSocket) => {
    console.log('New WebSocket connection')
    let userId: string | undefined

    ws.on('message', async (data: Buffer) => {
      try {
        const message: WebSocketMessage = JSON.parse(data.toString())
        const { type } = message

        switch (type) {
          case 'bootstrap':
            // For demo purposes, we'll use a default user
            userId = message.username || 'demo'
            if (userId) {
              connectionManager.register(userId, ws)
              
              await connectionManager.sendToUser(userId, {
                type: 'bootstrap_ok',
                user: { id: userId, username: userId },
              })
              
              await sendSnapshot(userId, true) // 首次连接强制推送
            }
            break

          case 'subscribe':
            if (message.user_id) {
              userId = message.user_id
              if (userId) {
                connectionManager.register(userId, ws)
                await sendSnapshot(userId, true) // 首次订阅强制推送
              }
            } else {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'user_id required for subscribe',
              }))
            }
            break

          case 'subscribe_quotes':
            if (!userId) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'not bootstrapped',
              }))
              break
            }

            // 前端告诉后端它需要哪些股票的行情
            if (Array.isArray(message.symbols) && userId) {
              message.symbols.forEach((symbol: string) => {
                if (symbol && userId) {
                  connectionManager.subscribeSymbol(userId, symbol)
                }
              })
              // 立即推送一次行情
              await sendSnapshot(userId, true)
            }
            break

          case 'place_order':
            if (!userId) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'not bootstrapped',
              }))
              break
            }

            try {
              const order = await placeOrder({
                symbol: message.symbol,
                name: message.name || message.symbol,
                market: message.market,
                side: message.side,
                order_type: message.order_type || 'MARKET',
                price: message.price,
                quantity: message.quantity,
              })

              let executed = false
              try {
                await executeOrder(order.orderNo)
                executed = true
              } catch (execError) {
                console.log('Order execution failed, keeping as pending:', execError)
              }

              await sendSnapshot(userId)
            } catch (error) {
              const errorMessage = error instanceof OrderError || error instanceof XueqiuMarketDataError
                ? error.message
                : 'Unknown error placing order'
              
              await connectionManager.sendToUser(userId, {
                type: 'error',
                message: errorMessage,
              })
            }
            break

          case 'cancel_order':
            if (!userId) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'not bootstrapped',
              }))
              break
            }

            try {
              const success = await cancelOrder(message.order_no)
              if (success) {
                await sendSnapshot(userId)
              }
            } catch (error) {
              await connectionManager.sendToUser(userId, {
                type: 'error',
                message: error instanceof Error ? error.message : 'Unknown error',
              })
            }
            break

          case 'set_xueqiu_cookie':
            try {
              const cookieString = message.cookie_string || ''
              console.log(`[WebSocket] Setting cookie, length: ${cookieString.length}`)
              
              // 直接设置全局cookie
              setCookieString(cookieString)
              
              console.log(`[WebSocket] Cookie set successfully`)
              
              // 给所有连接发送更新通知
              for (const [uid, connections] of connectionManager.getAllConnections()) {
                for (const conn of connections) {
                  if (conn.readyState === WebSocket.OPEN) {
                    conn.send(JSON.stringify({
                      type: 'xueqiu_cookie_updated',
                      success: true
                    }))
                  }
                }
              }
            } catch (error) {
              console.error(`[WebSocket] Failed to set cookie:`, error)
              
              // 清除无效的cookie
              setCookieString('')
              
              // 给所有连接发送错误通知
              for (const [uid, connections] of connectionManager.getAllConnections()) {
                for (const conn of connections) {
                  if (conn.readyState === WebSocket.OPEN) {
                    conn.send(JSON.stringify({
                      type: 'xueqiu_cookie_updated',
                      success: false,
                      message: 'Failed to update Snowball cookie',
                      error: error instanceof Error ? error.message : 'Unknown error'
                    }))
                  }
                }
              }
            }
            break

          case 'get_snapshot':
            if (userId) {
              await sendSnapshot(userId)
            }
            break

          case 'get_trades':
            // Removed - only push market data
            break

          case 'get_hk_stock_info':
            // Removed - only push market data
            break

          case 'ping':
            ws.send(JSON.stringify({ type: 'pong' }))
            break

          default:
            ws.send(JSON.stringify({
              type: 'error',
              message: 'unknown message type',
            }))
            break
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error)
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Invalid message format',
        }))
      }
    })

    ws.on('close', () => {
      console.log('WebSocket connection closed')
      if (userId) {
        connectionManager.unregister(userId, ws)
      }
    })

    ws.on('error', (error) => {
      console.error('WebSocket error:', error)
      if (userId) {
        connectionManager.unregister(userId, ws)
      }
    })
  })

  return wss
}