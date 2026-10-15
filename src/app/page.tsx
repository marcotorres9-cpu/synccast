'use client'

import { useState } from 'react'
import { Controller } from '@/components/controller'
import { TvPlayer } from '@/components/tv-player'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Smartphone, Monitor, Cast, Tv, ArrowRight, Sparkles, Wifi, Zap, Volume2, Settings, Server, Check, ArrowLeft, Download } from 'lucide-react'
import { getServerUrl, setServerUrl } from '@/lib/server-url'
import { notifyServerUrlChanged } from '@/hooks/use-sync-socket'

type Role = 'landing' | 'controller' | 'tv-setup' | 'tv-player' | 'server-setup'

// Lazy initializer reads saved TV identity once
function readSavedTv(): { tvId: string; tvName: string; autoResume: boolean } {
  if (typeof window === 'undefined') return { tvId: '', tvName: '', autoResume: false }
  try {
    const saved = localStorage.getItem('synccast-tv')
    if (saved) {
      const data = JSON.parse(saved)
      const params = new URLSearchParams(window.location.search)
      const autoResume = params.get('role') === 'tv'
      if (data.tvId && data.tvName) {
        return { tvId: data.tvId, tvName: data.tvName, autoResume }
      }
    }
  } catch {}
  return { tvId: '', tvName: '', autoResume: false }
}

// Check if we're running inside Capacitor (native APK) - in that case a server URL is required
function isNativeAndroid(): boolean {
  if (typeof window === 'undefined') return false
  // Capacitor injects this
  return !!(window as any).Capacitor?.isNativePlatform?.()
}

export default function Home() {
  const initial = typeof window !== 'undefined' ? readSavedTv() : { tvId: '', tvName: '', autoResume: false }
  // If running as native APK and no server URL set, show server setup first
  const needsServerSetup = typeof window !== 'undefined' && isNativeAndroid() && !getServerUrl()
  const [role, setRole] = useState<Role>(needsServerSetup ? 'server-setup' : (initial.autoResume ? 'tv-player' : 'landing'))
  const [tvName, setTvName] = useState(initial.tvName)
  const [tvId, setTvId] = useState(initial.tvId)

  const startTvMode = () => {
    const name = tvName.trim() || `TV-${Math.floor(Math.random() * 9000 + 1000)}`
    const id = `tv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    setTvName(name)
    setTvId(id)
    localStorage.setItem('synccast-tv', JSON.stringify({ tvId: id, tvName: name }))
    setRole('tv-player')
  }

  const exitTvMode = () => {
    localStorage.removeItem('synccast-tv')
    setRole('landing')
    setTvName('')
    setTvId('')
  }

  if (role === 'controller') {
    return <Controller />
  }

  if (role === 'tv-player' && tvId && tvName) {
    return <TvPlayer tvId={tvId} tvName={tvName} onExit={exitTvMode} />
  }

  if (role === 'tv-setup') {
    return (
      <TvSetupScreen
        tvName={tvName}
        setTvName={setTvName}
        onStart={startTvMode}
        onBack={() => setRole('landing')}
      />
    )
  }

  if (role === 'server-setup') {
    return <ServerSetupScreen onDone={() => setRole('landing')} onBack={() => setRole('landing')} />
  }

  return (
    <Landing
      onController={() => setRole('controller')}
      onTv={() => setRole('tv-setup')}
      onServerSetup={() => setRole('server-setup')}
    />
  )
}

// ============================================================
// Server Setup screen (shown on first launch in APK)
// ============================================================
function ServerSetupScreen({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const [url, setUrl] = useState(getServerUrl())
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<'ok' | 'fail' | null>(null)

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const cleaned = url.trim().replace(/\/+$/, '')
      // Try to reach the server's /api/media endpoint
      const res = await fetch(`${cleaned}/api/media`, { method: 'GET' })
      if (res.ok) {
        setTestResult('ok')
      } else {
        setTestResult('fail')
      }
    } catch {
      setTestResult('fail')
    } finally {
      setTesting(false)
    }
  }

  const handleSave = () => {
    setServerUrl(url)
    notifyServerUrlChanged()
    onDone()
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute top-1/3 left-1/3 w-96 h-96 rounded-full bg-primary/20 blur-[120px]" />
      </div>
      <Card className="glass-card p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center mx-auto mb-4 glow">
            <Server className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Configurar Servidor</h2>
          <p className="text-sm text-white/60">
            Ingresa la URL del servidor SyncCast (Vercel + Render).
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <Label htmlFor="server-url" className="text-sm text-white/80 mb-2 block">
              URL del Servidor
            </Label>
            <Input
              id="server-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://synccast-repo.vercel.app"
              className="glass border-white/10"
              autoFocus
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
            <p className="text-xs text-white/40 mt-2">
              URL del servidor: <code className="bg-white/5 px-1 py-0.5 rounded">https://synccast-repo.vercel.app</code>
            </p>
          </div>

          {testResult === 'ok' && (
            <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/30 flex items-center gap-2">
              <Check className="w-4 h-4 text-green-400" />
              <p className="text-sm text-green-300">¡Servidor accesible!</p>
            </div>
          )}
          {testResult === 'fail' && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30">
              <p className="text-sm text-destructive">No se pudo conectar. Verifica que la URL esté completa (debe terminar en .vercel.app)</p>
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="outline" onClick={onBack} className="glass border-white/10">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Cancelar
            </Button>
            <Button variant="outline" onClick={handleTest} disabled={testing || !url.trim()} className="glass border-white/10">
              {testing ? 'Probando...' : 'Probar'}
            </Button>
            <Button onClick={handleSave} disabled={!url.trim()} className="flex-1 bg-primary glow">
              Guardar
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>

        <div className="mt-6 p-3 rounded-lg bg-primary/5 border border-primary/20">
          <p className="text-xs text-white/70">
            <strong className="text-primary">Servidor por defecto:</strong> Si no sabes qué URL poner, simplemente toca "Guardar". La URL <code className="bg-white/5 px-1 py-0.5 rounded">https://synccast-repo.vercel.app</code> ya está preconfigurada y funciona automáticamente.
          </p>
        </div>
      </Card>
    </div>
  )
}

// ============================================================
// Landing screen
// ============================================================
function Landing({
  onController,
  onTv,
  onServerSetup,
}: {
  onController: () => void
  onTv: () => void
  onServerSetup: () => void
}) {
  const currentServer = getServerUrl()
  return (
    <div className="min-h-screen flex flex-col">
      {/* Animated background glow */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-primary/20 blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-purple-600/15 blur-[120px]" />
      </div>

      <header className="px-6 py-6">
        <div className="flex items-center justify-between max-w-5xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center glow">
              <Cast className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">SyncCast</h1>
              <p className="text-xs text-white/60">Multi-TV Video & Music Sync</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onServerSetup}
            className="glass border border-white/10 text-white/70 hover:text-white"
          >
            <Settings className="w-4 h-4 mr-1.5" />
            Servidor
          </Button>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="max-w-4xl w-full">
          {/* Hero */}
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass border border-primary/30 mb-6">
              <Sparkles className="w-3 h-3 text-primary" />
              <span className="text-xs font-medium text-primary">Instalable como app en Android</span>
            </div>
            <h2 className="text-4xl md:text-6xl font-bold text-white mb-4 leading-tight">
              Sincroniza videos y música
              <br />
              <span className="bg-gradient-to-r from-primary via-purple-400 to-pink-400 bg-clip-text text-transparent">
                en múltiples televisores
              </span>
            </h2>
            <p className="text-lg text-white/60 max-w-2xl mx-auto mb-8">
              Reproduce el mismo video o lista de música simultáneamente en todos tus TVs.
              Controla todo desde tu teléfono con sincronización precisa tipo Chromecast.
            </p>
            {currentServer && (
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-500/10 border border-green-500/30 text-xs text-green-300 mb-4">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse-live" />
                Servidor: {currentServer}
              </div>
            )}
            <div className="flex flex-wrap justify-center gap-3 mb-8">
              <Badge><Zap className="w-3 h-3 mr-1" /> Sincronización precisa</Badge>
              <Badge><Wifi className="w-3 h-3 mr-1" /> WiFi local</Badge>
              <Badge><Volume2 className="w-3 h-3 mr-1" /> Volumen por TV</Badge>
              <Badge><Monitor className="w-3 h-3 mr-1" /> Hasta 10 TVs</Badge>
            </div>
          </div>

          {/* Role selection cards */}
          <div className="grid md:grid-cols-2 gap-6 mb-8">
            {/* Controller (Phone) */}
            <Card
              className="glass-card p-8 cursor-pointer hover:border-primary/50 hover:glow-strong transition-all group"
              onClick={onController}
            >
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Smartphone className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">Soy un Teléfono</h3>
              <p className="text-white/60 mb-4">
                Controla la reproducción de videos y música en todos los televisores desde aquí.
              </p>
              <ul className="space-y-2 mb-6">
                <li className="text-sm text-white/80 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                  Sube archivos multimedia
                </li>
                <li className="text-sm text-white/80 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                  Crea listas de reproducción
                </li>
                <li className="text-sm text-white/80 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                  Controla volumen y reproducción
                </li>
              </ul>
              <div className="flex items-center text-primary font-medium group-hover:gap-2 transition-all">
                Abrir Controlador
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </Card>

            {/* TV */}
            <Card
              className="glass-card p-8 cursor-pointer hover:border-primary/50 hover:glow-strong transition-all group"
              onClick={onTv}
            >
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Tv className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">Soy un Televisor</h3>
              <p className="text-white/60 mb-4">
                Conecta este TV como pantalla de reproducción controlada desde un teléfono.
              </p>
              <ul className="space-y-2 mb-6">
                <li className="text-sm text-white/80 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                  Recibe videos y música
                </li>
                <li className="text-sm text-white/80 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                  Sincronización automática
                </li>
                <li className="text-sm text-white/80 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                  Volumen ajustable individualmente
                </li>
              </ul>
              <div className="flex items-center text-primary font-medium group-hover:gap-2 transition-all">
                Registrar TV
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </Card>
          </div>

          {/* Quick start guide */}
          <Card className="glass-card p-6">
            <h4 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              Inicio rápido
            </h4>
            <ol className="space-y-3">
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center">1</span>
                <p className="text-sm text-white/80">
                  {currentServer ? (
                    <>Asegúrate de que el servidor SyncCast esté corriendo en: <strong className="text-white">{currentServer}</strong></>
                  ) : (
                    <>Configura la URL del servidor SyncCast en el botón <strong className="text-white">Servidor</strong> arriba</>
                  )}
                </p>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center">2</span>
                <p className="text-sm text-white/80">
                  Abre esta app en cada televisor (desde el navegador del TV) y selecciona <strong className="text-white">Soy un Televisor</strong>
                </p>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center">3</span>
                <p className="text-sm text-white/80">
                  En tu teléfono, selecciona <strong className="text-white">Soy un Teléfono</strong> para abrir el controlador
                </p>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center">4</span>
                <p className="text-sm text-white/80">
                  Sube tus videos o música y presiona reproducir para sincronizar todos los TVs
                </p>
              </li>
            </ol>
          </Card>

          {/* Install hint */}
          <div className="mt-6 text-center space-y-3">
            <a
              href="/download"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-primary to-purple-600 text-white text-sm font-medium hover:opacity-90 transition glow"
            >
              <Download className="w-4 h-4" />
              Descargar APK para Android
            </a>
            <p className="text-xs text-white/40">
              <strong className="text-white/60">Instalar como PWA:</strong> En Chrome/Edge, presiona el menú (⋮) y selecciona &quot;Instalar aplicación&quot;
            </p>
          </div>
        </div>
      </main>

      <footer className="px-6 py-4 border-t border-white/5">
        <p className="text-xs text-white/40 text-center">
          SyncCast · Funciona en red WiFi local · Compatible con Android, iOS, y cualquier dispositivo con navegador moderno
        </p>
      </footer>
    </div>
  )
}

// ============================================================
// TV Setup screen
// ============================================================
function TvSetupScreen({
  tvName,
  setTvName,
  onStart,
  onBack,
}: {
  tvName: string
  setTvName: (v: string) => void
  onStart: () => void
  onBack: () => void
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute top-1/3 left-1/3 w-96 h-96 rounded-full bg-primary/20 blur-[120px]" />
      </div>
      <Card className="glass-card p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center mx-auto mb-4 glow">
            <Tv className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Registrar Televisor</h2>
          <p className="text-sm text-white/60">
            Asigna un nombre a este TV para identificarlo fácilmente desde el teléfono controlador
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <Label htmlFor="tv-name" className="text-sm text-white/80 mb-2 block">
              Nombre del TV
            </Label>
            <Input
              id="tv-name"
              value={tvName}
              onChange={(e) => setTvName(e.target.value)}
              placeholder="Ej: TV Sala, TV Cocina, TV Habitación..."
              className="glass border-white/10"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') onStart()
              }}
            />
            <p className="text-xs text-white/40 mt-2">
              Si lo dejas vacío, se generará un nombre automático
            </p>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={onBack} className="glass border-white/10">
              Cancelar
            </Button>
            <Button onClick={onStart} className="flex-1 bg-primary glow">
              Conectar TV
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>

        <div className="mt-6 p-3 rounded-lg bg-primary/5 border border-primary/20">
          <p className="text-xs text-white/70">
            <strong className="text-primary">Tip:</strong> Asegúrate de que este TV esté en la misma red WiFi que tu teléfono para una sincronización óptima.
          </p>
        </div>
      </Card>
    </div>
  )
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center px-3 py-1 rounded-full glass border border-white/10 text-xs text-white/80">
      {children}
    </span>
  )
}
