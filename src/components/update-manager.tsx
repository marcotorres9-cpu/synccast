'use client'

import { useEffect, useState, useRef } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { X, Download, RefreshCw, Sparkles, CheckCircle2 } from 'lucide-react'

const GITHUB_RELEASES_URL = 'https://api.github.com/repos/marcotorres9-cpu/synccast/releases/latest'
const WEB_VERSION_URL = 'https://synccast-repo.vercel.app/api/version'
const CURRENT_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || '2.0.0'

interface UpdateInfo {
  version: string
  downloadUrl: string
  size: number
  releaseNotes: string
}

export function UpdateManager() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [downloaded, setDownloaded] = useState(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    // Check for pending update on launch
    checkForUpdate()
    return () => { mountedRef.current = false }
  }, [])

  const checkForUpdate = async () => {
    try {
      // Don't check in TV mode
      if (typeof window !== 'undefined' && localStorage.getItem('synccast-tv')) return

      // Check if already dismissed this version
      const dismissedVersion = localStorage.getItem('synccast-update-dismissed')
      if (dismissedVersion) return

      // Check if already downloaded
      const downloadedVersion = localStorage.getItem('synccast-update-downloaded')
      if (downloadedVersion) {
        setDownloaded(true)
        return
      }

      // Get web version
      const webResponse = await fetch(WEB_VERSION_URL, { cache: 'no-store' })
      if (!webResponse.ok) return
      const webData = await webResponse.json()
      const webVersion = webData.version

      if (compareVersions(webVersion, CURRENT_VERSION) <= 0) return

      // Get download URL from GitHub
      const ghResponse = await fetch(GITHUB_RELEASES_URL)
      if (!ghResponse.ok) return
      const release = await ghResponse.json()

      const apkAsset = release.assets?.find((a: any) => a.name.endsWith('.apk'))
      if (!apkAsset) return

      if (!mountedRef.current) return
      setUpdate({
        version: webVersion,
        downloadUrl: apkAsset.browser_download_url,
        size: apkAsset.size,
        releaseNotes: webData.changelog || release.body || '',
      })
    } catch (e) {
      console.error('Update check failed:', e)
    }
  }

  const compareVersions = (v1: string, v2: string): number => {
    const p1 = v1.split('.').map(Number)
    const p2 = v2.split('.').map(Number)
    for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
      const a = p1[i] || 0, b = p2[i] || 0
      if (a > b) return 1
      if (a < b) return -1
    }
    return 0
  }

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

      // Mark as downloaded so we don't show again
      localStorage.setItem('synccast-update-downloaded', update.version)
      setDownloaded(true)
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
    if (update) {
      localStorage.setItem('synccast-update-dismissed', update.version)
    }
  }

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
              v{CURRENT_VERSION} → <span className="text-primary font-medium">v{update.version}</span>
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
