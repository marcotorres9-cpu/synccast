'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { X, Download, RefreshCw, Sparkles } from 'lucide-react'
import { checkForUpdate, getPendingUpdate, setPendingUpdate, getCurrentVersion, dismissUpdate, isUpdateDismissed, type UpdateInfo } from '@/lib/auto-updater'

export function UpdateNotification() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)

  useEffect(() => {
    // Don't show update notification in TV mode
    // (TVs should not see update prompts - only the controller phone should)
    if (typeof window !== 'undefined') {
      const tvMode = localStorage.getItem('synccast-tv')
      if (tvMode) return // This is a TV, don't show update notification
    }

    // If user dismissed, don't show again
    if (isUpdateDismissed()) return

    // Check for pending update first
    const pending = getPendingUpdate()
    if (pending) {
      setUpdate(pending)
      return
    }

    // Check for new update on app launch (delayed to not block initial load)
    const timer = setTimeout(() => {
      checkForUpdate().then((info) => {
        if (info) {
          setUpdate(info)
          setPendingUpdate(info)
        }
      })
    }, 3000)

    return () => clearTimeout(timer)
  }, [])

  const handleDownload = async () => {
    if (!update) return
    setDownloading(true)
    setDownloadProgress(0)

    try {
      const response = await fetch(update.downloadUrl)
      const contentLength = response.headers.get('content-length')
      const total = contentLength ? parseInt(contentLength, 10) : 0
      const reader = response.body?.getReader()
      if (!reader) throw new Error('No reader')

      const chunks: Uint8Array[] = []
      let received = 0
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) {
          chunks.push(value)
          received += value.length
          if (total > 0) {
            setDownloadProgress(Math.round((received / total) * 100))
          }
        }
      }

      const blob = new Blob(chunks as BlobPart[], { type: 'application/vnd.android.package-archive' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `SyncCast-v${update.version}.apk`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      setPendingUpdate(null)
      setUpdate(null)
    } catch (e) {
      console.error('Download failed:', e)
      window.open(update.downloadUrl, '_blank')
    } finally {
      setDownloading(false)
    }
  }

  const handleDismiss = () => {
    setDismissed(true)
    dismissUpdate()
  }

  // Don't render anything in TV mode
  if (typeof window !== 'undefined' && localStorage.getItem('synccast-tv')) return null

  if (!update || dismissed) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm">
      <Card className="glass-card p-4 border-primary/30 shadow-lg">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-semibold text-white">
                Actualización disponible
              </p>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-white/40 hover:text-white"
                onClick={handleDismiss}
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
            <p className="text-xs text-white/60 mb-2">
              v{getCurrentVersion()} → <span className="text-primary font-medium">v{update.version}</span>
              {' · '}
              {(update.size / 1024 / 1024).toFixed(1)} MB
            </p>
            {update.releaseNotes && (
              <p className="text-xs text-white/50 mb-3 line-clamp-2">
                {update.releaseNotes.split('\n')[0]}
              </p>
            )}

            {downloading ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-3 h-3 text-primary animate-spin" />
                  <span className="text-xs text-white/70">
                    {downloadProgress > 0 ? `Descargando ${downloadProgress}%` : 'Iniciando...'}
                  </span>
                </div>
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${downloadProgress}%` }}
                  />
                </div>
              </div>
            ) : (
              <Button
                onClick={handleDownload}
                size="sm"
                className="w-full bg-primary text-white"
              >
                <Download className="w-3 h-3 mr-1.5" />
                Descargar actualización
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  )
}
