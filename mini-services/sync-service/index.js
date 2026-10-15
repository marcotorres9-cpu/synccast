// SyncCast WebSocket Service using Socket.io
// Works through any reverse proxy (Render, Vercel, Cloudflare) via polling fallback

const { createServer } = require('http')
const { Server } = require('socket.io')

const httpServer = createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(200)
    res.end()
    return
  }

  // Health check
  if (req.url === '/' || req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', service: 'synccast-sync', uptime: process.uptime() }))
    return
  }

  res.writeHead(404)
  res.end('Not found')
})

const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 5 * 1024 * 1024,
  // Allow both WebSocket and polling transports
  transports: ['websocket', 'polling'],
  // Allow upgrade from polling to websocket
  allowUpgrades: true,
})

// State
const tvs = new Map()
const controllers = new Map()

let playbackState = {
  mediaId: null,
  mediaType: null,
  mediaName: null,
  mediaUrl: null,
  youtubeId: null,
  isPlaying: false,
  position: 0,
  duration: 0,
  targetPlayAt: null,
  targetPosition: 0,
  playlistId: null,
  playlistIndex: 0,
  playlist: [],
}

function getTVsList() {
  return Array.from(tvs.values()).map((tv) => ({
    tvId: tv.tvId, name: tv.name, isOnline: tv.isOnline,
    volume: tv.volume, lastSeen: tv.lastSeen,
  }))
}

function broadcastTVsList() {
  io.to('controllers').emit('tvs-list', { tvs: getTVsList() })
}

function broadcastPlaybackState() {
  io.to('controllers').emit('playback-state', playbackState)
}

function sendToTVs(event, data) {
  io.to('tvs').emit(event, data)
}

function sendToTV(tvId, event, data) {
  for (const [sid, tv] of tvs.entries()) {
    if (tv.tvId === tvId) {
      io.to(sid).emit(event, data)
      break
    }
  }
}

function handleCommand(socketId, action, payload) {
  const now = Date.now()
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
        youtubeId: playlist[startIndex]?.youtubeId || null,
        isPlaying: false,
        position: 0,
        duration: playlist[startIndex]?.duration || 0,
        targetPlayAt: null,
        targetPosition: 0,
        playlistId: payload.playlistId || null,
        playlistIndex: startIndex,
        playlist,
      }
      sendToTVs('load-media', {
        mediaId: playbackState.mediaId, mediaType: playbackState.mediaType,
        mediaName: playbackState.mediaName, mediaUrl: playbackState.mediaUrl,
        youtubeId: playbackState.youtubeId,
        duration: playbackState.duration, playlist: playbackState.playlist,
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
      sendToTVs('sync-play', {
        targetPlayAt: playbackState.targetPlayAt, position: fromPosition,
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
      sendToTVs('sync-pause', { position: playbackState.position })
      broadcastPlaybackState()
      break
    }
    case 'seek': {
      const newPosition = payload.position || 0
      playbackState.position = newPosition
      playbackState.targetPosition = newPosition
      if (playbackState.isPlaying) {
        playbackState.targetPlayAt = now + buffer
        sendToTVs('sync-seek', {
          position: newPosition, isPlaying: true, targetPlayAt: playbackState.targetPlayAt,
        })
      } else {
        sendToTVs('sync-seek', {
          position: newPosition, isPlaying: false, targetPlayAt: null,
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
        playbackState.mediaType = item.type
        playbackState.mediaName = item.name
        playbackState.mediaUrl = item.url
        playbackState.youtubeId = item.youtubeId || null
        playbackState.duration = item.duration
        playbackState.position = 0
        playbackState.targetPosition = 0
        if (playbackState.isPlaying) {
          playbackState.targetPlayAt = now + buffer
          sendToTVs('load-media', {
            mediaId: playbackState.mediaId, mediaType: playbackState.mediaType,
            mediaName: playbackState.mediaName, mediaUrl: playbackState.mediaUrl,
            youtubeId: playbackState.youtubeId,
            duration: playbackState.duration, playlist: playbackState.playlist,
            playlistIndex: playbackState.playlistIndex,
            autoPlay: true, targetPlayAt: playbackState.targetPlayAt,
          })
        } else {
          sendToTVs('load-media', {
            mediaId: playbackState.mediaId, mediaType: playbackState.mediaType,
            mediaName: playbackState.mediaName, mediaUrl: playbackState.mediaUrl,
            youtubeId: playbackState.youtubeId,
            duration: playbackState.duration, playlist: playbackState.playlist,
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
        playbackState.mediaType = item.type
        playbackState.mediaName = item.name
        playbackState.mediaUrl = item.url
        playbackState.youtubeId = item.youtubeId || null
        playbackState.duration = item.duration
        playbackState.position = 0
        playbackState.targetPosition = 0
        sendToTVs('load-media', {
          mediaId: playbackState.mediaId, mediaType: playbackState.mediaType,
          mediaName: playbackState.mediaName, mediaUrl: playbackState.mediaUrl,
          youtubeId: playbackState.youtubeId,
          duration: playbackState.duration, playlist: playbackState.playlist,
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
      sendToTVs('sync-stop')
      broadcastPlaybackState()
      break
    }
    case 'set-volume': {
      if (payload.tvId) {
        for (const tv of tvs.values()) {
          if (tv.tvId === payload.tvId) {
            tv.volume = payload.volume
            sendToTV(payload.tvId, 'set-volume', { volume: payload.volume })
            break
          }
        }
      } else {
        for (const tv of tvs.values()) tv.volume = payload.volume
        sendToTVs('set-volume', { volume: payload.volume })
      }
      broadcastTVsList()
      break
    }
    case 'rename-tv': {
      const { tvId, name } = payload
      for (const tv of tvs.values()) {
        if (tv.tvId === tvId) { tv.name = name; break }
      }
      broadcastTVsList()
      break
    }
    case 'kick-tv': {
      const { tvId } = payload
      sendToTV(tvId, 'force-disconnect')
      for (const [sid, tv] of tvs.entries()) {
        if (tv.tvId === tvId) { tvs.delete(sid); break }
      }
      broadcastTVsList()
      break
    }
  }
}

io.on('connection', (socket) => {
  console.log(`[CONNECT] ${socket.id}`)

  socket.on('sync-ping', (data) => {
    const t2 = Date.now()
    socket.emit('sync-pong', { t1: data.t1, t2, t3: Date.now() })
  })

  socket.on('register-tv', (data) => {
    socket.join('tvs')
    socket.data.role = 'tv'
    socket.data.tvId = data.tvId

    const tv = {
      socketId: socket.id, tvId: data.tvId, name: data.name,
      isOnline: true, volume: 80, lastSeen: Date.now(),
    }
    tvs.set(socket.id, tv)

    console.log(`[TV REGISTERED] ${data.name} (${data.tvId})`)
    broadcastTVsList()
    socket.emit('playback-state', playbackState)
  })

  socket.on('register-controller', (data) => {
    socket.join('controllers')
    socket.data.role = 'controller'
    controllers.set(socket.id, { socketId: socket.id, name: data.name || 'Controller' })
    console.log(`[CONTROLLER REGISTERED] ${data.name}`)
    socket.emit('tvs-list', { tvs: getTVsList() })
    socket.emit('playback-state', playbackState)
  })

  socket.on('command', (data) => {
    if (socket.data.role !== 'controller') return
    handleCommand(socket.id, data.action, data.payload)
  })

  socket.on('tv-progress', (data) => {
    if (socket.data.role !== 'tv') return
    const tv = tvs.get(socket.id)
    if (tv) tv.lastSeen = Date.now()
    if (data.isPlaying) playbackState.position = data.position
  })

  socket.on('tv-media-ended', (data) => {
    if (socket.data.role !== 'tv') return
    io.to('controllers').emit('media-ended', { mediaId: data.mediaId, from: socket.id })
  })

  socket.on('tv-duration', (data) => {
    if (socket.data.role !== 'tv') return
    if (data.duration && data.duration > 0) {
      playbackState.duration = data.duration
      broadcastPlaybackState()
    }
  })

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
      console.log('[CONTROLLER DISCONNECTED]')
    }
  })

  socket.on('error', (error) => {
    console.error(`[SOCKET ERROR] ${socket.id}:`, error)
  })
})

const PORT = parseInt(process.env.PORT || '3003', 10)
httpServer.listen(PORT, () => {
  console.log(`[SYNC-SERVICE] Socket.io server running on port ${PORT}`)
  console.log(`[SYNC-SERVICE] Transports: websocket, polling`)
})

process.on('SIGTERM', () => {
  console.log('[SYNC-SERVICE] SIGTERM received, shutting down...')
  httpServer.close(() => process.exit(0))
})

process.on('SIGINT', () => {
  console.log('[SYNC-SERVICE] SIGINT received, shutting down...')
  httpServer.close(() => process.exit(0))
})
