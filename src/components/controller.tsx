'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useControllerSocket } from '@/hooks/use-sync-socket'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Play, Pause, Square, SkipForward, SkipBack, Volume2, VolumeX,
  Upload, Music, Video, Monitor, Trash2, ListMusic, Tv, Settings,
  Plus, Wifi, Loader2, CheckCircle2, AlertCircle, Smartphone,
  Volume1, Cast, X, Pencil, Server, Youtube, Link as LinkIcon
} from 'lucide-react'
import { toast } from 'sonner'
import { apiUrl, getServerUrl, setServerUrl } from '@/lib/server-url'
import { getCurrentVersion } from '@/lib/auto-updater'
import { notifyServerUrlChanged } from '@/hooks/use-sync-socket'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'

interface MediaFile {
  id: string
  name: string
  url: string
  type: string
  size: number
  duration?: number
  createdAt?: string
  youtubeId?: string
}

export function Controller() {
  const { isConnected, tvs, playback, sendCommand } = useControllerSocket()
  const [tab, setTab] = useState('player')
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([])
  const [uploading, setUploading] = useState(false)
  const [selectedMedia, setSelectedMedia] = useState<MediaFile[]>([])
  const [masterVolume, setMasterVolume] = useState(80)
  const [tvVolumes, setTvVolumes] = useState<Record<string, number>>({})
  const [editingTvName, setEditingTvName] = useState<string | null>(null)
  const [newTvName, setNewTvName] = useState('')
  const [showServerDialog, setShowServerDialog] = useState(false)
  const [serverUrlInput, setServerUrlInput] = useState('')
  const [youtubeUrlInput, setYoutubeUrlInput] = useState('')
  const [addingYoutube, setAddingYoutube] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // --------------------------------------------------------
  // Fetch media files
  // --------------------------------------------------------
  const fetchMedia = useCallback(async () => {
    try {
      let res
      try {
        res = await fetch(apiUrl('/api/media'))
      } catch (fetchErr) {
        console.error('Fetch error, trying direct URL:', fetchErr)
        res = await fetch('https://synccast-repo.vercel.app/api/media')
      }
      const data = await res.json()
      console.log('Media fetched:', data.files?.length || 0, 'files')
      if (data.files) setMediaFiles(data.files)
    } catch (e) {
      console.error('Failed to fetch media:', e)
    }
  }, [])

  useEffect(() => {
    fetchMedia()
  }, [fetchMedia])

  // Sync TV volumes
  useEffect(() => {
    if (tvs.length > 0) {
      const newVols: Record<string, number> = {}
      tvs.forEach((tv) => {
        newVols[tv.tvId] = tvVolumes[tv.tvId] ?? tv.volume
      })
      setTvVolumes(newVols)
    }
     
  }, [tvs.length])

  // --------------------------------------------------------
  // Upload files
  // --------------------------------------------------------
  const [uploadProgress, setUploadProgress] = useState(0)

  const handleUpload = async (files: FileList | null, type: 'video' | 'audio') => {
    if (!files || files.length === 0) return
    setUploading(true)
    setUploadProgress(0)

    for (const file of Array.from(files)) {
      try {
        toast.info(`Subiendo ${file.name}...`)

        const CLOUD_NAME = 'osm54nd0'
        const UPLOAD_PRESET = 'synccast_unsigned'
        const isVideo = file.type.startsWith('video/') || file.name.match(/\.(mp4|webm|mkv|mov|avi|m4v)$/i)
        const isAudio = file.type.startsWith('audio/') || file.name.match(/\.(mp3|wav|ogg|m4a|flac|aac)$/i)
        const resourceType = isVideo ? 'video' : isAudio ? 'audio' : 'auto'

        let result: any

        // For files larger than 80MB, use server-side proxy upload
        // This bypasses Cloudinary's 100MB browser upload limit
        if (file.size > 80 * 1024 * 1024) {
          console.log('Large file detected, using server proxy:', file.size, 'bytes')
          toast.info('Subiendo archivo grande (puede tardar varios minutos)...')
          
          const formData = new FormData()
          formData.append('files', file)
          formData.append('type', type)
          
          let uploadRes
          try {
            uploadRes = await fetch(apiUrl('/api/upload-large'), {
              method: 'POST',
              body: formData,
            })
          } catch (fetchErr) {
            console.error('Fetch error, trying direct URL:', fetchErr)
            uploadRes = await fetch('https://synccast-repo.vercel.app/api/upload-large', {
              method: 'POST',
              body: formData,
            })
          }
          
          if (!uploadRes.ok) {
            const errText = await uploadRes.text()
            throw new Error(`Error del servidor: ${errText.substring(0, 200)}`)
          }
          
          const uploadData = await uploadRes.json()
          if (uploadData.files && uploadData.files.length > 0) {
            toast.success(`"${file.name}" subido correctamente`)
            setUploadProgress(100)
            continue // Skip the rest, file is already saved
          } else {
            throw new Error(uploadData.error || 'Error desconocido en subida grande')
          }
        } else {
          // Small file: direct unsigned upload to Cloudinary
          result = await uploadDirect(file, CLOUD_NAME, UPLOAD_PRESET, resourceType, setUploadProgress)
        }

        // Save to database
        console.log('Upload complete, saving to DB...', result.secure_url)
        let saveRes
        try {
          saveRes = await fetch(apiUrl('/api/save-media'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: file.name,
              url: result.secure_url,
              publicId: result.public_id,
              size: result.bytes,
              duration: result.duration || null,
              type: type,
            }),
          })
        } catch (fetchErr) {
          console.error('Fetch error, trying direct URL:', fetchErr)
          saveRes = await fetch('https://synccast-repo.vercel.app/api/save-media', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: file.name,
              url: result.secure_url,
              publicId: result.public_id,
              size: result.bytes,
              duration: result.duration || null,
              type: type,
            }),
          })
        }
        const saveData = await saveRes.json()

        if (saveData.file) {
          toast.success(`"${file.name}" subido correctamente`)
        } else {
          toast.error('Error guardando: ' + (saveData.error || 'desconocido'))
        }
      } catch (e: any) {
        toast.error(`Error subiendo ${file.name}: ${e.message}`)
        console.error('Upload error:', e)
      }
    }

    await fetchMedia()
    setUploading(false)
    setUploadProgress(0)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // Direct upload for files < 90MB
  const uploadDirect = async (file: File, cloudName: string, preset: string, resourceType: string, onProgress: (p: number) => void) => {
    return new Promise<any>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      const formData = new FormData()
      formData.append('file', file)
      formData.append('upload_preset', preset)
      formData.append('folder', 'synccast')

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100))
        }
      })

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const parsed = JSON.parse(xhr.responseText)
            if (parsed.secure_url) resolve(parsed)
            else reject(new Error('Cloudinary no devolvió URL'))
          } catch (e) {
            reject(new Error('Error parseando respuesta'))
          }
        } else {
          reject(new Error(`Error ${xhr.status}: ${xhr.responseText?.substring(0, 100)}`))
        }
      })

      xhr.addEventListener('error', () => reject(new Error('Error de red')))
      xhr.open('POST', `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`)
      xhr.send(formData)
    })
  }



  // --------------------------------------------------------
  // Delete media
  // --------------------------------------------------------
  const handleDeleteMedia = async (id: string) => {
    try {
      await fetch(apiUrl(`/api/media?id=${id}`), { method: 'DELETE' })
      await fetchMedia()
      toast.success('Archivo eliminado')
    } catch (e: any) {
      toast.error('Error: ' + e.message)
    }
  }

  // --------------------------------------------------------
  // Start playback
  // --------------------------------------------------------
  const startPlayback = (media: MediaFile[], startIndex = 0) => {
    if (media.length === 0) {
      toast.error('Selecciona al menos un archivo')
      return
    }
    const playlist = media.map((m) => ({
      id: m.id,
      name: m.name,
      url: m.url,
      type: m.type,
      duration: m.duration || 0,
      youtubeId: m.youtubeId,
    }))
    sendCommand('load-playlist', {
      playlist,
      playlistId: `temp_${Date.now()}`,
      startIndex,
    })
    setTimeout(() => sendCommand('play', { position: 0 }), 300)
    setTab('player')
    toast.success(`Reproduciendo "${playlist[startIndex].name}" en ${tvs.length} TV(s)`)
  }

  // --------------------------------------------------------
  // Play/pause toggle
  // --------------------------------------------------------
  const togglePlayPause = () => {
    if (playback?.isPlaying) {
      sendCommand('pause', { position: playback.position })
    } else {
      sendCommand('play', { position: playback?.position || 0 })
    }
  }

  // --------------------------------------------------------
  // Seek
  // --------------------------------------------------------
  const handleSeek = (value: number[]) => {
    sendCommand('seek', { position: value[0] })
  }

  // --------------------------------------------------------
  // Volume control
  // --------------------------------------------------------
  const handleMasterVolume = (value: number[]) => {
    const v = value[0]
    setMasterVolume(v)
    sendCommand('set-volume', { volume: v })
  }

  const handleTvVolume = (tvId: string, value: number[]) => {
    const v = value[0]
    setTvVolumes((prev) => ({ ...prev, [tvId]: v }))
    sendCommand('set-volume', { tvId, volume: v })
  }

  const handleRenameTv = (tvId: string, name: string) => {
    sendCommand('rename-tv', { tvId, name })
    setEditingTvName(null)
    toast.success('TV renombrado')
  }

  const handleKickTv = (tvId: string) => {
    sendCommand('kick-tv', { tvId })
    toast.success('TV desconectado')
  }

  const formatTime = (s: number) => {
    if (!s || isNaN(s)) return '0:00'
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const formatSize = (b: number) => {
    if (b < 1024) return `${b} B`
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
    return `${(b / (1024 * 1024)).toFixed(1)} MB`
  }

  const videoFiles = mediaFiles.filter((f) => f.type === 'video')
  const audioFiles = mediaFiles.filter((f) => f.type === 'audio')
  const youtubeFiles = mediaFiles.filter((f) => f.type === 'youtube')
  const onlineTvs = tvs.filter((t) => t.isOnline)

  // --------------------------------------------------------
  // Add YouTube video
  // --------------------------------------------------------
  const handleAddYoutube = async () => {
    if (!youtubeUrlInput.trim()) return
    setAddingYoutube(true)
    try {
      // Try to download as MP4 first (works on all TVs)
      const res = await fetch(apiUrl('/api/youtube-download'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: youtubeUrlInput.trim() }),
      })
      const data = await res.json()
      if (data.file) {
        if (data.file.type === 'video') {
          toast.success('Video descargado como MP4 - se reproducirá en todas las TVs')
        } else {
          toast.success('Video agregado (como enlace de YouTube)')
        }
        setYoutubeUrlInput('')
        await fetchMedia()
      } else {
        toast.error(data.error || 'Error al agregar video')
      }
    } catch (e: any) {
      toast.error('Error: ' + e.message)
    } finally {
      setAddingYoutube(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="glass sticky top-0 z-50 px-4 py-3 border-b border-white/5">
        <div className="flex items-center justify-between max-w-5xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center glow">
              <Cast className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">SyncCast</h1>
              <p className="text-xs text-white/60 flex items-center gap-1.5">
                <Wifi className={`w-3 h-3 ${isConnected ? 'text-green-400' : 'text-amber-400'}`} />
                {isConnected ? 'Conectado' : 'Reconectando...'} · {onlineTvs.length} TV(s)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-white/40 hidden sm:inline" title="Versión de la app">
              v{getCurrentVersion()}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setServerUrlInput(getServerUrl())
                setShowServerDialog(true)
              }}
              className="text-white/70 hover:text-white"
              title="Configurar servidor"
            >
              <Settings className="w-4 h-4" />
            </Button>
            <Badge variant="outline" className="glass border-primary/30 text-primary">
              <Smartphone className="w-3 h-3 mr-1" />
              Controlador
            </Badge>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6 pb-24">
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="flex w-full glass overflow-x-auto overflow-y-hidden">
            <TabsTrigger value="player" className="data-[state=active]:bg-primary/20 flex-1 min-w-[60px] px-2 sm:px-3">
              <Play className="w-4 h-4 sm:mr-1.5" /> <span className="hidden sm:inline">Reproductor</span>
            </TabsTrigger>
            <TabsTrigger value="videos" className="data-[state=active]:bg-primary/20 flex-1 min-w-[60px] px-2 sm:px-3">
              <Video className="w-4 h-4 sm:mr-1.5" /> <span className="hidden sm:inline">Videos</span>
            </TabsTrigger>
            <TabsTrigger value="music" className="data-[state=active]:bg-primary/20 flex-1 min-w-[60px] px-2 sm:px-3">
              <Music className="w-4 h-4 sm:mr-1.5" /> <span className="hidden sm:inline">Música</span>
            </TabsTrigger>
            <TabsTrigger value="youtube" className="data-[state=active]:bg-primary/20 flex-1 min-w-[60px] px-2 sm:px-3">
              <Youtube className="w-4 h-4 sm:mr-1.5" /> <span className="hidden sm:inline">YouTube</span>
            </TabsTrigger>
            <TabsTrigger value="tvs" className="data-[state=active]:bg-primary/20 flex-1 min-w-[60px] px-2 sm:px-3">
              <Tv className="w-4 h-4 sm:mr-1.5" /> <span className="hidden sm:inline">TVs</span> ({onlineTvs.length})
            </TabsTrigger>
          </TabsList>

          {/* PLAYER TAB */}
          <TabsContent value="player" className="space-y-4 mt-4">
            <Card className="glass-card p-6">
              {/* Now Playing */}
              <div className="flex items-center gap-4 mb-6">
                <div className="w-20 h-20 rounded-lg bg-gradient-to-br from-primary/40 to-purple-700/40 flex items-center justify-center flex-shrink-0">
                  {playback?.mediaType === 'audio' ? (
                    <Music className="w-8 h-8 text-primary" />
                  ) : playback?.mediaType === 'video' ? (
                    <Video className="w-8 h-8 text-primary" />
                  ) : (
                    <Play className="w-8 h-8 text-white/40" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white/50 uppercase tracking-wider mb-1">
                    {playback?.isPlaying ? 'Reproduciendo' : 'En pausa'}
                  </p>
                  <h3 className="text-xl font-bold text-white truncate">
                    {playback?.mediaName || 'Ningún medio seleccionado'}
                  </h3>
                  <p className="text-sm text-white/60 mt-1">
                    {playback?.playlist?.length
                      ? `${playback.playlistIndex + 1} de ${playback.playlist.length} · ${onlineTvs.length} TV(s) sincronizando`
                      : 'Selecciona videos o música para comenzar'}
                  </p>
                </div>
              </div>

              {/* Progress bar */}
              {playback && playback.duration > 0 && (
                <div className="mb-6">
                  <Slider
                    value={[playback.position]}
                    max={playback.duration}
                    step={0.1}
                    onValueChange={handleSeek}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-white/60 mt-2">
                    <span>{formatTime(playback.position)}</span>
                    <span>{formatTime(playback.duration)}</span>
                  </div>
                </div>
              )}

              {/* Playback controls */}
              <div className="flex items-center justify-center gap-4">
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/10"
                  onClick={() => sendCommand('previous', {})}
                  disabled={!playback || playback.playlistIndex === 0}
                >
                  <SkipBack className="w-6 h-6" />
                </Button>
                <Button
                  size="lg"
                  className="w-16 h-16 rounded-full bg-primary hover:bg-primary/90 glow"
                  onClick={togglePlayPause}
                  disabled={!playback?.mediaUrl}
                >
                  {playback?.isPlaying ? (
                    <Pause className="w-7 h-7" />
                  ) : (
                    <Play className="w-7 h-7 ml-1" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/10"
                  onClick={() => sendCommand('next', {})}
                  disabled={!playback || playback.playlistIndex >= (playback.playlist?.length || 0) - 1}
                >
                  <SkipForward className="w-6 h-6" />
                </Button>
              </div>
              <div className="flex items-center justify-center gap-2 mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => sendCommand('stop', {})}
                  disabled={!playback?.mediaUrl}
                  className="glass border-white/10"
                >
                  <Square className="w-3 h-3 mr-1.5" /> Detener
                </Button>
              </div>

              {/* Master volume */}
              <Separator className="my-6 bg-white/10" />
              <div>
                <Label className="text-sm text-white/80 flex items-center gap-2 mb-3">
                  <Volume2 className="w-4 h-4 text-primary" />
                  Volumen Maestro
                </Label>
                <div className="flex items-center gap-3">
                  <Volume1 className="w-4 h-4 text-white/40" />
                  <Slider
                    value={[masterVolume]}
                    max={100}
                    step={1}
                    onValueChange={handleMasterVolume}
                    className="flex-1"
                  />
                  <span className="text-sm text-white/80 w-10 text-right">{masterVolume}%</span>
                </div>
              </div>
            </Card>

            {/* Quick actions */}
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                className="glass border-white/10 h-20 flex-col gap-1"
                onClick={() => setTab('videos')}
              >
                <Video className="w-6 h-6 text-primary" />
                <span className="text-xs">Subir Videos</span>
              </Button>
              <Button
                variant="outline"
                className="glass border-white/10 h-20 flex-col gap-1"
                onClick={() => setTab('music')}
              >
                <Music className="w-6 h-6 text-primary" />
                <span className="text-xs">Subir Música</span>
              </Button>
            </div>
          </TabsContent>

          {/* VIDEOS TAB */}
          <TabsContent value="videos" className="space-y-4 mt-4">
            <Card className="glass-card p-4">
              <div className="flex items-center justify-between mb-3">
                <Label className="text-base font-semibold text-white flex items-center gap-2">
                  <Video className="w-4 h-4 text-primary" />
                  Subir Videos
                </Label>
                <Button
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                      {uploadProgress > 0 ? `${uploadProgress}%` : 'Subiendo...'}
                    </>
                  ) : (
                    <Upload className="w-4 h-4 mr-1" />
                  )}
                  Subir
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  multiple
                  className="hidden"
                  onChange={(e) => handleUpload(e.target.files, 'video')}
                />
              </div>
              <p className="text-xs text-white/50">
                Formatos soportados: MP4, WebM, MKV, MOV
              </p>
              {uploading && uploadProgress > 0 && (
                <div className="mt-3 space-y-1">
                  <div className="flex items-center justify-between text-xs text-white/60">
                    <span>Subiendo a Cloudinary...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </Card>

            <Card className="glass-card p-4">
              <div className="flex items-center justify-between mb-3">
                <Label className="text-base font-semibold text-white">
                  Biblioteca de Videos ({videoFiles.length})
                </Label>
                {selectedMedia.length > 0 && (
                  <Button
                    size="sm"
                    onClick={() => startPlayback(selectedMedia)}
                    className="bg-primary glow"
                  >
                    <Cast className="w-4 h-4 mr-1" />
                    Reproducir en {onlineTvs.length} TV(s)
                  </Button>
                )}
              </div>
              <ScrollArea className="h-96 pr-2">
                <div className="space-y-2">
                  {videoFiles.length === 0 ? (
                    <div className="text-center py-12">
                      <Video className="w-12 h-12 text-white/20 mx-auto mb-3" />
                      <p className="text-white/40">No hay videos subidos</p>
                      <p className="text-xs text-white/30 mt-1">Sube tu primer video para comenzar</p>
                    </div>
                  ) : (
                    videoFiles.map((file) => (
                      <div
                        key={file.id}
                        className={`p-3 rounded-lg border transition-all cursor-pointer ${
                          selectedMedia.find((m) => m.id === file.id)
                            ? 'glass border-primary bg-primary/10'
                            : 'glass border-white/5 hover:border-white/20'
                        }`}
                        onClick={() => {
                          setSelectedMedia((prev) =>
                            prev.find((m) => m.id === file.id)
                              ? prev.filter((m) => m.id !== file.id)
                              : [...prev, file]
                          )
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded bg-gradient-to-br from-primary/40 to-purple-700/30 flex items-center justify-center flex-shrink-0">
                            <Video className="w-5 h-5 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">{file.name}</p>
                            <p className="text-xs text-white/50">{formatSize(file.size)}</p>
                          </div>
                          {selectedMedia.find((m) => m.id === file.id) && (
                            <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0" />
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-white/40 hover:text-destructive hover:bg-destructive/10 h-8 w-8"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeleteMedia(file.id)
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
              {selectedMedia.length > 1 && (
                <p className="text-xs text-white/60 mt-3 flex items-center gap-1.5">
                  <ListMusic className="w-3 h-3" />
                  {selectedMedia.length} videos seleccionados - se reproducirán en orden
                </p>
              )}
            </Card>
          </TabsContent>

          {/* MUSIC TAB */}
          <TabsContent value="music" className="space-y-4 mt-4">
            <Card className="glass-card p-4">
              <div className="flex items-center justify-between mb-3">
                <Label className="text-base font-semibold text-white flex items-center gap-2">
                  <Music className="w-4 h-4 text-primary" />
                  Subir Música
                </Label>
                <Button
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                      {uploadProgress > 0 ? `${uploadProgress}%` : 'Subiendo...'}
                    </>
                  ) : (
                    <Upload className="w-4 h-4 mr-1" />
                  )}
                  Subir
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*"
                  multiple
                  className="hidden"
                  onChange={(e) => handleUpload(e.target.files, 'audio')}
                />
              </div>
              <p className="text-xs text-white/50">
                Formatos soportados: MP3, WAV, OGG, M4A, FLAC
              </p>
              {uploading && uploadProgress > 0 && (
                <div className="mt-3 space-y-1">
                  <div className="flex items-center justify-between text-xs text-white/60">
                    <span>Subiendo a Cloudinary...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </Card>

            <Card className="glass-card p-4">
              <div className="flex items-center justify-between mb-3">
                <Label className="text-base font-semibold text-white">
                  Biblioteca de Música ({audioFiles.length})
                </Label>
                {selectedMedia.length > 0 && (
                  <Button
                    size="sm"
                    onClick={() => startPlayback(selectedMedia)}
                    className="bg-primary glow"
                  >
                    <Cast className="w-4 h-4 mr-1" />
                    Reproducir en {onlineTvs.length} TV(s)
                  </Button>
                )}
              </div>
              <ScrollArea className="h-96 pr-2">
                <div className="space-y-2">
                  {audioFiles.length === 0 ? (
                    <div className="text-center py-12">
                      <Music className="w-12 h-12 text-white/20 mx-auto mb-3" />
                      <p className="text-white/40">No hay música subida</p>
                      <p className="text-xs text-white/30 mt-1">Sube tu primera canción para comenzar</p>
                    </div>
                  ) : (
                    audioFiles.map((file, idx) => (
                      <div
                        key={file.id}
                        className={`p-3 rounded-lg border transition-all cursor-pointer ${
                          selectedMedia.find((m) => m.id === file.id)
                            ? 'glass border-primary bg-primary/10'
                            : 'glass border-white/5 hover:border-white/20'
                        }`}
                        onClick={() => {
                          setSelectedMedia((prev) =>
                            prev.find((m) => m.id === file.id)
                              ? prev.filter((m) => m.id !== file.id)
                              : [...prev, file]
                          )
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded bg-gradient-to-br from-purple-500/40 to-pink-500/30 flex items-center justify-center flex-shrink-0">
                            <span className="text-xs text-white/80">{idx + 1}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">{file.name}</p>
                            <p className="text-xs text-white/50">{formatSize(file.size)}</p>
                          </div>
                          {selectedMedia.find((m) => m.id === file.id) && (
                            <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0" />
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-white/40 hover:text-destructive hover:bg-destructive/10 h-8 w-8"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeleteMedia(file.id)
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
              {selectedMedia.length > 1 && (
                <p className="text-xs text-white/60 mt-3 flex items-center gap-1.5">
                  <ListMusic className="w-3 h-3" />
                  {selectedMedia.length} canciones - se reproducirán como lista de reproducción
                </p>
              )}
            </Card>
          </TabsContent>

          {/* YOUTUBE TAB - Manual MP4 approach */}
          <TabsContent value="youtube" className="space-y-4 mt-4">
            <Card className="glass-card p-4 border-amber-500/20 bg-amber-500/5">
              <div className="flex items-start gap-3 mb-3">
                <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-300 mb-1">Cómo reproducir YouTube en 4K</p>
                  <p className="text-xs text-white/70">
                    YouTube bloquea la descarga automática. Para reproducir en 4K en tus TVs:
                  </p>
                </div>
              </div>
              <ol className="text-xs text-white/60 space-y-2 ml-8 list-decimal">
                <li>Descarga el video con <strong className="text-white">TubeMate</strong> o <strong className="text-white">1DM</strong> (apps gratis en Android)</li>
                <li>Selecciona calidad <strong className="text-white">4K (2160p)</strong> al descargar</li>
                <li>Vuelve aquí y sube el archivo MP4 en la pestaña <strong className="text-white">Videos</strong></li>
                <li>¡Reproduce en tus 10 TVs con sincronización perfecta!</li>
              </ol>
            </Card>

            <Card className="glass-card p-4">
              <Label className="text-base font-semibold text-white flex items-center gap-2 mb-3">
                <LinkIcon className="w-4 h-4 text-primary" />
                Agregar por URL (Google Drive, Dropbox, etc.)
              </Label>
              <div className="space-y-3">
                <Input
                  placeholder="https://drive.google.com/... o URL directa .mp4"
                  className="glass border-white/10"
                  value={youtubeUrlInput}
                  onChange={(e) => setYoutubeUrlInput(e.target.value)}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
                <Button
                  onClick={async () => {
                    if (!youtubeUrlInput.trim()) return
                    setAddingYoutube(true)
                    try {
                      const res = await fetch(apiUrl('/api/add-url'), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ url: youtubeUrlInput.trim(), type: 'video' }),
                      })
                      const data = await res.json()
                      if (data.file) {
                        toast.success('Video agregado por URL')
                        setYoutubeUrlInput('')
                        await fetchMedia()
                      } else {
                        toast.error(data.error || 'Error al agregar URL')
                      }
                    } catch (e: any) {
                      toast.error('Error: ' + e.message)
                    } finally {
                      setAddingYoutube(false)
                    }
                  }}
                  disabled={!youtubeUrlInput.trim() || addingYoutube}
                  className="w-full bg-primary"
                >
                  {addingYoutube ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Agregando...</>
                  ) : (
                    <><Plus className="w-4 h-4 mr-2" /> Agregar URL</>
                  )}
                </Button>
                <p className="text-xs text-white/50">
                  Para Google Drive: usa enlace directo de descarga (formato: <code>https://drive.google.com/uc?export=download&id=FILE_ID</code>)
                </p>
              </div>
            </Card>

            <Card className="glass-card p-4">
              <div className="flex items-center justify-between mb-3">
                <Label className="text-base font-semibold text-white flex items-center gap-2">
                  <Video className="w-4 h-4 text-primary" />
                  Biblioteca de Videos ({youtubeFiles.length})
                </Label>
                {selectedMedia.length > 0 && (
                  <Button
                    size="sm"
                    onClick={() => startPlayback(selectedMedia)}
                    className="bg-primary glow"
                  >
                    <Cast className="w-4 h-4 mr-1" />
                    Reproducir en {onlineTvs.length} TV(s)
                  </Button>
                )}
              </div>
              <ScrollArea className="h-96 pr-2">
                <div className="space-y-2">
                  {youtubeFiles.length === 0 ? (
                    <div className="text-center py-12">
                      <Youtube className="w-12 h-12 text-white/20 mx-auto mb-3" />
                      <p className="text-white/40">No hay videos de YouTube agregados</p>
                      <p className="text-xs text-white/30 mt-1">Pega una URL arriba para comenzar</p>
                    </div>
                  ) : (
                    youtubeFiles.map((file) => (
                      <div
                        key={file.id}
                        className={`p-3 rounded-lg border transition-all cursor-pointer ${
                          selectedMedia.find((m) => m.id === file.id)
                            ? 'glass border-red-500 bg-red-500/10'
                            : 'glass border-white/5 hover:border-white/20'
                        }`}
                        onClick={() => {
                          setSelectedMedia((prev) =>
                            prev.find((m) => m.id === file.id)
                              ? prev.filter((m) => m.id !== file.id)
                              : [...prev, file]
                          )
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded bg-gradient-to-br from-red-600/40 to-pink-600/30 flex items-center justify-center flex-shrink-0">
                            <Youtube className="w-5 h-5 text-red-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">{file.name}</p>
                            <p className="text-xs text-white/50">YouTube · {file.youtubeId}</p>
                          </div>
                          {selectedMedia.find((m) => m.id === file.id) && (
                            <CheckCircle2 className="w-5 h-5 text-red-500 flex-shrink-0" />
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-white/40 hover:text-destructive hover:bg-destructive/10 h-8 w-8"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeleteMedia(file.id)
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
              {selectedMedia.length > 1 && (
                <p className="text-xs text-white/60 mt-3 flex items-center gap-1.5">
                  <ListMusic className="w-3 h-3" />
                  {selectedMedia.length} videos seleccionados - se reproducirán en orden
                </p>
              )}
            </Card>
          </TabsContent>

          {/* TVS TAB */}
          <TabsContent value="tvs" className="space-y-4 mt-4">
            <Card className="glass-card p-4">
              <div className="flex items-center justify-between mb-4">
                <Label className="text-base font-semibold text-white flex items-center gap-2">
                  <Tv className="w-4 h-4 text-primary" />
                  TVs Conectados ({onlineTvs.length})
                </Label>
                <Button variant="outline" size="sm" className="glass border-white/10" onClick={() => setTab('player')}>
                  <Cast className="w-3 h-3 mr-1.5" /> Ir a Control
                </Button>
              </div>

              {tvs.length === 0 ? (
                <div className="text-center py-12">
                  <Monitor className="w-12 h-12 text-white/20 mx-auto mb-3" />
                  <p className="text-white/40">No hay TVs conectados</p>
                  <p className="text-xs text-white/30 mt-1">
                    Abre la URL de este sitio en el navegador del TV para registrarlo
                  </p>
                </div>
              ) : (
                <ScrollArea className="max-h-[60vh] pr-2">
                  <div className="space-y-3">
                    {tvs.map((tv) => (
                      <div key={tv.tvId} className="glass border border-white/5 rounded-lg p-4 hover:border-white/20 transition-all">
                        <div className="flex items-center gap-3 mb-3">
                          <div className={`w-3 h-3 rounded-full ${tv.isOnline ? 'bg-green-400 animate-pulse-live' : 'bg-red-400'}`} />
                          <Monitor className="w-5 h-5 text-primary" />
                          {editingTvName === tv.tvId ? (
                            <div className="flex items-center gap-2 flex-1">
                              <Input
                                value={newTvName}
                                onChange={(e) => setNewTvName(e.target.value)}
                                className="glass border-white/10 h-8"
                                autoFocus
                              />
                              <Button size="sm" onClick={() => handleRenameTv(tv.tvId, newTvName || tv.name)}>
                                <CheckCircle2 className="w-3 h-3" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditingTvName(null)}>
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex-1">
                              <p className="font-medium text-white">{tv.name}</p>
                              <p className="text-xs text-white/50">
                                {tv.isOnline ? 'En línea' : 'Desconectado'} · Volumen: {tv.volume}%
                              </p>
                            </div>
                          )}
                          {!editingTvName && (
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-white/40 hover:text-white"
                                onClick={() => {
                                  setEditingTvName(tv.tvId)
                                  setNewTvName(tv.name)
                                }}
                              >
                                <Pencil className="w-3 h-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-white/40 hover:text-destructive hover:bg-destructive/10"
                                onClick={() => handleKickTv(tv.tvId)}
                              >
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          )}
                        </div>

                        {tv.isOnline && (
                          <div className="flex items-center gap-3">
                            <VolumeX className="w-4 h-4 text-white/40 flex-shrink-0" />
                            <Slider
                              value={[tvVolumes[tv.tvId] ?? tv.volume]}
                              max={100}
                              step={1}
                              onValueChange={(v) => handleTvVolume(tv.tvId, v)}
                              className="flex-1"
                            />
                            <Volume2 className="w-4 h-4 text-primary flex-shrink-0" />
                            <span className="text-xs text-white/70 w-10 text-right">
                              {tvVolumes[tv.tvId] ?? tv.volume}%
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </Card>

            {/* Master volume */}
            <Card className="glass-card p-4">
              <Label className="text-base font-semibold text-white flex items-center gap-2 mb-3">
                <Settings className="w-4 h-4 text-primary" />
                Volumen Global
              </Label>
              <div className="flex items-center gap-3">
                <VolumeX className="w-5 h-5 text-white/40" />
                <Slider
                  value={[masterVolume]}
                  max={100}
                  step={1}
                  onValueChange={handleMasterVolume}
                  className="flex-1"
                />
                <Volume2 className="w-5 h-5 text-primary" />
                <span className="text-sm text-white/80 w-10 text-right">{masterVolume}%</span>
              </div>
              <p className="text-xs text-white/50 mt-2">
                Aplica a todos los TVs conectados
              </p>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Footer */}
      <footer className="glass border-t border-white/5 px-4 py-3 mt-auto">
        <p className="text-xs text-white/40 text-center">
          SyncCast · Funciona en red WiFi local · Instalable como app en Android
        </p>
      </footer>

      {/* Server config dialog */}
      <Dialog open={showServerDialog} onOpenChange={setShowServerDialog}>
        <DialogContent className="glass-card border-white/10 max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Server className="w-5 h-5 text-primary" />
              Configurar Servidor
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-white/60">
              Ingresa la URL del servidor SyncCast (tu PC, Raspberry Pi o Vercel).
              Todos los TVs y este controlador deben apuntar al mismo servidor.
            </p>
            <Input
              value={serverUrlInput}
              onChange={(e) => setServerUrlInput(e.target.value)}
              placeholder="http://192.168.1.100:81"
              className="glass border-white/10"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
            <p className="text-xs text-white/40">
              URL actual: <code className="bg-white/5 px-1 py-0.5 rounded">{getServerUrl() || '(usando origen actual)'}</code>
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowServerDialog(false)} className="glass border-white/10">
              Cancelar
            </Button>
            <Button
              onClick={() => {
                setServerUrl(serverUrlInput)
                notifyServerUrlChanged()
                setShowServerDialog(false)
                toast.success('Servidor actualizado')
                setTimeout(() => fetchMedia(), 500)
              }}
              className="bg-primary"
            >
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
