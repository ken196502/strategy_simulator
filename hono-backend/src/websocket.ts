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

  register(userId: string, ws: WebSocket) {
    if (!this.connections.has(userId)) {
      this.connections.set(userId, new Set())
    }
    this.connections.get(userId)!.add(ws)
  }

  unregister(userId: string, ws: WebSocket) {
    const userConnections = this.connections.get(userId)
    if (userConnections) {
      userConnections.delete(ws)
      if (userConnections.size === 0) {
        this.connections.delete(userId)
      }
    }
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

async function sendSnapshot(userId: string) {
  try {
    const overview = getTradingOverview()
    const positions = getPositions()
    const orders = getOrders()
    const trades = getTrades()

    await connectionManager.sendToUser(userId, {
      type: 'snapshot',
      overview,
      positions,
      orders,
      trades,
      market_data: { status: 'ok' }, // Simplified for now
    })
  } catch (error) {
    console.error('Error sending snapshot:', error)
    await connectionManager.sendToUser(userId, {
      type: 'error',
      message: 'Failed to generate snapshot',
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
              
              await sendSnapshot(userId)
            }
            break

          case 'subscribe':
            if (message.user_id) {
              userId = message.user_id
              if (userId) {
                connectionManager.register(userId, ws)
                await sendSnapshot(userId)
              }
            } else {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'user_id required for subscribe',
              }))
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

              await connectionManager.sendToUser(userId, {
                type: executed ? 'order_filled' : 'order_placed',
                order_id: order.orderNo,
                status: executed ? 'FILLED' : 'PENDING',
              })

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
                await connectionManager.sendToUser(userId, {
                  type: 'order_cancelled',
                  order_no: message.order_no,
                })
                await sendSnapshot(userId)
              } else {
                await connectionManager.sendToUser(userId, {
                  type: 'error',
                  message: 'Order not found or not cancellable',
                })
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
            if (userId) {
              const trades = getTrades()
              await connectionManager.sendToUser(userId, {
                type: 'trades',
                trades,
              })
            }
            break

          case 'get_hk_stock_info':
            if (!userId) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'not bootstrapped',
              }))
              break
            }

            try {
              const stockInfo = await getHKStockInfo(message.symbol)
              await connectionManager.sendToUser(userId, {
                type: 'hk_stock_info',
                symbol: message.symbol,
                info: stockInfo,
              })
            } catch (error) {
              await connectionManager.sendToUser(userId, {
                type: 'hk_stock_info_error',
                symbol: message.symbol,
                message: error instanceof Error ? error.message : 'Unknown error',
              })
            }
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