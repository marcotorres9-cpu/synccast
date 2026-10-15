// SyncCast WebSocket Service - Zero dependencies, native Node.js
// Uses Node.js built-in http and a minimal Socket.io-compatible implementation
// optimized for Render free tier

const http = require('http')
const crypto = require('crypto')

// ============================================================
// In-memory state
// ============================================================
const tvs = new Map()  // socketId -> { tvId, name, isOnline, volume, lastSeen }
const controllers = new Map()  // socketId -> { name }
const wsClients = new Map()  // socketId -> { ws, role, tvId }

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
  broadcastToRole('controllers', JSON.stringify({ event: 'tvs-list', data: { tvs: getTVsList() } }))
}

function broadcastPlaybackState() {
  broadcastToRole('controllers', JSON.stringify({ event: 'playback-state', data: playbackState }))
}

function broadcastToRole(role, message) {
  for (const [sid, client] of wsClients.entries()) {
    if (client.role === role && client.ws.readyState === 1) {
      client.ws.send(message)
    }
  }
}

function sendToTVs(message) {
  broadcastToRole('tv', message)
}

function sendToTV(tvId, message) {
  for (const [sid, client] of wsClients.entries()) {
    if (client.tvId === tvId && client.ws.readyState === 1) {
      client.ws.send(message)
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
      sendToTVs(JSON.stringify({
        event: 'load-media',
        data: {
          mediaId: playbackState.mediaId, mediaType: playbackState.mediaType,
          mediaName: playbackState.mediaName, mediaUrl: playbackState.mediaUrl,
          duration: playbackState.duration, playlist: playbackState.playlist,
          playlistIndex: playbackState.playlistIndex,
        },
      }))
      broadcastPlaybackState()
      break
    }
    case 'play': {
      const fromPosition = typeof payload.position === 'number' ? payload.position : playbackState.position
      playbackState.isPlaying = true
      playbackState.position = fromPosition
      playbackState.targetPosition = fromPosition
      playbackState.targetPlayAt = now + buffer
      sendToTVs(JSON.stringify({
        event: 'sync-play',
        data: { targetPlayAt: playbackState.targetPlayAt, position: fromPosition },
      }))
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
      sendToTVs(JSON.stringify({ event: 'sync-pause', data: { position: playbackState.position } }))
      broadcastPlaybackState()
      break
    }
    case 'seek': {
      const newPosition = payload.position || 0
      playbackState.position = newPosition
      playbackState.targetPosition = newPosition
      if (playbackState.isPlaying) {
        playbackState.targetPlayAt = now + buffer
        sendToTVs(JSON.stringify({
          event: 'sync-seek',
          data: { position: newPosition, isPlaying: true, targetPlayAt: playbackState.targetPlayAt },
        }))
      } else {
        sendToTVs(JSON.stringify({
          event: 'sync-seek',
          data: { position: newPosition, isPlaying: false, targetPlayAt: null },
        }))
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
          sendToTVs(JSON.stringify({
            event: 'load-media',
            data: {
              mediaId: playbackState.mediaId, mediaType: playbackState.mediaType,
              mediaName: playbackState.mediaName, mediaUrl: playbackState.mediaUrl,
              duration: playbackState.duration, playlist: playbackState.playlist,
              playlistIndex: playbackState.playlistIndex,
              autoPlay: true, targetPlayAt: playbackState.targetPlayAt,
            },
          }))
        } else {
          sendToTVs(JSON.stringify({
            event: 'load-media',
            data: {
              mediaId: playbackState.mediaId, mediaType: playbackState.mediaType,
              mediaName: playbackState.mediaName, mediaUrl: playbackState.mediaUrl,
              duration: playbackState.duration, playlist: playbackState.playlist,
              playlistIndex: playbackState.playlistIndex,
            },
          }))
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
        sendToTVs(JSON.stringify({
          event: 'load-media',
          data: {
            mediaId: playbackState.mediaId, mediaType: playbackState.mediaType,
            mediaName: playbackState.mediaName, mediaUrl: playbackState.mediaUrl,
            duration: playbackState.duration, playlist: playbackState.playlist,
            playlistIndex: playbackState.playlistIndex,
          },
        }))
        broadcastPlaybackState()
      }
      break
    }
    case 'stop': {
      playbackState.isPlaying = false
      playbackState.position = 0
      playbackState.targetPosition = 0
      playbackState.targetPlayAt = null
      sendToTVs(JSON.stringify({ event: 'sync-stop' }))
      broadcastPlaybackState()
      break
    }
    case 'set-volume': {
      if (payload.tvId) {
        for (const tv of tvs.values()) {
          if (tv.tvId === payload.tvId) {
            tv.volume = payload.volume
            sendToTV(payload.tvId, JSON.stringify({ event: 'set-volume', data: { volume: payload.volume } }))
            break
          }
        }
      } else {
        for (const tv of tvs.values()) tv.volume = payload.volume
        sendToTVs(JSON.stringify({ event: 'set-volume', data: { volume: payload.volume } }))
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
      sendToTV(tvId, JSON.stringify({ event: 'force-disconnect' }))
      for (const [sid, tv] of tvs.entries()) {
        if (tv.tvId === tvId) { tvs.delete(sid); break }
      }
      broadcastTVsList()
      break
    }
  }
}

// ============================================================
// HTTP server (handles health checks + WebSocket upgrade)
// ============================================================
const server = http.createServer((req, res) => {
  // CORS headers for all responses
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(200)
    res.end()
    return
  }

  // Health check endpoint for Render
  if (req.url === '/' || req.url === '/health' || req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', service: 'synccast-sync', uptime: process.uptime() }))
    return
  }

  // Socket.io polling endpoint (for clients that don't support WebSocket)
  if (req.url && req.url.startsWith('/socket.io/')) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ sid: crypto.randomBytes(16).toString('hex'), upgrades: ['websocket'] }))
    return
  }

  res.writeHead(404)
  res.end('Not found')
})

// ============================================================
// Native WebSocket handling (RFC 6455 implementation)
// ============================================================
server.on('upgrade', (req, socket, head) => {
  // Accept WebSocket upgrade
  const key = req.headers['sec-websocket-key']
  if (!key) {
    socket.destroy()
    return
  }

  const accept = crypto
    .createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64')

  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    'Sec-WebSocket-Accept: ' + accept + '\r\n' +
    '\r\n'
  )

  const socketId = crypto.randomBytes(16).toString('hex')
  const client = { ws: socket, role: null, tvId: null, buffer: Buffer.alloc(0) }
  wsClients.set(socketId, client)

  console.log(`[WS CONNECT] ${socketId}`)

  socket.on('data', (chunk) => {
    try {
      client.buffer = Buffer.concat([client.buffer, chunk])
      while (client.buffer.length >= 2) {
        const frame = parseFrame(client.buffer)
        if (!frame) break
        client.buffer = client.buffer.slice(frame.totalLength)
        if (frame.opcode === 0x8) {  // Close
          socket.end()
          return
        }
        if (frame.opcode === 0x9) {  // Ping
          sendFrame(socket, frame.payload, 0xA)
          continue
        }
        if (frame.opcode === 0x1 && frame.payload) {  // Text
          handleMessage(socketId, frame.payload.toString())
        }
      }
    } catch (e) {
      console.error('[WS ERROR]', e.message)
    }
  })

  socket.on('close', () => {
    const client = wsClients.get(socketId)
    if (client) {
      if (client.role === 'tv') {
        const tv = tvs.get(socketId)
        if (tv) {
          tvs.delete(socketId)
          console.log(`[TV DISCONNECTED] ${tv.name}`)
        }
        broadcastTVsList()
      } else if (client.role === 'controller') {
        controllers.delete(socketId)
        console.log('[CONTROLLER DISCONNECTED]')
      }
      wsClients.delete(socketId)
    }
  })

  socket.on('error', (err) => {
    console.error(`[SOCKET ERROR] ${socketId}:`, err.message)
  })
})

function parseFrame(buffer) {
  if (buffer.length < 2) return null
  const opcode = buffer[0] & 0x0F
  let payloadLen = buffer[1] & 0x7F
  let offset = 2
  if (payloadLen === 126) {
    if (buffer.length < 4) return null
    payloadLen = buffer.readUInt16BE(2)
    offset = 4
  } else if (payloadLen === 127) {
    if (buffer.length < 10) return null
    payloadLen = Number(buffer.readBigUInt64BE(2))
    offset = 10
  }
  if (buffer.length < offset + payloadLen) return null
  const payload = buffer.slice(offset, offset + payloadLen)
  return { opcode, payload, totalLength: offset + payloadLen }
}

function sendFrame(socket, data, opcode = 0x1) {
  const payload = Buffer.isBuffer(data) ? data : Buffer.from(data)
  const len = payload.length
  let header
  if (len < 126) {
    header = Buffer.alloc(2)
    header[1] = len
  } else if (len < 65536) {
    header = Buffer.alloc(4)
    header[1] = 126
    header.writeUInt16BE(len, 2)
  } else {
    header = Buffer.alloc(10)
    header[1] = 127
    header.writeBigUInt64BE(BigInt(len), 2)
  }
  header[0] = 0x80 | opcode  // FIN bit + opcode
  socket.write(Buffer.concat([header, payload]))
}

function handleMessage(socketId, message) {
  let parsed
  try {
    parsed = JSON.parse(message)
  } catch {
    return
  }

  const { event, data } = parsed
  const client = wsClients.get(socketId)
  if (!client) return

  switch (event) {
    case 'sync-ping': {
      const t2 = Date.now()
      sendFrame(client.ws, JSON.stringify({ event: 'sync-pong', data: { t1: data.t1, t2, t3: Date.now() } }))
      break
    }
    case 'register-tv': {
      client.role = 'tv'
      client.tvId = data.tvId
      tvs.set(socketId, {
        socketId: socketId, tvId: data.tvId, name: data.name,
        isOnline: true, volume: 80, lastSeen: Date.now(),
      })
      console.log(`[TV REGISTERED] ${data.name} (${data.tvId})`)
      broadcastTVsList()
      sendFrame(client.ws, JSON.stringify({ event: 'playback-state', data: playbackState }))
      break
    }
    case 'register-controller': {
      client.role = 'controller'
      controllers.set(socketId, { socketId: socketId, name: data.name || 'Controller' })
      console.log(`[CONTROLLER REGISTERED] ${data.name}`)
      sendFrame(client.ws, JSON.stringify({ event: 'tvs-list', data: { tvs: getTVsList() } }))
      sendFrame(client.ws, JSON.stringify({ event: 'playback-state', data: playbackState }))
      break
    }
    case 'command': {
      if (client.role !== 'controller') return
      handleCommand(socketId, data.action, data.payload)
      break
    }
    case 'tv-progress': {
      if (client.role !== 'tv') return
      const tv = tvs.get(socketId)
      if (tv) tv.lastSeen = Date.now()
      if (data.isPlaying) playbackState.position = data.position
      break
    }
    case 'tv-media-ended': {
      if (client.role !== 'tv') return
      broadcastToRole('controllers', JSON.stringify({ event: 'media-ended', data: { mediaId: data.mediaId } }))
      break
    }
    case 'tv-duration': {
      if (client.role !== 'tv') return
      if (data.duration && data.duration > 0) {
        playbackState.duration = data.duration
        broadcastPlaybackState()
      }
      break
    }
  }
}

// ============================================================
// Start server
// ============================================================
const PORT = parseInt(process.env.PORT || '3003', 10)
server.listen(PORT, () => {
  console.log(`[SYNC-SERVICE] Server running on port ${PORT}`)
  console.log(`[SYNC-SERVICE] Health check: http://localhost:${PORT}/`)
})

process.on('SIGTERM', () => {
  console.log('[SYNC-SERVICE] SIGTERM received, shutting down...')
  server.close(() => process.exit(0))
})

process.on('SIGINT', () => {
  console.log('[SYNC-SERVICE] SIGINT received, shutting down...')
  server.close(() => process.exit(0))
})
