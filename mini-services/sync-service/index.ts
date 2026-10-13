import { createServer } from 'http'
import { Server, Socket } from 'socket.io'

const httpServer = createServer()
const io = new Server(httpServer, {
  path: '/',
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
})

// ============================================================
// Types
// ============================================================
type ClientRole = 'tv' | 'controller'

interface TVClient {
  socketId: string
  tvId: string
  name: string
  isOnline: boolean
  volume: number
  lastSeen: number
}

interface ControllerClient {
  socketId: string
  name: string
}

interface PlaybackState {
  mediaId: string | null
  mediaType: 'video' | 'audio' | null
  mediaName: string | null
  mediaUrl: string | null
  isPlaying: boolean
  position: number // seconds
  duration: number
  targetPlayAt: number | null // absolute timestamp (server time) when playback should start/resume
  targetPosition: number // position in seconds at targetPlayAt
  playlistId: string | null
  playlistIndex: number
  playlist: Array<{ id: string; name: string; url: string; type: string; duration: number }>
}

// ============================================================
// State
// ============================================================
const tvs = new Map<string, TVClient>()
const controllers = new Map<string, ControllerClient>()

let playbackState: PlaybackState = {
  mediaId: null,
  mediaType: null,
  mediaName: null,
  mediaUrl: null,
  isPlaying: false,
  position: 0,
  duration: 0,
  targetPlayAt: null,
  targetPosition: 0,
  playlistId: null,
  playlistIndex: 0,
  playlist: [],
}

// ============================================================
// Helpers
// ============================================================
function getTVsList() {
  return Array.from(tvs.values()).map((tv) => ({
    tvId: tv.tvId,
    name: tv.name,
    isOnline: tv.isOnline,
    volume: tv.volume,
    lastSeen: tv.lastSeen,
  }))
}

function broadcastTVsList() {
  io.to('controllers').emit('tvs-list', { tvs: getTVsList() })
}

function broadcastPlaybackState() {
  io.to('controllers').emit('playback-state', playbackState)
}

function getServerTime() {
  return Date.now()
}

// ============================================================
// Connection handling
// ============================================================
io.on('connection', (socket: Socket) => {
  console.log(`[CONNECT] ${socket.id}`)

  // ----------------------------------------------------------
  // Clock sync (NTP-like)
  // ----------------------------------------------------------
  socket.on('sync-ping', (data: { t1: number }) => {
    const t2 = getServerTime()
    socket.emit('sync-pong', { t1: data.t1, t2, t3: getServerTime() })
  })

  // ----------------------------------------------------------
  // Register as TV
  // ----------------------------------------------------------
  socket.on('register-tv', (data: { tvId: string; name: string }) => {
    socket.join('tvs')
    socket.data.role = 'tv'
    socket.data.tvId = data.tvId

    const tv: TVClient = {
      socketId: socket.id,
      tvId: data.tvId,
      name: data.name,
      isOnline: true,
      volume: 80,
      lastSeen: Date.now(),
    }
    tvs.set(socket.id, tv)

    console.log(`[TV REGISTERED] ${data.name} (${data.tvId})`)
    broadcastTVsList()
    // Send current playback state to the newly registered TV
    socket.emit('playback-state', playbackState)
  })

  // ----------------------------------------------------------
  // Register as Controller
  // ----------------------------------------------------------
  socket.on('register-controller', (data: { name: string }) => {
    socket.join('controllers')
    socket.data.role = 'controller'

    controllers.set(socket.id, {
      socketId: socket.id,
      name: data.name || 'Controller',
    })

    console.log(`[CONTROLLER REGISTERED] ${data.name}`)
    // Send current state to the controller
    socket.emit('tvs-list', { tvs: getTVsList() })
    socket.emit('playback-state', playbackState)
  })

  // ----------------------------------------------------------
  // Controller commands
  // ----------------------------------------------------------
  socket.on('command', (data: any) => {
    if (socket.data.role !== 'controller') return

    const { action, payload } = data
    const now = getServerTime()
    // 500ms buffer for sync
    const buffer = 500

    switch (action) {
      case 'load-playlist': {
        const playlist = payload.playlist || []
        const startIndex = payload.startIndex || 0
        playbackState = {
          ...playbackState,
          mediaId: playlist[startIndex]?.id || null,
          mediaType: playlist[startIndex]?.type || null,
          mediaName: playlist[startIndex]?.name || null,
          mediaUrl: playlist[startIndex]?.url || null,
          isPlaying: false,
          position: 0,
          duration: playlist[startIndex]?.duration || 0,
          targetPlayAt: null,
          targetPosition: 0,
          playlistId: payload.playlistId || null,
          playlistIndex: startIndex,
          playlist,
        }
        io.to('tvs').emit('load-media', {
          mediaId: playbackState.mediaId,
          mediaType: playbackState.mediaType,
          mediaName: playbackState.mediaName,
          mediaUrl: playbackState.mediaUrl,
          duration: playbackState.duration,
          playlist: playbackState.playlist,
          playlistIndex: playbackState.playlistIndex,
        })
        broadcastPlaybackState()
        break
      }
      case 'play': {
        const fromPosition = typeof payload.position === 'number' ? payload.position : playbackState.position
        playbackState.isPlaying = true
        playbackState.position = fromPosition
        playbackState.targetPosition = fromPosition
        playbackState.targetPlayAt = now + buffer
        io.to('tvs').emit('sync-play', {
          targetPlayAt: playbackState.targetPlayAt,
          position: fromPosition,
        })
        broadcastPlaybackState()
        break
      }
      case 'pause': {
        playbackState.isPlaying = false
        playbackState.targetPlayAt = null
        if (typeof payload.position === 'number') {
          playbackState.position = payload.position
          playbackState.targetPosition = payload.position
        }
        io.to('tvs').emit('sync-pause', { position: playbackState.position })
        broadcastPlaybackState()
        break
      }
      case 'seek': {
        const newPosition = payload.position || 0
        playbackState.position = newPosition
        playbackState.targetPosition = newPosition
        if (playbackState.isPlaying) {
          playbackState.targetPlayAt = now + buffer
          io.to('tvs').emit('sync-seek', {
            position: newPosition,
            isPlaying: true,
            targetPlayAt: playbackState.targetPlayAt,
          })
        } else {
          io.to('tvs').emit('sync-seek', {
            position: newPosition,
            isPlaying: false,
            targetPlayAt: null,
          })
        }
        broadcastPlaybackState()
        break
      }
      case 'next': {
        const nextIndex = playbackState.playlistIndex + 1
        if (nextIndex < playbackState.playlist.length) {
          playbackState.playlistIndex = nextIndex
          const item = playbackState.playlist[nextIndex]
          playbackState.mediaId = item.id
          playbackState.mediaType = item.type as any
          playbackState.mediaName = item.name
          playbackState.mediaUrl = item.url
          playbackState.duration = item.duration
          playbackState.position = 0
          playbackState.targetPosition = 0
          if (playbackState.isPlaying) {
            playbackState.targetPlayAt = now + buffer
            io.to('tvs').emit('load-media', {
              mediaId: playbackState.mediaId,
              mediaType: playbackState.mediaType,
              mediaName: playbackState.mediaName,
              mediaUrl: playbackState.mediaUrl,
              duration: playbackState.duration,
              playlist: playbackState.playlist,
              playlistIndex: playbackState.playlistIndex,
              autoPlay: true,
              targetPlayAt: playbackState.targetPlayAt,
            })
          } else {
            io.to('tvs').emit('load-media', {
              mediaId: playbackState.mediaId,
              mediaType: playbackState.mediaType,
              mediaName: playbackState.mediaName,
              mediaUrl: playbackState.mediaUrl,
              duration: playbackState.duration,
              playlist: playbackState.playlist,
              playlistIndex: playbackState.playlistIndex,
            })
          }
          broadcastPlaybackState()
        }
        break
      }
      case 'previous': {
        const prevIndex = Math.max(0, playbackState.playlistIndex - 1)
        if (prevIndex !== playbackState.playlistIndex) {
          playbackState.playlistIndex = prevIndex
          const item = playbackState.playlist[prevIndex]
          playbackState.mediaId = item.id
          playbackState.mediaType = item.type as any
          playbackState.mediaName = item.name
          playbackState.mediaUrl = item.url
          playbackState.duration = item.duration
          playbackState.position = 0
          playbackState.targetPosition = 0
          io.to('tvs').emit('load-media', {
            mediaId: playbackState.mediaId,
            mediaType: playbackState.mediaType,
            mediaName: playbackState.mediaName,
            mediaUrl: playbackState.mediaUrl,
            duration: playbackState.duration,
            playlist: playbackState.playlist,
            playlistIndex: playbackState.playlistIndex,
          })
          broadcastPlaybackState()
        }
        break
      }
      case 'stop': {
        playbackState.isPlaying = false
        playbackState.position = 0
        playbackState.targetPosition = 0
        playbackState.targetPlayAt = null
        io.to('tvs').emit('sync-stop')
        broadcastPlaybackState()
        break
      }
      case 'set-volume': {
        // payload: { tvId, volume } or { volume } (master)
        if (payload.tvId) {
          // Find TV by tvId and update its volume
          for (const tv of tvs.values()) {
            if (tv.tvId === payload.tvId) {
              tv.volume = payload.volume
              io.to(tv.socketId).emit('set-volume', { volume: payload.volume })
              break
            }
          }
        } else {
          // Master volume - all TVs
          for (const tv of tvs.values()) {
            tv.volume = payload.volume
          }
          io.to('tvs').emit('set-volume', { volume: payload.volume })
        }
        broadcastTVsList()
        break
      }
      case 'rename-tv': {
        const { tvId, name } = payload
        for (const tv of tvs.values()) {
          if (tv.tvId === tvId) {
            tv.name = name
            break
          }
        }
        broadcastTVsList()
        break
      }
      case 'kick-tv': {
        const { tvId } = payload
        for (const [sid, tv] of tvs.entries()) {
          if (tv.tvId === tvId) {
            io.to(sid).emit('force-disconnect')
            tvs.delete(sid)
            break
          }
        }
        broadcastTVsList()
        break
      }
    }
  })

  // ----------------------------------------------------------
  // TV reports progress (for drift detection)
  // ----------------------------------------------------------
  socket.on('tv-progress', (data: { position: number; isPlaying: boolean }) => {
    if (socket.data.role !== 'tv') return
    const tv = tvs.get(socket.id)
    if (tv) {
      tv.lastSeen = Date.now()
    }
    // Update server-side position estimate
    if (data.isPlaying) {
      playbackState.position = data.position
    }
  })

  // ----------------------------------------------------------
  // TV reports media ended
  // ----------------------------------------------------------
  socket.on('tv-media-ended', (data: { mediaId: string }) => {
    if (socket.data.role !== 'tv') return
    console.log(`[TV MEDIA ENDED] ${data.mediaId}`)
    // If first TV reports ended, advance playlist
    // To avoid duplicates, only the controller advances; TVs just stop
    io.to('controllers').emit('media-ended', { mediaId: data.mediaId, from: socket.id })
  })

  // ----------------------------------------------------------
  // TV reports duration
  // ----------------------------------------------------------
  socket.on('tv-duration', (data: { duration: number }) => {
    if (socket.data.role !== 'tv') return
    if (data.duration && data.duration > 0) {
      playbackState.duration = data.duration
      broadcastPlaybackState()
    }
  })

  // ----------------------------------------------------------
  // Disconnect
  // ----------------------------------------------------------
  socket.on('disconnect', () => {
    if (socket.data.role === 'tv') {
      const tv = tvs.get(socket.id)
      if (tv) {
        tvs.delete(socket.id)
        console.log(`[TV DISCONNECTED] ${tv.name}`)
      }
      broadcastTVsList()
    } else if (socket.data.role === 'controller') {
      controllers.delete(socket.id)
      console.log(`[CONTROLLER DISCONNECTED]`)
    }
  })

  socket.on('error', (error) => {
    console.error(`[SOCKET ERROR] ${socket.id}:`, error)
  })
})

const PORT = 3003
httpServer.listen(PORT, () => {
  console.log(`[SYNC-SERVICE] WebSocket server running on port ${PORT}`)
})

process.on('SIGTERM', () => {
  console.log('[SYNC-SERVICE] SIGTERM received, shutting down...')
  httpServer.close(() => process.exit(0))
})

process.on('SIGINT', () => {
  console.log('[SYNC-SERVICE] SIGINT received, shutting down...')
  httpServer.close(() => process.exit(0))
})
