/**
 * Native WebSocket client wrapper that mimics the socket.io-client interface
 * used by the app. This allows us to use a zero-dependency WebSocket server.
 */

type EventHandler = (data: any) => void

export class WSClient {
  private ws: WebSocket | null = null
  private url: string
  private listeners: Map<string, Set<EventHandler>> = new Map()
  private connectListeners: Set<() => void> = new Set()
  private disconnectListeners: Set<() => void> = new Set()
  private reconnectAttempts = 0
  private reconnectTimer: NodeJS.Timeout | null = null
  private shouldReconnect = true

  // Convert a socket.io-style URL to a native WebSocket URL
  static fromSocketIoUrl(socketIoUrl: string): WSClient {
    let wsUrl: string
    if (socketIoUrl.startsWith('/')) {
      // Relative URL - use current origin
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      wsUrl = `${proto}//${window.location.host}/`
    } else {
      // Absolute URL - convert http(s) to ws(s)
      wsUrl = socketIoUrl
        .replace(/^http:/, 'ws:')
        .replace(/^https:/, 'wss:')
      // Remove the XTransformPort query (not needed for direct WS)
      wsUrl = wsUrl.split('?')[0]
      // Add trailing slash if missing
      if (!wsUrl.endsWith('/')) wsUrl += '/'
    }
    return new WSClient(wsUrl)
  }

  constructor(url: string) {
    this.url = url
  }

  connect() {
    this.shouldReconnect = true
    this.doConnect()
  }

  private doConnect() {
    try {
      this.ws = new WebSocket(this.url)
    } catch (e) {
      console.error('[WS] Failed to create WebSocket:', e)
      this.scheduleReconnect()
      return
    }

    this.ws.onopen = () => {
      console.log('[WS] Connected')
      this.reconnectAttempts = 0
      this.connectListeners.forEach((cb) => cb())
    }

    this.ws.onclose = () => {
      console.log('[WS] Disconnected')
      this.disconnectListeners.forEach((cb) => cb())
      if (this.shouldReconnect) {
        this.scheduleReconnect()
      }
    }

    this.ws.onerror = (err) => {
      console.error('[WS] Error:', err)
    }

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        const { event: evt, data } = message
        if (evt) {
          this.listeners.get(evt)?.forEach((cb) => cb(data))
        }
      } catch (e) {
        console.error('[WS] Failed to parse message:', e)
      }
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return
    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 10000)
    this.reconnectAttempts++
    console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.doConnect()
    }, delay)
  }

  on(event: string, handler: EventHandler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(handler)
    return () => this.off(event, handler)
  }

  off(event: string, handler: EventHandler) {
    this.listeners.get(event)?.delete(handler)
  }

  onConnect(cb: () => void) {
    this.connectListeners.add(cb)
    return () => this.connectListeners.delete(cb)
  }

  onDisconnect(cb: () => void) {
    this.disconnectListeners.add(cb)
    return () => this.disconnectListeners.delete(cb)
  }

  emit(event: string, data: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ event, data }))
      return true
    }
    return false
  }

  get connected() {
    return this.ws?.readyState === WebSocket.OPEN
  }

  disconnect() {
    this.shouldReconnect = false
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      this.ws.onclose = null
      this.ws.close()
      this.ws = null
    }
  }
}
