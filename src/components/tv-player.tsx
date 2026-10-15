'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useTvSocket } from '@/hooks/use-sync-socket'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Wifi, Volume2, VolumeX, Monitor, Music, Video, Youtube, AlertCircle, Loader2, Play } from 'lucide-react'
import { getServerUrl } from '@/lib/server-url'

function resolveMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null
  if (/^https?:\/\//.test(url)) return url
  const serverUrl = getServerUrl()
  if (serverUrl) {
    return `${serverUrl}${url.startsWith('/') ? '' : '/'}${url}`
  }
  return url
}

declare global {
  interface Window {
    YT?: any
    onYouTubeIframeAPIReady?: () => void
  }
}

let ytApiPromise: Promise<any> | null = null
function loadYouTubeAPI(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject()
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT)
  if (ytApiPromise) return ytApiPromise
  ytApiPromise = new Promise((resolve, reject) => {
    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    tag.onerror = () => reject(new Error('Failed to load YouTube API'))
    const firstScriptTag = document.getElementsByTagName('script')[0]
    firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag)
    const timeout = setTimeout(() => reject(new Error('YouTube API timeout')), 15000)
    window.onYouTubeIframeAPIReady = () => {
      clearTimeout(timeout)
      resolve(window.YT)
    }
  })
  return ytApiPromise
}

interface TvPlayerProps {
  tvId: string
  tvName: string
  onExit: () => void
}

export function TvPlayer({ tvId, tvName, onExit }: TvPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const youtubeContainerRef = useRef<HTMLDivElement>(null)
  const youtubeDivRef = useRef<HTMLDivElement>(null)
  const ytPlayerRef = useRef<any>(null)
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [mediaInfo, setMediaInfo] = useState<{
    mediaId: string | null
    mediaType: 'video' | 'audio' | 'youtube' | null
    mediaName: string | null
    mediaUrl: string | null
    youtubeId: string | null
  }>({ mediaId: null, mediaType: null, mediaName: null, mediaUrl: null, youtubeId: null })
  const [isPlaying, setIsPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showOverlay, setShowOverlay] = useState(true)
  const [loading, setLoading] = useState(false)
  const [ytReady, setYtReady] = useState(false)

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

  // Clear loading after 15 seconds if YouTube doesn't load
  useEffect(() => {
    if (loading) {
      loadingTimeoutRef.current = setTimeout(() => {
        setLoading(false)
        if (mediaInfo.mediaType === 'youtube' && !ytReady) {
          setError('YouTube tardó demasiado en cargar. Toca la pantalla para reintentar.')
        }
      }, 15000)
    }
    return () => {
      if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current)
    }
  }, [loading, mediaInfo.mediaType, ytReady])

  // Apply volume
  useEffect(() => {
    const v = muted ? 0 : volume / 100
    if (videoRef.current) videoRef.current.volume = v
    if (audioRef.current) audioRef.current.volume = v
    if (ytPlayerRef.current && ytReady) {
      try {
        ytPlayerRef.current.setVolume(volume)
        if (muted) ytPlayerRef.current.mute()
        else ytPlayerRef.current.unMute()
      } catch {}
    }
  }, [volume, muted, ytReady])

  // Load media effect
  useEffect(() => {
    if (!loadMediaData) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(null)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setYtReady(false)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMediaInfo({
      mediaId: loadMediaData.mediaId,
      mediaType: loadMediaData.mediaType,
      mediaName: loadMediaData.mediaName,
      mediaUrl: loadMediaData.mediaUrl,
      youtubeId: loadMediaData.youtubeId,
    })
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrentTime(0)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDuration(loadMediaData.duration || 0)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsPlaying(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadMediaData])

  // YouTube player initialization - runs when youtubeId changes
  useEffect(() => {
    if (mediaInfo.mediaType !== 'youtube' || !mediaInfo.youtubeId) return
    // Wait for the div to be rendered
    const timer = setTimeout(() => {
      if (!youtubeDivRef.current) {
        console.error('YouTube div not in DOM yet')
        return
      }
      let cancelled = false
      const initYt = async () => {
        try {
          const YT = await loadYouTubeAPI()
          if (cancelled) return
          // Destroy existing
          if (ytPlayerRef.current) {
            try { ytPlayerRef.current.destroy() } catch {}
            ytPlayerRef.current = null
          }
          // Create new div to ensure clean state
          const newDiv = document.createElement('div')
          youtubeDivRef.current.innerHTML = ''
          youtubeDivRef.current.appendChild(newDiv)

          ytPlayerRef.current = new YT.Player(newDiv, {
            videoId: mediaInfo.youtubeId,
            playerVars: {
              autoplay: 0,
              controls: 0,
              disablekb: 1,
              fs: 0,
              modestbranding: 1,
              playsinline: 1,
              rel: 0,
              origin: typeof window !== 'undefined' ? window.location.origin : undefined,
            },
            events: {
              onReady: (e: any) => {
                if (cancelled) return
                setYtReady(true)
                // eslint-disable-next-line react-hooks/set-state-in-effect
                setLoading(false)
                try {
                  e.target.setVolume(muted ? 0 : volume)
                } catch {}
                try {
                  const dur = e.target.getDuration()
                  if (dur) {
                    // eslint-disable-next-line react-hooks/set-state-in-effect
                    setDuration(dur)
                    reportDuration(dur)
                  }
                } catch {}
              },
              onStateChange: (e: any) => {
                const YT_STATE = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 }
                if (e.data === YT_STATE.PLAYING) {
                  setIsPlaying(true)
                  // eslint-disable-next-line react-hooks/set-state-in-effect
                  setLoading(false)
                } else if (e.data === YT_STATE.PAUSED) {
                  setIsPlaying(false)
                } else if (e.data === YT_STATE.ENDED) {
                  setIsPlaying(false)
                  if (mediaInfo.mediaId) reportEnded(mediaInfo.mediaId)
                }
              },
              onError: (e: any) => {
                console.error('YouTube error:', e.data)
                setError('Error al cargar el video de YouTube (código: ' + e.data + ')')
                // eslint-disable-next-line react-hooks/set-state-in-effect
                setLoading(false)
              },
            },
          })
        } catch (e: any) {
          console.error('Failed to init YouTube:', e)
          setError(e.message || 'No se pudo cargar el reproductor de YouTube')
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setLoading(false)
        }
      }
      initYt()
      return () => { cancelled = true }
    }, 100)
    return () => {
      clearTimeout(timer)
      if (ytPlayerRef.current) {
        try { ytPlayerRef.current.destroy() } catch {}
        ytPlayerRef.current = null
      }
      setYtReady(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaInfo.youtubeId, mediaInfo.mediaType])

  // Video/audio element loadedmetadata
  useEffect(() => {
    if (!mediaInfo.mediaUrl || !mediaInfo.mediaType) return
    if (mediaInfo.mediaType === 'youtube') return
    const targetEl = mediaInfo.mediaType === 'video' ? videoRef.current : audioRef.current
    if (!targetEl) return
    const onLoaded = () => {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false)
      if (targetEl.duration && !isNaN(targetEl.duration)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setDuration(targetEl.duration)
        reportDuration(targetEl.duration)
      }
    }
    if (targetEl.readyState >= 1) {
      onLoaded()
    } else {
      targetEl.addEventListener('loadedmetadata', onLoaded, { once: true })
    }
    return () => targetEl.removeEventListener('loadedmetadata', onLoaded)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaInfo.mediaUrl, mediaInfo.mediaType])

  // Sync play
  useEffect(() => {
    if (!syncPlay) return
    if (mediaInfo.mediaType === 'youtube') {
      if (!ytReady || !ytPlayerRef.current) return
      try {
        ytPlayerRef.current.seekTo(syncPlay.position, true)
        const wait = getWaitUntil(syncPlay.targetPlayAt)
        setTimeout(() => {
          try {
            ytPlayerRef.current.playVideo()
            setIsPlaying(true)
            setShowOverlay(false)
          } catch {}
        }, Math.max(0, wait))
      } catch {}
      return
    }
    const targetEl = mediaInfo.mediaType === 'video' ? videoRef.current : audioRef.current
    if (!targetEl || !mediaInfo.mediaUrl) return
    targetEl.currentTime = syncPlay.position
    const wait = getWaitUntil(syncPlay.targetPlayAt)
    setTimeout(() => {
      targetEl.play().then(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIsPlaying(true)
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setShowOverlay(false)
      }).catch((e) => {
        console.error('Sync play error:', e)
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setError('No se pudo reproducir. Toca la pantalla.')
      })
    }, Math.max(0, wait))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncPlay, ytReady])

  // Sync pause
  useEffect(() => {
    if (!syncPause) return
    if (mediaInfo.mediaType === 'youtube' && ytPlayerRef.current && ytReady) {
      try {
        ytPlayerRef.current.pauseVideo()
        ytPlayerRef.current.seekTo(syncPause.position, true)
      } catch {}
      setIsPlaying(false)
      return
    }
    const targetEl = mediaInfo.mediaType === 'video' ? videoRef.current : audioRef.current
    if (!targetEl) return
    targetEl.pause()
    targetEl.currentTime = syncPause.position
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsPlaying(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncPause])

  // Sync seek
  useEffect(() => {
    if (!syncSeek) return
    if (mediaInfo.mediaType === 'youtube' && ytPlayerRef.current && ytReady) {
      try {
        ytPlayerRef.current.seekTo(syncSeek.position, true)
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setCurrentTime(syncSeek.position)
        if (syncSeek.isPlaying && syncSeek.targetPlayAt) {
          const wait = getWaitUntil(syncSeek.targetPlayAt)
          setTimeout(() => {
            try { ytPlayerRef.current.playVideo(); setIsPlaying(true) } catch {}
          }, Math.max(0, wait))
        } else {
          try { ytPlayerRef.current.pauseVideo() } catch {}
          setIsPlaying(false)
        }
      } catch {}
      return
    }
    const targetEl = mediaInfo.mediaType === 'video' ? videoRef.current : audioRef.current
    if (!targetEl) return
    targetEl.currentTime = syncSeek.position
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrentTime(syncSeek.position)
    if (syncSeek.isPlaying && syncSeek.targetPlayAt) {
      const wait = getWaitUntil(syncSeek.targetPlayAt)
      setTimeout(() => {
        targetEl.play().then(() => {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setIsPlaying(true)
        }).catch(() => {})
      }, Math.max(0, wait))
    } else {
      targetEl.pause()
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsPlaying(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncSeek])

  // Sync stop
  useEffect(() => {
    if (syncStop === null) return
    if (mediaInfo.mediaType === 'youtube' && ytPlayerRef.current && ytReady) {
      try { ytPlayerRef.current.stopVideo() } catch {}
    } else {
      const targetEl = mediaInfo.mediaType === 'video' ? videoRef.current : audioRef.current
      if (targetEl) {
        targetEl.pause()
        targetEl.currentTime = 0
      }
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsPlaying(false)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrentTime(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncStop])

  // Force disconnect
  useEffect(() => {
    if (forceDisconnect) onExit()
  }, [forceDisconnect, onExit])

  // Report progress
  useEffect(() => {
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current)
    progressIntervalRef.current = setInterval(() => {
      if (mediaInfo.mediaType === 'youtube' && ytPlayerRef.current && ytReady) {
        try {
          const t = ytPlayerRef.current.getCurrentTime()
          const isPlaying = ytPlayerRef.current.getPlayerState() === 1
          if (t) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setCurrentTime(t)
            reportProgress(t, isPlaying)
          }
        } catch {}
      } else {
        const targetEl = mediaInfo.mediaType === 'video' ? videoRef.current : audioRef.current
        if (targetEl && !targetEl.paused) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setCurrentTime(targetEl.currentTime)
          reportProgress(targetEl.currentTime, true)
        }
      }
    }, 1000)
    return () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaInfo.mediaType, ytReady, reportProgress])

  const handleEnded = useCallback(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsPlaying(false)
    if (mediaInfo.mediaId) reportEnded(mediaInfo.mediaId)
  }, [mediaInfo.mediaId, reportEnded])

  const handleScreenClick = useCallback(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowOverlay((v) => !v)
  }, [])

  // Retry loading YouTube (when it failed or timed out)
  const handleRetryYouTube = useCallback(() => {
    if (mediaInfo.mediaType !== 'youtube' || !mediaInfo.youtubeId) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(null)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setYtReady(false)
    // Force YouTube player re-creation by toggling the youtubeId
    const ytId = mediaInfo.youtubeId
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMediaInfo((prev) => ({ ...prev, youtubeId: null }))
    setTimeout(() => {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMediaInfo((prev) => ({ ...prev, youtubeId: ytId }))
    }, 100)
  }, [mediaInfo.mediaType, mediaInfo.youtubeId])

  const handleManualPlay = useCallback(() => {
    if (mediaInfo.mediaType === 'youtube') {
      if (!ytReady || !ytPlayerRef.current) {
        handleRetryYouTube()
        return
      }
      try {
        const state = ytPlayerRef.current.getPlayerState()
        if (state === 1) {
          ytPlayerRef.current.pauseVideo()
          setIsPlaying(false)
        } else {
          ytPlayerRef.current.playVideo()
          setIsPlaying(true)
          setShowOverlay(false)
        }
      } catch {
        handleRetryYouTube()
      }
      return
    }
    const targetEl = mediaInfo.mediaType === 'video' ? videoRef.current : audioRef.current
    if (!targetEl) return
    if (targetEl.paused) {
      targetEl.play().then(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIsPlaying(true)
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setShowOverlay(false)
      }).catch((e) => console.error('Manual play error:', e))
    } else {
      targetEl.pause()
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsPlaying(false)
    }
  }, [mediaInfo.mediaType, ytReady, handleRetryYouTube])

  const formatTime = (s: number) => {
    if (!s || isNaN(s)) return '0:00'
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const getMediaIcon = () => {
    if (mediaInfo.mediaType === 'youtube') return <Youtube className="w-5 h-5 text-red-500" />
    if (mediaInfo.mediaType === 'video') return <Video className="w-5 h-5 text-primary" />
    if (mediaInfo.mediaType === 'audio') return <Music className="w-5 h-5 text-primary" />
    return null
  }

  const hasMedia = mediaInfo.mediaUrl || mediaInfo.youtubeId

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
      {mediaInfo.mediaType === 'youtube' && mediaInfo.youtubeId && (
        <div ref={youtubeContainerRef} className="w-full h-full flex items-center justify-center">
          <div className="w-full h-full max-w-[100vw] max-h-[100vh]">
            <div ref={youtubeDivRef} className="w-full h-full" />
          </div>
        </div>
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

      {/* Error overlay with retry button */}
      {error && !loading && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/80 p-4">
          <Card className="glass-card p-6 max-w-md w-full text-center border-destructive/50">
            <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
            <p className="text-base text-white/90 mb-4">{error}</p>
            <Button
              onClick={() => {
                if (mediaInfo.mediaType === 'youtube') {
                  handleRetryYouTube()
                } else {
                  setError(null)
                  handleManualPlay()
                }
              }}
              size="lg"
              className="bg-primary text-white w-full min-h-[50px]"
              autoFocus
            >
              <Play className="w-5 h-5 mr-2" />
              Reintentar
            </Button>
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
      {hasMedia && (
        <div className={`absolute bottom-0 left-0 right-0 z-10 transition-opacity ${showOverlay ? 'opacity-100' : 'opacity-0'}`}>
          <div className="glass px-6 py-4">
            <div className="flex items-center gap-4 mb-3">
              {getMediaIcon()}
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
            {!isPlaying && !loading && hasMedia && (
              <div className="mt-3 flex justify-center">
                <Button
                  onClick={handleManualPlay}
                  size="lg"
                  className="bg-primary text-white text-base px-8 py-6 min-h-[60px]"
                  autoFocus
                >
                  <Play className="w-4 h-4 mr-1.5" />
                  Toca para reproducir
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* No media state */}
      {!hasMedia && !loading && (
        <div className="text-center max-w-md px-6">
          <div className="mb-6 flex justify-center">
            <div className="w-32 h-32 rounded-full glass-card flex items-center justify-center glow">
              <Video className="w-16 h-16 text-primary" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Esperando contenido</h2>
          <p className="text-white/60 mb-6">
            Este televisor está listo para recibir videos, música y videos de YouTube desde tu teléfono.
            Abre la app en tu móvil y selecciona contenido para reproducir.
          </p>
          <div className="glass-card p-4 rounded-lg">
            <p className="text-sm text-white/80 mb-1">TV: <span className="font-semibold">{tvName}</span></p>
            <p className="text-xs text-white/50">ID: {tvId}</p>
          </div>
        </div>
      )}

      {/* Click catcher */}
      {hasMedia && (
        <div
          className="absolute inset-0 z-0"
          onClick={() => {
            handleScreenClick()
            // If paused and not loading, also try to play
            if (!isPlaying && !loading) {
              handleManualPlay()
            }
          }}
        />
      )}
    </div>
  )
}
