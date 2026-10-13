'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useTvSocket } from '@/hooks/use-sync-socket'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Wifi, Volume2, VolumeX, Monitor, Music, Video, AlertCircle, Loader2 } from 'lucide-react'
import { getServerUrl } from '@/lib/server-url'

// Resolve a possibly-relative media URL to an absolute one
function resolveMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null
  if (/^https?:\/\//.test(url)) return url
  const serverUrl = getServerUrl()
  if (serverUrl) {
    return `${serverUrl}${url.startsWith('/') ? '' : '/'}${url}`
  }
  return url
}

interface TvPlayerProps {
  tvId: string
  tvName: string
  onExit: () => void
}

export function TvPlayer({ tvId, tvName, onExit }: TvPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null)
  // Refs to always have the latest media info in event handlers
  const pendingAutoPlayRef = useRef<{ targetPlayAt: number } | null>(null)
  const pendingSyncPlayRef = useRef<{ targetPlayAt: number; position: number } | null>(null)
  const pendingSyncSeekRef = useRef<any>(null)

  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [mediaInfo, setMediaInfo] = useState<{
    mediaId: string | null
    mediaType: 'video' | 'audio' | null
    mediaName: string | null
    mediaUrl: string | null
  }>({ mediaId: null, mediaType: null, mediaName: null, mediaUrl: null })
  const [isPlaying, setIsPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showOverlay, setShowOverlay] = useState(true)
  const [loading, setLoading] = useState(false)

  const {
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
  } = useTvSocket(tvName, tvId)

  // --------------------------------------------------------
  // Apply volume
  // --------------------------------------------------------
  useEffect(() => {
    const v = muted ? 0 : volume / 100
    if (videoRef.current) videoRef.current.volume = v
    if (audioRef.current) audioRef.current.volume = v
  }, [volume, muted])

  // --------------------------------------------------------
  // Step 1: When load-media event arrives, update mediaInfo state.
  // The actual <video> or <audio> element will be rendered on next paint.
  // --------------------------------------------------------
  useEffect(() => {
    if (!loadMediaData) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
     
    setError(null)
     
    setMediaInfo({
      mediaId: loadMediaData.mediaId,
      mediaType: loadMediaData.mediaType,
      mediaName: loadMediaData.mediaName,
      mediaUrl: loadMediaData.mediaUrl,
    })
     
    setCurrentTime(0)
     
    setDuration(loadMediaData.duration || 0)
     
    setIsPlaying(false)

    // If autoplay was requested, store it for the media-render effect
    if (loadMediaData.autoPlay && loadMediaData.targetPlayAt) {
      pendingAutoPlayRef.current = { targetPlayAt: loadMediaData.targetPlayAt }
    } else {
      pendingAutoPlayRef.current = null
    }
     
  }, [loadMediaData])

  // --------------------------------------------------------
  // Step 2: After mediaInfo.mediaUrl changes AND the <video>/<audio>
  // element is rendered, attach loadedmetadata listener.
  // --------------------------------------------------------
  useEffect(() => {
    if (!mediaInfo.mediaUrl || !mediaInfo.mediaType) return

    const targetEl = mediaInfo.mediaType === 'video' ? videoRef.current : audioRef.current
    if (!targetEl) return

    let cancelled = false

    const onLoaded = () => {
      if (cancelled) return
       
      setLoading(false)
      if (targetEl.duration && !isNaN(targetEl.duration)) {
         
        setDuration(targetEl.duration)
        reportDuration(targetEl.duration)
      }

      // Handle pending autoplay
      const ap = pendingAutoPlayRef.current
      if (ap) {
        pendingAutoPlayRef.current = null
        const wait = getWaitUntil(ap.targetPlayAt)
        setTimeout(() => {
          if (cancelled) return
          targetEl.currentTime = 0
          targetEl.play().then(() => {
             
            setIsPlaying(true)
          }).catch((e) => {
            console.error('Autoplay error:', e)
             
            setError('No se pudo reproducir automáticamente. Toca la pantalla para iniciar.')
          })
        }, Math.max(0, wait))
      }

      // Handle pending sync-play (arrived while loading)
      const sp = pendingSyncPlayRef.current
      if (sp) {
        pendingSyncPlayRef.current = null
        targetEl.currentTime = sp.position
        const wait = getWaitUntil(sp.targetPlayAt)
        setTimeout(() => {
          if (cancelled) return
          targetEl.play().then(() => {
             
            setIsPlaying(true)
             
            setShowOverlay(false)
          }).catch((e) => {
            console.error('Sync play error:', e)
             
            setError('No se pudo reproducir. Toca la pantalla.')
          })
        }, Math.max(0, wait))
      }

      // Handle pending sync-seek
      const ss = pendingSyncSeekRef.current
      if (ss) {
        pendingSyncSeekRef.current = null
        targetEl.currentTime = ss.position
        if (ss.isPlaying && ss.targetPlayAt) {
          const wait = getWaitUntil(ss.targetPlayAt)
          setTimeout(() => {
            if (cancelled) return
            targetEl.play().then(() => {
               
              setIsPlaying(true)
            }).catch(() => {})
          }, Math.max(0, wait))
        }
      }
    }

    // If metadata already loaded (cached), call onLoaded directly
    if (targetEl.readyState >= 1) {
      onLoaded()
    } else {
      targetEl.addEventListener('loadedmetadata', onLoaded, { once: true })
    }

    return () => {
      cancelled = true
      targetEl.removeEventListener('loadedmetadata', onLoaded)
    }
     
  }, [mediaInfo.mediaUrl, mediaInfo.mediaType])

  // --------------------------------------------------------
  // Sync play - if media not yet loaded, queue it for later
  // --------------------------------------------------------
  useEffect(() => {
    if (!syncPlay) return
    const targetEl = mediaInfo.mediaType === 'video' ? videoRef.current : audioRef.current
    if (!targetEl || !mediaInfo.mediaUrl) {
      // Queue for when media loads
      pendingSyncPlayRef.current = syncPlay
      return
    }

    // If media already loaded, play now
    if (targetEl.readyState >= 1) {
      targetEl.currentTime = syncPlay.position
      const wait = getWaitUntil(syncPlay.targetPlayAt)
      setTimeout(() => {
        targetEl.play().then(() => {
           
          setIsPlaying(true)
           
          setShowOverlay(false)
        }).catch((e) => {
          console.error('Sync play error:', e)
           
          setError('No se pudo reproducir. Toca la pantalla.')
        })
      }, Math.max(0, wait))
    } else {
      // Queue for when metadata loads
      pendingSyncPlayRef.current = syncPlay
    }
     
  }, [syncPlay])

  // --------------------------------------------------------
  // Sync pause
  // --------------------------------------------------------
  useEffect(() => {
    if (!syncPause) return
    const targetEl = mediaInfo.mediaType === 'video' ? videoRef.current : audioRef.current
    if (!targetEl) return
    targetEl.pause()
    targetEl.currentTime = syncPause.position
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsPlaying(false)

  }, [syncPause])

  // --------------------------------------------------------
  // Sync seek
  // --------------------------------------------------------
  useEffect(() => {
    if (!syncSeek) return
    const targetEl = mediaInfo.mediaType === 'video' ? videoRef.current : audioRef.current
    if (!targetEl) {
      pendingSyncSeekRef.current = syncSeek
      return
    }
    targetEl.currentTime = syncSeek.position
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrentTime(syncSeek.position)
    if (syncSeek.isPlaying && syncSeek.targetPlayAt) {
      const wait = getWaitUntil(syncSeek.targetPlayAt)
      setTimeout(() => {
        targetEl.play().then(() => {
           
          setIsPlaying(true)
        }).catch(() => {})
      }, Math.max(0, wait))
    } else {
      targetEl.pause()
       
      setIsPlaying(false)
    }
     
  }, [syncSeek])

  // --------------------------------------------------------
  // Sync stop
  // --------------------------------------------------------
  useEffect(() => {
    if (syncStop === null) return
    const targetEl = mediaInfo.mediaType === 'video' ? videoRef.current : audioRef.current
    if (targetEl) {
      targetEl.pause()
      targetEl.currentTime = 0
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsPlaying(false)
     
    setCurrentTime(0)

  }, [syncStop])

  // --------------------------------------------------------
  // Force disconnect
  // --------------------------------------------------------
  useEffect(() => {
    if (forceDisconnect) {
      onExit()
    }
  }, [forceDisconnect, onExit])

  // --------------------------------------------------------
  // Report progress periodically
  // --------------------------------------------------------
  useEffect(() => {
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current)
    progressIntervalRef.current = setInterval(() => {
      const targetEl = mediaInfo.mediaType === 'video' ? videoRef.current : audioRef.current
      if (targetEl && !targetEl.paused) {
         
        setCurrentTime(targetEl.currentTime)
        reportProgress(targetEl.currentTime, true)
      }
    }, 1000)
    return () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current)
    }
     
  }, [mediaInfo.mediaType, reportProgress])

  // --------------------------------------------------------
  // Media ended
  // --------------------------------------------------------
  const handleEnded = useCallback(() => {
     
    setIsPlaying(false)
    if (mediaInfo.mediaId) {
      reportEnded(mediaInfo.mediaId)
    }
  }, [mediaInfo.mediaId, reportEnded])

  // --------------------------------------------------------
  // Toggle overlay
  // --------------------------------------------------------
  const handleScreenClick = useCallback(() => {
     
    setShowOverlay((v) => !v)
  }, [])

  // --------------------------------------------------------
  // Manual play/pause toggle (for when autoplay is blocked)
  // --------------------------------------------------------
  const handleManualPlay = useCallback(() => {
    const targetEl = mediaInfo.mediaType === 'video' ? videoRef.current : audioRef.current
    if (!targetEl) return
    if (targetEl.paused) {
      targetEl.play().then(() => {
         
        setIsPlaying(true)
         
        setShowOverlay(false)
      }).catch((e) => {
        console.error('Manual play error:', e)
      })
    } else {
      targetEl.pause()
       
      setIsPlaying(false)
    }
  }, [mediaInfo.mediaType])

  const formatTime = (s: number) => {
    if (!s || isNaN(s)) return '0:00'
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <div className="fixed inset-0 bg-black flex flex-col items-center justify-center">
      {/* Hidden media elements */}
      {mediaInfo.mediaType === 'video' && mediaInfo.mediaUrl && (
        <video
          ref={videoRef}
          src={resolveMediaUrl(mediaInfo.mediaUrl) || undefined}
          className="max-w-full max-h-full"
          onEnded={handleEnded}
          onClick={handleScreenClick}
          playsInline
          preload="auto"
        />
      )}
      {mediaInfo.mediaType === 'audio' && mediaInfo.mediaUrl && (
        <audio
          ref={audioRef}
          src={resolveMediaUrl(mediaInfo.mediaUrl) || undefined}
          onEnded={handleEnded}
          preload="auto"
        />
      )}

      {/* Audio visualization */}
      {mediaInfo.mediaType === 'audio' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div className="flex items-end gap-2 h-40 mb-8">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className={`eq-bar w-3 bg-primary/80 rounded-full ${isPlaying ? '' : 'h-4'}`}
                style={{ height: isPlaying ? undefined : '20%' }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Loading indicator */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-20">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-12 h-12 animate-spin text-primary" />
            <p className="text-white/80">Cargando medio...</p>
          </div>
        </div>
      )}

      {/* Error overlay */}
      {error && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 max-w-md">
          <Card className="glass-card p-4 flex items-center gap-3 border-destructive/50">
            <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0" />
            <p className="text-sm text-white/90">{error}</p>
          </Card>
        </div>
      )}

      {/* Top status bar */}
      <div className={`absolute top-0 left-0 right-0 z-10 transition-opacity ${showOverlay ? 'opacity-100' : 'opacity-0'}`}>
        <div className="glass px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Monitor className="w-5 h-5 text-primary" />
            <div>
              <p className="font-semibold text-white">{tvName}</p>
              <p className="text-xs text-white/60">
                {isConnected ? (
                  <span className="flex items-center gap-1 text-green-400">
                    <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse-live" />
                    Conectado
                  </span>
                ) : (
                  <span className="text-amber-400">Reconectando...</span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMuted(!muted)}
              className="text-white/80 hover:text-white hover:bg-white/10"
            >
              {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onExit}
              className="text-white/80 hover:text-white hover:bg-white/10"
            >
              Salir
            </Button>
          </div>
        </div>
      </div>

      {/* Bottom info bar */}
      {mediaInfo.mediaUrl && (
        <div className={`absolute bottom-0 left-0 right-0 z-10 transition-opacity ${showOverlay ? 'opacity-100' : 'opacity-0'}`}>
          <div className="glass px-6 py-4">
            <div className="flex items-center gap-4 mb-3">
              {mediaInfo.mediaType === 'video' ? (
                <Video className="w-5 h-5 text-primary flex-shrink-0" />
              ) : (
                <Music className="w-5 h-5 text-primary flex-shrink-0" />
              )}
              <p className="text-white font-medium truncate flex-1">{mediaInfo.mediaName || 'Sin medio'}</p>
              <div className="flex items-center gap-2 text-sm text-white/70">
                <span>{formatTime(currentTime)}</span>
                <span>/</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Wifi className={`w-4 h-4 ${isConnected ? 'text-green-400' : 'text-amber-400'}`} />
              <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                />
              </div>
              <span className="text-xs text-white/60">Volumen: {muted ? 0 : volume}%</span>
            </div>
          </div>
        </div>
      )}

      {/* No media state */}
      {!mediaInfo.mediaUrl && !loading && (
        <div className="text-center max-w-md px-6">
          <div className="mb-6 flex justify-center">
            <div className="w-32 h-32 rounded-full glass-card flex items-center justify-center glow">
              {mediaInfo.mediaType === 'audio' ? (
                <Music className="w-16 h-16 text-primary" />
              ) : (
                <Video className="w-16 h-16 text-primary" />
              )}
            </div>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Esperando contenido</h2>
          <p className="text-white/60 mb-6">
            Este televisor está listo para recibir videos y música desde tu teléfono.
            Abre la app en tu móvil y selecciona contenido para reproducir.
          </p>
          <div className="glass-card p-4 rounded-lg">
            <p className="text-sm text-white/80 mb-1">TV: <span className="font-semibold">{tvName}</span></p>
            <p className="text-xs text-white/50">ID: {tvId}</p>
          </div>
        </div>
      )}

      {/* Click catcher to toggle overlay / manual play */}
      {mediaInfo.mediaUrl && (
        <div
          className="absolute inset-0 z-0"
          onClick={(e) => {
            handleScreenClick()
            // Also try to play if paused (handles autoplay-blocked case)
            const targetEl = mediaInfo.mediaType === 'video' ? videoRef.current : audioRef.current
            if (targetEl && targetEl.paused) {
              handleManualPlay()
            }
          }}
        />
      )}
    </div>
  )
}
