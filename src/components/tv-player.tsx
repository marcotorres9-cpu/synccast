'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useTvSocket } from '@/hooks/use-sync-socket'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Wifi, Volume2, VolumeX, Monitor, Music, Video, Youtube, AlertCircle, Loader2 } from 'lucide-react'
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

// Declare YouTube IFrame API
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

  ytApiPromise = new Promise((resolve) => {
    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    const firstScriptTag = document.getElementsByTagName('script')[0]
    firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag)
    window.onYouTubeIframeAPIReady = () => resolve(window.YT)
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
  const youtubeRef = useRef<HTMLDivElement>(null)
  const ytPlayerRef = useRef<any>(null)
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const pendingAutoPlayRef = useRef<{ targetPlayAt: number } | null>(null)
  const pendingSyncPlayRef = useRef<{ targetPlayAt: number; position: number } | null>(null)
  const pendingSyncSeekRef = useRef<any>(null)
  const ytReadyRef = useRef(false)
  const ytCurrentVideoRef = useRef<string | null>(null)

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

  // Apply volume
  useEffect(() => {
    const v = muted ? 0 : volume / 100
    if (videoRef.current) videoRef.current.volume = v
    if (audioRef.current) audioRef.current.volume = v
    if (ytPlayerRef.current && ytReadyRef.current) {
      try {
        ytPlayerRef.current.setVolume(volume)
        if (muted) ytPlayerRef.current.mute()
        else ytPlayerRef.current.unMute()
      } catch {}
    }
  }, [volume, muted])

  // Initialize YouTube player when needed
  useEffect(() => {
    if (mediaInfo.mediaType !== 'youtube' || !mediaInfo.youtubeId) return
    if (!youtubeRef.current) return

    let cancelled = false

    const initYt = async () => {
      try {
        const YT = await loadYouTubeAPI()
        if (cancelled) return

        // Destroy existing player if any
        if (ytPlayerRef.current) {
          try { ytPlayerRef.current.destroy() } catch {}
          ytPlayerRef.current = null
        }

        ytPlayerRef.current = new YT.Player(youtubeRef.current, {
          videoId: mediaInfo.youtubeId!,
          playerVars: {
            autoplay: 0,
            controls: 0,
            disablekb: 1,
            fs: 0,
            modestbranding: 1,
            playsinline: 1,
            rel: 0,
            // Quality hint - YouTube will auto-select based on connection
            vq: 'highres',
          },
          events: {
            onReady: (e: any) => {
              ytReadyRef.current = true
              setLoading(false)
              try {
                e.target.setVolume(muted ? 0 : volume)
                // Try to set highest quality
                const qualities = ['hd2160', 'hd1440', 'hd1080', 'hd720', 'large', 'medium']
                for (const q of qualities) {
                  try {
                    e.target.setPlaybackQuality(q)
                    break
                  } catch {}
                }
              } catch {}

              // Get duration
              try {
                const dur = e.target.getDuration()
                if (dur) {
                  setDuration(dur)
                  reportDuration(dur)
                }
              } catch {}

              // Handle pending autoplay
              const ap = pendingAutoPlayRef.current
              if (ap) {
                pendingAutoPlayRef.current = null
                const wait = getWaitUntil(ap.targetPlayAt)
                setTimeout(() => {
                  if (cancelled) return
                  try {
                    e.target.seekTo(0, true)
                    e.target.playVideo()
                    setIsPlaying(true)
                  } catch {}
                }, Math.max(0, wait))
              }

              // Handle pending sync-play
              const sp = pendingSyncPlayRef.current
              if (sp) {
                pendingSyncPlayRef.current = null
                try {
                  e.target.seekTo(sp.position, true)
                } catch {}
                const wait = getWaitUntil(sp.targetPlayAt)
                setTimeout(() => {
                  if (cancelled) return
                  try {
                    e.target.playVideo()
                    setIsPlaying(true)
                    setShowOverlay(false)
                  } catch {}
                }, Math.max(0, wait))
              }

              // Handle pending sync-seek
              const ss = pendingSyncSeekRef.current
              if (ss) {
                pendingSyncSeekRef.current = null
                try {
                  e.target.seekTo(ss.position, true)
                } catch {}
                if (ss.isPlaying && ss.targetPlayAt) {
                  const wait = getWaitUntil(ss.targetPlayAt)
                  setTimeout(() => {
                    if (cancelled) return
                    try { e.target.playVideo(); setIsPlaying(true) } catch {}
                  }, Math.max(0, wait))
                }
              }
            },
            onStateChange: (e: any) => {
              const YT_STATE = {
                UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5,
              }
              if (e.data === YT_STATE.PLAYING) {
                setIsPlaying(true)
              } else if (e.data === YT_STATE.PAUSED) {
                setIsPlaying(false)
              } else if (e.data === YT_STATE.ENDED) {
                setIsPlaying(false)
                if (mediaInfo.mediaId) reportEnded(mediaInfo.mediaId)
              } else if (e.data === YT_STATE.BUFFERING) {
                setLoading(true)
              }
            },
            onError: (e: any) => {
              console.error('YouTube player error:', e.data)
              setError('Error al reproducir video de YouTube')
              setLoading(false)
            },
          },
        })
      } catch (e) {
        console.error('Failed to init YouTube player:', e)
        setError('No se pudo cargar el reproductor de YouTube')
        setLoading(false)
      }
    }
    initYt()

    return () => {
      cancelled = true
      if (ytPlayerRef.current) {
        try { ytPlayerRef.current.destroy() } catch {}
        ytPlayerRef.current = null
      }
      ytReadyRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaInfo.youtubeId, mediaInfo.mediaType])

  // Load media
  useEffect(() => {
    if (!loadMediaData) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(null)
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

    if (loadMediaData.autoPlay && loadMediaData.targetPlayAt) {
      pendingAutoPlayRef.current = { targetPlayAt: loadMediaData.targetPlayAt }
    } else {
      pendingAutoPlayRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadMediaData])

  // For video/audio elements (not YouTube)
  useEffect(() => {
    if (!mediaInfo.mediaUrl || !mediaInfo.mediaType) return
    if (mediaInfo.mediaType === 'youtube') return

    const targetEl = mediaInfo.mediaType === 'video' ? videoRef.current : audioRef.current
    if (!targetEl) return

    let cancelled = false
    const onLoaded = () => {
      if (cancelled) return
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false)
      if (targetEl.duration && !isNaN(targetEl.duration)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setDuration(targetEl.duration)
        reportDuration(targetEl.duration)
      }

      const ap = pendingAutoPlayRef.current
      if (ap) {
        pendingAutoPlayRef.current = null
        const wait = getWaitUntil(ap.targetPlayAt)
        setTimeout(() => {
          if (cancelled) return
          targetEl.currentTime = 0
          targetEl.play().then(() => {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setIsPlaying(true)
          }).catch((e) => {
            console.error('Autoplay error:', e)
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setError('No se pudo reproducir automáticamente. Toca la pantalla para iniciar.')
          })
        }, Math.max(0, wait))
      }

      const sp = pendingSyncPlayRef.current
      if (sp) {
        pendingSyncPlayRef.current = null
        targetEl.currentTime = sp.position
        const wait = getWaitUntil(sp.targetPlayAt)
        setTimeout(() => {
          if (cancelled) return
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
      }

      const ss = pendingSyncSeekRef.current
      if (ss) {
        pendingSyncSeekRef.current = null
        targetEl.currentTime = ss.position
        if (ss.isPlaying && ss.targetPlayAt) {
          const wait = getWaitUntil(ss.targetPlayAt)
          setTimeout(() => {
            if (cancelled) return
            targetEl.play().then(() => {
              // eslint-disable-next-line react-hooks/set-state-in-effect
              setIsPlaying(true)
            }).catch(() => {})
          }, Math.max(0, wait))
        }
      }
    }

    if (targetEl.readyState >= 1) {
      onLoaded()
    } else {
      targetEl.addEventListener('loadedmetadata', onLoaded, { once: true })
    }
    return () => {
      cancelled = true
      targetEl.removeEventListener('loadedmetadata', onLoaded)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaInfo.mediaUrl, mediaInfo.mediaType])

  // Sync play
  useEffect(() => {
    if (!syncPlay) return
    if (mediaInfo.mediaType === 'youtube') {
      if (!ytReadyRef.current || !ytPlayerRef.current) {
        pendingSyncPlayRef.current = syncPlay
        return
      }
      try {
        ytPlayerRef.current.seekTo(syncPlay.position, true)
        const wait = getWaitUntil(syncPlay.targetPlayAt)
        setTimeout(() => {
          try {
            ytPlayerRef.current.playVideo()
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setIsPlaying(true)
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setShowOverlay(false)
          } catch {}
        }, Math.max(0, wait))
      } catch {}
      return
    }
    const targetEl = mediaInfo.mediaType === 'video' ? videoRef.current : audioRef.current
    if (!targetEl || !mediaInfo.mediaUrl) {
      pendingSyncPlayRef.current = syncPlay
      return
    }
    if (targetEl.readyState >= 1) {
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
    } else {
      pendingSyncPlayRef.current = syncPlay
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncPlay])

  // Sync pause
  useEffect(() => {
    if (!syncPause) return
    if (mediaInfo.mediaType === 'youtube' && ytPlayerRef.current && ytReadyRef.current) {
      try {
        ytPlayerRef.current.pauseVideo()
        ytPlayerRef.current.seekTo(syncPause.position, true)
      } catch {}
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
    if (mediaInfo.mediaType === 'youtube' && ytPlayerRef.current && ytReadyRef.current) {
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
    if (mediaInfo.mediaType === 'youtube' && ytPlayerRef.current && ytReadyRef.current) {
      try {
        ytPlayerRef.current.stopVideo()
      } catch {}
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

  // Report progress periodically
  useEffect(() => {
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current)
    progressIntervalRef.current = setInterval(() => {
      if (mediaInfo.mediaType === 'youtube' && ytPlayerRef.current && ytReadyRef.current) {
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
  }, [mediaInfo.mediaType, reportProgress])

  // Media ended (for video/audio only - YouTube handles its own)
  const handleEnded = useCallback(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsPlaying(false)
    if (mediaInfo.mediaId) reportEnded(mediaInfo.mediaId)
  }, [mediaInfo.mediaId, reportEnded])

  const handleScreenClick = useCallback(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowOverlay((v) => !v)
  }, [])

  const handleManualPlay = useCallback(() => {
    if (mediaInfo.mediaType === 'youtube' && ytPlayerRef.current && ytReadyRef.current) {
      try {
        if (ytPlayerRef.current.getPlayerState() === 1) {
          ytPlayerRef.current.pauseVideo()
          setIsPlaying(false)
        } else {
          ytPlayerRef.current.playVideo()
          setIsPlaying(true)
          setShowOverlay(false)
        }
      } catch {}
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
  }, [mediaInfo.mediaType])

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
        <div className="w-full h-full flex items-center justify-center">
          <div className="w-full h-full max-w-[100vw] max-h-[100vh]">
            <div ref={youtubeRef} className="w-full h-full" />
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
          </div>
        </div>
      )}

      {/* No media state */}
      {!mediaInfo.mediaUrl && !mediaInfo.youtubeId && !loading && (
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
      {mediaInfo.mediaUrl && (
        <div
          className="absolute inset-0 z-0"
          onClick={(e) => {
            handleScreenClick()
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
