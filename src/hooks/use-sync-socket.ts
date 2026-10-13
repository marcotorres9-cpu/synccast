'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import type { TVInfo, PlaybackState } from '@/lib/types'
import { getSocketUrl } from '@/lib/server-url'

// ============================================================
// Server URL change subscription (so socket reconnects when user changes URL)
// ============================================================
const serverUrlListeners = new Set<() => void>()
export function subscribeServerUrlChanges(cb: () => void) {
  serverUrlListeners.add(cb)
  return () => {
    serverUrlListeners.delete(cb)
  }
}
export function notifyServerUrlChanged() {
  serverUrlListeners.forEach((l) => l())
}

// ============================================================
// Clock sync hook (NTP-like)
// ============================================================
function useClockSync(socket: Socket | null) {
  const [serverTimeOffset, setServerTimeOffset] = useState(0)
  const offsetRef = useRef(0)

  useEffect(() => {
    if (!socket) return

    let stop = false

    const syncOnce = () => {
      if (stop || !socket) return
      const t1 = Date.now()
      socket.emit('sync-ping', { t1 })
    }

    const handler = (data: { t1: number; t2: number; t3: number }) => {
      const t4 = Date.now()
      const rtt = t4 - data.t1
      const offset = data.t3 - (data.t1 + rtt / 2)
      offsetRef.current = offsetRef.current * 0.7 + offset * 0.3
      setServerTimeOffset(offsetRef.current)
    }

    socket.on('sync-pong', handler)
    syncOnce()
    const interval = setInterval(syncOnce, 10000)

    return () => {
      stop = true
      clearInterval(interval)
      socket.off('sync-pong', handler)
    }
  }, [socket])

  const getServerTime = useCallback(() => {
    return Date.now() + offsetRef.current
  }, [])

  const getWaitUntil = useCallback((targetServerTime: number) => {
    return targetServerTime - getServerTime()
  }, [getServerTime])

  return { serverTimeOffset, getServerTime, getWaitUntil }
}

// ============================================================
// Controller hook
// ============================================================
export function useControllerSocket() {
  const socketRef = useRef<Socket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [tvs, setTvs] = useState<TVInfo[]>([])
  const [playback, setPlayback] = useState<PlaybackState | null>(null)
  const [serverUrlVersion, setServerUrlVersion] = useState(0)

  useEffect(() => {
    const unsub = subscribeServerUrlChanges(() => setServerUrlVersion((v) => v + 1))
    return unsub
  }, [])

  useEffect(() => {
    const socketInstance = io(getSocketUrl(), {
      transports: ['websocket', 'polling'],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      timeout: 10000,
    })

    socketRef.current = socketInstance

    const onConnect = () => {
      setIsConnected(true)
      socketInstance.emit('register-controller', { name: 'Phone Controller' })
    }
    const onDisconnect = () => setIsConnected(false)
    const onTvsList = (data: { tvs: TVInfo[] }) => setTvs(data.tvs)
    const onPlaybackState = (state: PlaybackState) => setPlayback(state)
    const onMediaEnded = () => {
      socketInstance.emit('command', { action: 'next', payload: {} })
    }

    socketInstance.on('connect', onConnect)
    socketInstance.on('disconnect', onDisconnect)
    socketInstance.on('tvs-list', onTvsList)
    socketInstance.on('playback-state', onPlaybackState)
    socketInstance.on('media-ended', onMediaEnded)

    return () => {
      socketInstance.off('connect', onConnect)
      socketInstance.off('disconnect', onDisconnect)
      socketInstance.off('tvs-list', onTvsList)
      socketInstance.off('playback-state', onPlaybackState)
      socketInstance.off('media-ended', onMediaEnded)
      socketInstance.disconnect()
      socketRef.current = null
    }
     
  }, [serverUrlVersion])

  const sendCommand = useCallback(
    (action: string, payload: any = {}) => {
      const socket = socketRef.current
      if (socket && socket.connected) {
        socket.emit('command', { action, payload })
      }
    },
    []
  )

  return { isConnected, tvs, playback, sendCommand }
}

// ============================================================
// TV hook
// ============================================================
export function useTvSocket(tvName: string, tvId: string) {
  const socketRef = useRef<Socket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [loadMediaData, setLoadMediaData] = useState<any>(null)
  const [syncPlay, setSyncPlay] = useState<{ targetPlayAt: number; position: number } | null>(null)
  const [syncPause, setSyncPause] = useState<{ position: number } | null>(null)
  const [syncSeek, setSyncSeek] = useState<any>(null)
  const [syncStop, setSyncStop] = useState<boolean>(false)
  const [volume, setVolume] = useState(80)
  const [forceDisconnect, setForceDisconnect] = useState(false)
  const [serverUrlVersion, setServerUrlVersion] = useState(0)

  const [socketForClock, setSocketForClock] = useState<Socket | null>(null)
  const { getServerTime, getWaitUntil } = useClockSync(socketForClock)

  useEffect(() => {
    const unsub = subscribeServerUrlChanges(() => setServerUrlVersion((v) => v + 1))
    return unsub
  }, [])

  useEffect(() => {
    const socketInstance = io(getSocketUrl(), {
      transports: ['websocket', 'polling'],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      timeout: 10000,
    })

    socketRef.current = socketInstance
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSocketForClock(socketInstance)

    const onConnect = () => {
      setIsConnected(true)
      socketInstance.emit('register-tv', { tvId, name: tvName })
    }
    const onDisconnect = () => setIsConnected(false)
    const onLoadMedia = (data: any) => setLoadMediaData(data)
    const onSyncPlay = (data: { targetPlayAt: number; position: number }) => setSyncPlay(data)
    const onSyncPause = (data: { position: number }) => setSyncPause(data)
    const onSyncSeek = (data: any) => setSyncSeek(data)
    const onSyncStop = () => setSyncStop((v) => !v)
    const onSetVolume = (data: { volume: number }) => setVolume(data.volume)
    const onForceDisconnect = () => setForceDisconnect(true)

    socketInstance.on('connect', onConnect)
    socketInstance.on('disconnect', onDisconnect)
    socketInstance.on('load-media', onLoadMedia)
    socketInstance.on('sync-play', onSyncPlay)
    socketInstance.on('sync-pause', onSyncPause)
    socketInstance.on('sync-seek', onSyncSeek)
    socketInstance.on('sync-stop', onSyncStop)
    socketInstance.on('set-volume', onSetVolume)
    socketInstance.on('force-disconnect', onForceDisconnect)

    return () => {
      socketInstance.off('connect', onConnect)
      socketInstance.off('disconnect', onDisconnect)
      socketInstance.off('load-media', onLoadMedia)
      socketInstance.off('sync-play', onSyncPlay)
      socketInstance.off('sync-pause', onSyncPause)
      socketInstance.off('sync-seek', onSyncSeek)
      socketInstance.off('sync-stop', onSyncStop)
      socketInstance.off('set-volume', onSetVolume)
      socketInstance.off('force-disconnect', onForceDisconnect)
      socketInstance.disconnect()
      socketRef.current = null
    }
     
  }, [tvId, tvName, serverUrlVersion])

  const reportProgress = useCallback(
    (position: number, isPlaying: boolean) => {
      const socket = socketRef.current
      if (socket && socket.connected) {
        socket.emit('tv-progress', { position, isPlaying })
      }
    },
    []
  )

  const reportDuration = useCallback(
    (duration: number) => {
      const socket = socketRef.current
      if (socket && socket.connected) {
        socket.emit('tv-duration', { duration })
      }
    },
    []
  )

  const reportEnded = useCallback(
    (mediaId: string) => {
      const socket = socketRef.current
      if (socket && socket.connected) {
        socket.emit('tv-media-ended', { mediaId })
      }
    },
    []
  )

  return {
    isConnected,
    loadMediaData,
    syncPlay,
    syncPause,
    syncSeek,
    syncStop,
    volume,
    forceDisconnect,
    getServerTime,
    getWaitUntil,
    reportProgress,
    reportDuration,
    reportEnded,
  }
}
