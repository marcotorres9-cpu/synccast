/**
 * Socket.io client wrapper that mimics the previous WSClient interface.
 * Uses socket.io-client which works through any HTTP proxy with polling fallback.
 */

import { io, Socket } from 'socket.io-client'
import { getServerUrl } from './server-url'

type EventHandler = (data: any) => void

export class WSClient {
  private socket: Socket | null = null
  private socketUrl: string
  private listeners: Map<string, Set<EventHandler>> = new Map()
  private connectListeners: Set<() => void> = new Set()
  private disconnectListeners: Set<() => void> = new Set()
  private shouldReconnect = true

  static fromSocketIoUrl(socketIoUrl: string): WSClient {
    // For socket.io, we use the URL as-is. socket.io-client will handle
    // the protocol conversion automatically.
    return new WSClient(socketIoUrl)
  }

  constructor(url: string) {
    this.socketUrl = url
  }

  connect() {
    this.shouldReconnect = true

    // Determine the actual URL to connect to
    let url: string
    let options: any = {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      timeout: 10000,
    }

    if (this.socketUrl.startsWith('/')) {
      // Relative URL - use same origin (works in browser)
      url = this.socketUrl
    } else {
      // Absolute URL - extract base URL and path
      try {
        const u = new URL(this.socketUrl)
        url = `${u.protocol}//${u.host}`
        const path = u.pathname.replace(/\/+$/, '')
        if (path && path !== '/') {
          options.path = path + '/'
        }
      } catch {
        url = this.socketUrl
      }
    }

    this.socket = io(url, options)

    this.socket.on('connect', () => {
      console.log('[Socket.io] Connected')
      this.connectListeners.forEach((cb) => cb())
    })

    this.socket.on('disconnect', () => {
      console.log('[Socket.io] Disconnected')
      this.disconnectListeners.forEach((cb) => cb())
    })

    this.socket.on('connect_error', (err: any) => {
      console.error('[Socket.io] Connection error:', err.message)
    })

    // Listen for all events and forward to listeners
    this.socket.onAny((eventName: string, ...args: any[]) => {
      const data = args[0]
      this.listeners.get(eventName)?.forEach((cb) => cb(data))
    })
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
    if (this.socket) {
      this.socket.emit(event, data)
      return true
    }
    return false
  }

  get connected() {
    return this.socket?.connected || false
  }

  disconnect() {
    this.shouldReconnect = false
    if (this.socket) {
      this.socket.removeAllListeners()
      this.socket.disconnect()
      this.socket = null
    }
  }
}
