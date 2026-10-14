'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { WSClient } from '@/lib/ws-client'
import type { TVInfo, PlaybackState } from '@/lib/types'
import { getSocketUrl } from '@/lib/server-url'

// ============================================================
// Server URL change subscription
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
function useClockSync(client: WSClient | null) {
  const [serverTimeOffset, setServerTimeOffset] = useState(0)
  const offsetRef = useRef(0)

  useEffect(() => {
    if (!client) return
    let stop = false
    let interval: NodeJS.Timeout | null = null
    let unsub: (() => void) | null = null

    const syncOnce = () => {
      if (stop || !client) return
      const t1 = Date.now()
      client.emit('sync-ping', { t1 })
    }

    unsub = client.on('sync-pong', (data: { t1: number; t2: number; t3: number }) => {
      const t4 = Date.now()
      const rtt = t4 - data.t1
      const offset = data.t3 - (data.t1 + rtt / 2)
      offsetRef.current = offsetRef.current * 0.7 + offset * 0.3
      setServerTimeOffset(offsetRef.current)
    })

    syncOnce()
    interval = setInterval(syncOnce, 10000)

    return () => {
      stop = true
      if (interval) clearInterval(interval)
      if (unsub) unsub()
    }
  }, [client])

  const getServerTime = useCallback(() => Date.now() + offsetRef.current, [])
  const getWaitUntil = useCallback(
    (targetServerTime: number) => targetServerTime - getServerTime(),
    [getServerTime]
  )

  return { serverTimeOffset, getServerTime, getWaitUntil }
}

// ============================================================
// Controller hook
// ============================================================
export function useControllerSocket() {
  const clientRef = useRef<WSClient | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [tvs, setTvs] = useState<TVInfo[]>([])
  const [playback, setPlayback] = useState<PlaybackState | null>(null)
  const [serverUrlVersion, setServerUrlVersion] = useState(0)

  useEffect(() => {
    const unsub = subscribeServerUrlChanges(() => setServerUrlVersion((v) => v + 1))
    return unsub
  }, [])

  useEffect(() => {
    const client = WSClient.fromSocketIoUrl(getSocketUrl())
    clientRef.current = client
    client.connect()

    const offConnect = client.onConnect(() => {
      setIsConnected(true)
      client.emit('register-controller', { name: 'Phone Controller' })
    })
    const offDisconnect = client.onDisconnect(() => setIsConnected(false))
    const offTvs = client.on('tvs-list', (data: { tvs: TVInfo[] }) => setTvs(data.tvs))
    const offPlayback = client.on('playback-state', (state: PlaybackState) => setPlayback(state))
    const offEnded = client.on('media-ended', () => {
      client.emit('command', { action: 'next', payload: {} })
    })

    return () => {
      offConnect()
      offDisconnect()
      offTvs()
      offPlayback()
      offEnded()
      client.disconnect()
      clientRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverUrlVersion])

  const sendCommand = useCallback((action: string, payload: any = {}) => {
    const client = clientRef.current
    if (client && client.connected) {
      client.emit('command', { action, payload })
    }
  }, [])

  return { isConnected, tvs, playback, sendCommand }
}

// ============================================================
// TV hook
// ============================================================
export function useTvSocket(tvName: string, tvId: string) {
  const clientRef = useRef<WSClient | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [loadMediaData, setLoadMediaData] = useState<any>(null)
  const [syncPlay, setSyncPlay] = useState<{ targetPlayAt: number; position: number } | null>(null)
  const [syncPause, setSyncPause] = useState<{ position: number } | null>(null)
  const [syncSeek, setSyncSeek] = useState<any>(null)
  const [syncStop, setSyncStop] = useState<boolean>(false)
  const [volume, setVolume] = useState(80)
  const [forceDisconnect, setForceDisconnect] = useState(false)
  const [serverUrlVersion, setServerUrlVersion] = useState(0)

  const [clientForClock, setClientForClock] = useState<WSClient | null>(null)
  const { getServerTime, getWaitUntil } = useClockSync(clientForClock)

  useEffect(() => {
    const unsub = subscribeServerUrlChanges(() => setServerUrlVersion((v) => v + 1))
    return unsub
  }, [])

  useEffect(() => {
    const client = WSClient.fromSocketIoUrl(getSocketUrl())
    clientRef.current = client
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setClientForClock(client)
    client.connect()

    const offConnect = client.onConnect(() => {
      setIsConnected(true)
      client.emit('register-tv', { tvId, name: tvName })
    })
    const offDisconnect = client.onDisconnect(() => setIsConnected(false))
    const offLoadMedia = client.on('load-media', (data: any) => setLoadMediaData(data))
    const offSyncPlay = client.on('sync-play', (data: { targetPlayAt: number; position: number }) => setSyncPlay(data))
    const offSyncPause = client.on('sync-pause', (data: { position: number }) => setSyncPause(data))
    const offSyncSeek = client.on('sync-seek', (data: any) => setSyncSeek(data))
    const offSyncStop = client.on('sync-stop', () => setSyncStop((v) => !v))
    const offVolume = client.on('set-volume', (data: { volume: number }) => setVolume(data.volume))
    const offForce = client.on('force-disconnect', () => setForceDisconnect(true))

    return () => {
      offConnect()
      offDisconnect()
      offLoadMedia()
      offSyncPlay()
      offSyncPause()
      offSyncSeek()
      offSyncStop()
      offVolume()
      offForce()
      client.disconnect()
      clientRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tvId, tvName, serverUrlVersion])

  const reportProgress = useCallback((position: number, isPlaying: boolean) => {
    const client = clientRef.current
    if (client && client.connected) {
      client.emit('tv-progress', { position, isPlaying })
    }
  }, [])

  const reportDuration = useCallback((duration: number) => {
    const client = clientRef.current
    if (client && client.connected) {
      client.emit('tv-duration', { duration })
    }
  }, [])

  const reportEnded = useCallback((mediaId: string) => {
    const client = clientRef.current
    if (client && client.connected) {
      client.emit('tv-media-ended', { mediaId })
    }
  }, [])

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
