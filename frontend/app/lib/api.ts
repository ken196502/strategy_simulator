import {
  formatSymbolForMarket,
  normalizeSymbol,
  requestHkStockInfo as requestHkStockInfoHelper,
  type PendingHkRequestsMap,
} from '@/lib/trading'

const WS_URL = 'ws://localhost:2314'
const HTTP_BASE_URL = 'http://localhost:2314'

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
  private pendingHkRequests: PendingHkRequestsMap = new Map()

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


  requestHkStockInfo(inputSymbol: string, timeoutMs?: number) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('交易连接未就绪'))
    }

    return requestHkStockInfoHelper({
      ws: this.ws,
      pendingRequests: this.pendingHkRequests,
      inputSymbol,
      timeoutMs,
    })
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

    if (data?.type === 'hk_stock_info' || data?.type === 'hk_stock_info_error') {
      this.handleHkStockInfoResponse(data)
    }

    this.messageHandlers.forEach((handler) => handler(data))
  }

  private handleClose = (event: CloseEvent) => {
    this.rejectPendingHkRequests(new Error('连接已断开'))
    this.closeHandlers.forEach((handler) => handler(event))
    this.ws = null
  }

  private handleError = (event: Event) => {
    this.errorHandlers.forEach((handler) => handler(event))
  }

  private handleHkStockInfoResponse(message: any) {
    const symbolValue = message?.symbol ?? ''
    const key = normalizeSymbol(symbolValue)
    const formatted = formatSymbolForMarket(symbolValue, 'HK')
    const fallbackKey = formatted ? normalizeSymbol(formatted) : null
    const targetKey = this.pendingHkRequests.has(key)
      ? key
      : fallbackKey && this.pendingHkRequests.has(fallbackKey)
        ? fallbackKey
        : null

    if (!targetKey) {
      return
    }

    const pending = this.pendingHkRequests.get(targetKey)
    if (!pending) {
      return
    }

    clearTimeout(pending.timeoutId)

    if (message.type === 'hk_stock_info') {
      pending.resolve.forEach((resolver) => resolver(message.info))
    } else {
      const error = new Error(message.message || '无法获取港股信息')
      pending.reject.forEach((rejecter) => rejecter(error))
    }

    this.pendingHkRequests.delete(targetKey)
  }

  private rejectPendingHkRequests(error: Error) {
    this.pendingHkRequests.forEach(({ reject, timeoutId }) => {
      clearTimeout(timeoutId)
      reject.forEach((rejecter) => rejecter(error))
    })
    this.pendingHkRequests.clear()
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
