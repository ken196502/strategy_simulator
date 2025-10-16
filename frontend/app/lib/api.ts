// Import removed - HK stock info now uses HTTP API

// Use relative URLs in production, localhost in development
const WS_URL = import.meta.env.DEV ? 'ws://localhost:2314' : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`
const HTTP_BASE_URL = import.meta.env.DEV ? 'http://localhost:2314/api' : '/api'

type MessageHandler = (message: any) => void
type VoidHandler = () => void
type CloseHandler = (event: CloseEvent) => void
type ErrorHandler = (event: Event) => void

class TradingApi {
  private ws: WebSocket | null = null
  private messageHandlers = new Set<MessageHandler>()
  private openHandlers = new Set<VoidHandler>()
  private closeHandlers = new Set<CloseHandler>()
  private errorHandlers = new Set<ErrorHandler>()

  // 获取cookie状态
  async getCookieStatus() {
    const response = await fetch(`${HTTP_BASE_URL}/xueqiu/cookie`)
    if (!response.ok) {
      throw new Error(`Failed to get cookie status: ${response.statusText}`)
    }
    return await response.json()
  }

  // 设置雪球cookie
  async setXueqiuCookie(cookieString: string) {
    const response = await fetch(`${HTTP_BASE_URL}/xueqiu/cookie`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cookie_string: cookieString }),
    })
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.message || 'Failed to set cookie')
    }
    
    return await response.json()
  }

  // 清除雪球cookie
  async clearXueqiuCookie() {
    const response = await fetch(`${HTTP_BASE_URL}/xueqiu/cookie`, {
      method: 'DELETE',
    })
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.message || 'Failed to clear cookie')
    }
    
    return await response.json()
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return this.ws
    }

    const socket = new WebSocket(WS_URL)
    this.ws = socket
    socket.addEventListener('open', this.handleOpen)
    socket.addEventListener('message', this.handleMessage)
    socket.addEventListener('close', this.handleClose)
    socket.addEventListener('error', this.handleError)
    return socket
  }

  disconnect() {
    if (!this.ws) return
    const socket = this.ws
    socket.removeEventListener('open', this.handleOpen)
    socket.removeEventListener('message', this.handleMessage)
    socket.removeEventListener('close', this.handleClose)
    socket.removeEventListener('error', this.handleError)
    socket.close()
    this.ws = null
    this.rejectPendingHkRequests(new Error('连接已断开'))
  }

  onMessage(handler: MessageHandler) {
    this.messageHandlers.add(handler)
    return () => {
      this.messageHandlers.delete(handler)
    }
  }

  onOpen(handler: VoidHandler) {
    this.openHandlers.add(handler)
    return () => {
      this.openHandlers.delete(handler)
    }
  }

  onClose(handler: CloseHandler) {
    this.closeHandlers.add(handler)
    return () => {
      this.closeHandlers.delete(handler)
    }
  }

  onError(handler: ErrorHandler) {
    this.errorHandlers.add(handler)
    return () => {
      this.errorHandlers.delete(handler)
    }
  }

  isSocketOpen() {
    return this.ws?.readyState === WebSocket.OPEN
  }

  getSocket() {
    return this.ws
  }

  send(message: any) {
    const socket = this.connect()
    const payload = JSON.stringify(message)

    if (socket.readyState === WebSocket.OPEN) {
      socket.send(payload)
      return
    }

    if (socket.readyState === WebSocket.CONNECTING) {
      const handleOpen = () => {
        socket.send(payload)
        socket.removeEventListener('open', handleOpen)
      }
      socket.addEventListener('open', handleOpen)
      return
    }

    // If socket is closing or closed, attempt a fresh connection and retry once it's open
    const retrySocket = this.connect()
    if (retrySocket.readyState === WebSocket.OPEN) {
      retrySocket.send(payload)
    } else if (retrySocket.readyState === WebSocket.CONNECTING) {
      const handleRetryOpen = () => {
        retrySocket.send(payload)
        retrySocket.removeEventListener('open', handleRetryOpen)
      }
      retrySocket.addEventListener('open', handleRetryOpen)
    }
  }

  bootstrap(username: string, initialCapital: number) {
    console.log(`🚀 [API] Sending bootstrap: username=${username}, initial_capital=${initialCapital}`)
    this.send({ type: 'bootstrap', username, initial_capital: initialCapital })
  }

  placeOrder(payload: any) {
    this.send({ type: 'place_order', ...payload })
  }

  cancelOrder(orderNo: string) {
    this.send({ type: 'cancel_order', order_no: orderNo })
  }

  requestSnapshot() {
    this.send({ type: 'get_snapshot' })
  }

  subscribeQuotes(symbols: string[]) {
    console.log(`📌 [API] Subscribing to quotes for:`, symbols)
    this.send({ type: 'subscribe_quotes', symbols })
  }

  async requestHkStockInfo(inputSymbol: string, timeoutMs?: number) {
    const sanitized = inputSymbol.trim().replace(/\D/g, '').padStart(5, '0')
    if (!sanitized) {
      throw new Error('请输入有效的股票代码')
    }

    try {
      const response = await fetch(`${HTTP_BASE_URL}/hk-stock-info/${sanitized}`, {
        signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: '获取港股信息失败' }))
        throw new Error(error.error || '获取港股信息失败')
      }

      const data = await response.json()
      return data.info
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError' || error.name === 'TimeoutError') {
          throw new Error('获取港股信息超时，请重试')
        }
        throw error
      }
      throw new Error('获取港股信息失败')
    }
  }

  private handleOpen = () => {
    this.openHandlers.forEach((handler) => handler())
  }

  private handleMessage = (event: MessageEvent) => {
    let data: any
    try {
      data = JSON.parse(event.data)
    } catch {
      return
    }

    this.messageHandlers.forEach((handler) => handler(data))
  }

  private handleClose = (event: CloseEvent) => {
    this.closeHandlers.forEach((handler) => handler(event))
    this.ws = null
  }

  private handleError = (event: Event) => {
    this.errorHandlers.forEach((handler) => handler(event))
  }
}

export const fetchAssetTrend = async (userId: number) => {
  const response = await fetch(`${HTTP_BASE_URL}/asset-trend?user_id=${userId}`)
  if (!response.ok) {
    throw new Error(await response.text())
  }
  const data = await response.json()
  return Array.isArray(data?.snapshots) ? data.snapshots : []
}

export const tradingApi = new TradingApi()

export default tradingApi
