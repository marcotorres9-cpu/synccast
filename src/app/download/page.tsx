'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Download, Smartphone, Tv, Cast, Zap, Wifi, Volume2, Monitor,
  CheckCircle2, ArrowRight, Github, ExternalLink, Star, Shield,
  Music, Video, Play, Clock, Cpu, Globe, ChevronDown, ChevronRight,
  AlertCircle, Package, RefreshCw, Cloud, Video, Tv
} from 'lucide-react'

export default function DownloadPage() {
  const [apkSize, setApkSize] = useState<string>('5.1 MB')
  const [version] = useState('2.1.0')
  const [releaseDate] = useState('15 Octubre 2026')
  const [downloading, setDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [activeFaq, setActiveFaq] = useState<number | null>(0)

  useEffect(() => {
    // Fetch APK size from HEAD request
    fetch('https://github.com/marcotorres9-cpu/synccast/releases/download/v2.1.0/SyncCast-v2.1.0.apk', { method: 'HEAD' })
      .then((res) => {
        const size = parseInt(res.headers.get('content-length') || '0', 10)
        if (size > 0) {
          const mb = (size / (1024 * 1024)).toFixed(1)
          setApkSize(`${mb} MB`)
        }
      })
      .catch(() => {})
  }, [])

  const handleDownload = async () => {
    setDownloading(true)
    setDownloadProgress(0)
    try {
      const res = await fetch('https://github.com/marcotorres9-cpu/synccast/releases/download/v2.1.0/SyncCast-v2.1.0.apk')
      const contentLength = res.headers.get('content-length')
      const total = contentLength ? parseInt(contentLength, 10) : 0
      const reader = res.body?.getReader()
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
      a.download = 'SyncCast.apk'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) {
      // Fallback: direct link
      window.location.href = 'https://github.com/marcotorres9-cpu/synccast/releases/download/v2.1.0/SyncCast-v2.1.0.apk'
    } finally {
      setTimeout(() => {
        setDownloading(false)
        setDownloadProgress(0)
      }, 1500)
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Animated background */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-32 w-[500px] h-[500px] rounded-full bg-primary/20 blur-[150px] animate-pulse" />
        <div className="absolute bottom-1/4 -right-32 w-[500px] h-[500px] rounded-full bg-purple-600/15 blur-[150px] animate-pulse" style={{ animationDelay: '2s' }} />
        <div className="absolute top-1/2 left-1/2 w-[400px] h-[400px] rounded-full bg-pink-600/10 blur-[120px] animate-pulse" style={{ animationDelay: '4s' }} />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-50 glass border-b border-white/5">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center glow">
              <Cast className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">SyncCast</h1>
              <p className="text-xs text-white/60 hidden sm:block">Multi-TV Video & Music Sync</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="glass border-green-500/30 text-green-400">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse-live mr-1.5" />
              v{version}
            </Badge>
            <a
              href="/"
              className="hidden sm:inline-flex items-center gap-1.5 text-sm text-white/70 hover:text-white px-3 py-1.5 rounded-md hover:bg-white/5 transition"
            >
              Abrir App
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-16 pb-20 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto text-center">
          <Badge variant="outline" className="glass border-primary/30 text-primary mb-6 inline-flex">
            <SparklesIcon /> App para Android · Disponible para descargar
          </Badge>

          <h1 className="text-4xl sm:text-6xl md:text-7xl font-bold text-white mb-6 leading-[1.05] tracking-tight">
            Sincroniza videos y música
            <br />
            <span className="bg-gradient-to-r from-primary via-purple-400 to-pink-400 bg-clip-text text-transparent">
              en múltiples TVs
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-white/60 max-w-2xl mx-auto mb-10 leading-relaxed">
            Reproduce el mismo video o playlist de música simultáneamente en todos tus televisores.
            Controla todo desde tu teléfono con sincronización precisa tipo Chromecast.
          </p>

          {/* Download CTA */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-6">
            <Button
              onClick={handleDownload}
              disabled={downloading}
              size="lg"
              className="group h-14 px-8 text-base sm:text-lg bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90 glow-strong"
            >
              {downloading ? (
                <>
                  <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                  {downloadProgress > 0 ? `Descargando ${downloadProgress}%` : 'Iniciando...'}
                </>
              ) : (
                <>
                  <Download className="w-5 h-5 mr-2 group-hover:translate-y-0.5 transition-transform" />
                  Descargar APK
                </>
              )}
            </Button>
            <a
              href="/"
              className="inline-flex items-center gap-2 h-14 px-6 rounded-md glass border border-white/10 text-white hover:bg-white/5 transition text-base"
            >
              <Play className="w-4 h-4" />
              Probar en navegador
            </a>
          </div>

          {/* Meta info */}
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-white/50">
            <span className="flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5" />
              {apkSize}
            </span>
            <span className="flex items-center gap-1.5">
              <Smartphone className="w-3.5 h-3.5" />
              Android 6.0+
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              {releaseDate}
            </span>
            <span className="flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-green-400" />
              Libre de malware
            </span>
          </div>

          {/* Trust badges */}
          <div className="mt-12 flex flex-wrap items-center justify-center gap-2 text-xs">
            <span className="text-white/40 mr-2">Compatible con:</span>
            <Badge variant="outline" className="glass border-white/10 text-white/70">Android TV</Badge>
            <Badge variant="outline" className="glass border-white/10 text-white/70">Smart TV</Badge>
            <Badge variant="outline" className="glass border-white/10 text-white/70">Fire TV Stick</Badge>
            <Badge variant="outline" className="glass border-white/10 text-white/70">Chromecast con Google TV</Badge>
            <Badge variant="outline" className="glass border-white/10 text-white/70">Tabletas Android</Badge>
          </div>
        </div>
      </section>

      {/* Stats / Social proof */}
      <section className="px-4 sm:px-6 py-8 border-y border-white/5 glass">
        <div className="max-w-5xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
          <Stat icon={<Tv className="w-5 h-5" />} value="10+" label="TVs sincronizados" />
          <Stat icon={<Zap className="w-5 h-5" />} value="500ms" label="Precisión sync" />
          <Stat icon={<Wifi className="w-5 h-5" />} value="WiFi" label="Red local" />
          <Stat icon={<Star className="w-5 h-5" />} value="4.3MB" label="Tamaño ligero" />
        </div>
      </section>

      {/* What's New - Release Notes */}
      <section className="px-4 sm:px-6 py-16">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <Badge variant="outline" className="glass border-primary/30 text-primary mb-3">
              <SparklesIcon /> Novedades de la versión {version}
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-3">
              Qué hay de nuevo
            </h2>
            <p className="text-white/60">Última actualización: {releaseDate}</p>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <ReleaseNote
              icon={<Cloud className="w-5 h-5" />}
              title="Subida directa a Cloudinary"
              desc="Sube videos de cualquier tamaño (100MB+) directamente a Cloudinary con barra de progreso en tiempo real. Sin límites de Vercel."
              tag="NUEVO"
            />
            <ReleaseNote
              icon={<RefreshCw className="w-5 h-5" />}
              title="Actualización automática"
              desc="El APK carga desde Vercel en vivo. Cuando actualizamos la web, tu app se actualiza sola. ¡No más descargas manuales!"
              tag="NUEVO"
            />
            <ReleaseNote
              icon={<Tv className="w-5 h-5" />}
              title="Compatible con Smart TVs"
              desc="Funciona en Android TV, Google TV, Fire TV Stick y Smart TVs con navegador (ZITRO, Samsung, LG)."
              tag="MEJORADO"
            />
            <ReleaseNote
              icon={<Video className="w-5 h-5" />}
              title="Reproducción de videos MP4"
              desc="Reproduce videos MP4 en 4K sincronizadamente en hasta 10 TVs. Control total desde tu celular."
              tag="MEJORADO"
            />
          </div>

          <div className="mt-6 p-4 rounded-lg glass border border-amber-500/20 bg-amber-500/5">
            <div className="flex gap-3">
              <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-white/80">
                <strong className="text-amber-400">Si tienes una versión anterior:</strong> Desinstálala primero
                (Ajustes → Apps → SyncCast → Desinstalar) y luego instala la nueva versión. Tus TVs y configuración
                se mantienen porque se guardan en el navegador del TV, no en el APK.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="px-4 sm:px-6 py-20">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <Badge variant="outline" className="glass border-primary/30 text-primary mb-3">Características</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-3">Todo lo que necesitas</h2>
            <p className="text-white/60 max-w-2xl mx-auto">
              Una sola app para controlar todos tus televisores con sincronización profesional
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Feature
              icon={<Cast className="w-5 h-5" />}
              title="Sincronización precisa"
              desc="Algoritmo NTP-like con buffer de 500ms para que todos los TVs reproduzcan al mismo tiempo sin desfase perceptible."
            />
            <Feature
              icon={<Video className="w-5 h-5" />}
              title="Reproducción de videos"
              desc="Sube archivos MP4, WebM, MKV, MOV desde tu teléfono y reprodúcelos simultáneamente en todos los TVs."
            />
            <Feature
              icon={<Music className="w-5 h-5" />}
              title="Playlists de música"
              desc="Crea listas de reproducción con MP3, WAV, OGG, M4A, FLAC y reprodúcelas sincronizadas en múltiples TVs."
            />
            <Feature
              icon={<Volume2 className="w-5 h-5" />}
              title="Volumen individual"
              desc="Controla el volumen de cada TV por separado o ajusta el volumen maestro para todos a la vez."
            />
            <Feature
              icon={<Monitor className="w-5 h-5" />}
              title="Hasta 10 TVs"
              desc="Conecta hasta 10 televisores simultáneamente en la misma red WiFi local sin necesidad de internet."
            />
            <Feature
              icon={<Smartphone className="w-5 h-5" />}
              title="Control desde el móvil"
              desc="Sube archivos, crea playlists, controla reproducción, pausa, salta y ajusta volumen desde tu teléfono."
            />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="px-4 sm:px-6 py-20 border-y border-white/5 glass">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <Badge variant="outline" className="glass border-primary/30 text-primary mb-3">Cómo funciona</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-3">Empieza en 3 pasos</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <Step
              number={1}
              icon={<Download className="w-5 h-5" />}
              title="Descarga e instala"
              desc="Descarga el APK en tu teléfono Android. Habilita 'Instalar apps desconocidas' en ajustes si es necesario, luego abre el archivo."
            />
            <Step
              number={2}
              icon={<Tv className="w-5 h-5" />}
              title="Registra tus TVs"
              desc="En cada televisor, abre la URL del servidor SyncCast desde el navegador y selecciona 'Soy un Televisor'. Asígnale un nombre."
            />
            <Step
              number={3}
              icon={<Cast className="w-5 h-5" />}
              title="Reproduce y sincroniza"
              desc="Desde la app en tu teléfono, sube videos o música y presiona reproducir. Todos los TVs comenzarán al mismo tiempo."
            />
          </div>
        </div>
      </section>

      {/* Installation guide */}
      <section className="px-4 sm:px-6 py-20">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <Badge variant="outline" className="glass border-primary/30 text-primary mb-3">Instalación</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-3">Guía de instalación</h2>
            <p className="text-white/60">Pasos detallados para instalar y empezar a usar SyncCast</p>
          </div>

          <Card className="glass-card p-6 sm:p-8">
            <div className="space-y-6">
              <InstallStep
                num={1}
                title="Habilitar instalación de apps desconocidas"
              >
                En tu teléfono Android, ve a <strong className="text-white">Ajustes → Seguridad</strong> (o
                <strong className="text-white"> Privacidad </strong> en algunos modelos) y activa
                <strong className="text-white"> "Instalar aplicaciones de fuentes desconocidas"</strong> para tu navegador (Chrome, Edge, etc.).
              </InstallStep>

              <InstallStep
                num={2}
                title="Descargar el APK"
              >
                Pulsa el botón <strong className="text-primary">"Descargar APK"</strong> en la parte superior de esta página.
                El archivo pesa aproximadamente {apkSize} y se descargará en tu carpeta de descargas.
              </InstallStep>

              <InstallStep
                num={3}
                title="Instalar el APK"
              >
                Abre el archivo <code className="bg-white/5 px-1.5 py-0.5 rounded text-primary">SyncCast.apk</code> descargado.
                Android te pedirá permiso para instalar. Confirma y espera a que se complete la instalación.
              </InstallStep>

              <InstallStep
                num={4}
                title="Primera apertura"
              >
                Abre SyncCast desde tu launcher. En el primer arranque se te pedirá la
                <strong className="text-white"> URL del servidor SyncCast</strong>. Ingresa la URL del servidor
                que estés ejecutando en tu PC, Raspberry Pi, o servicio en la nube.
              </InstallStep>

              <InstallStep
                num={5}
                title="Registrar TVs"
              >
                En cada televisor (con navegador web), abre la misma URL del servidor y selecciona
                <strong className="text-white"> "Soy un Televisor"</strong>. Ponle un nombre identificable
                (Ej: "TV Sala", "TV Cocina").
              </InstallStep>

              <InstallStep
                num={6}
                title="¡Listo! Empieza a usarlo"
              >
                Desde la app en tu teléfono, sube tus videos o música, selecciónalos y presiona
                <strong className="text-primary"> "Reproducir en N TV(s)"</strong>. ¡Todos los TVs empezarán al mismo tiempo!
              </InstallStep>
            </div>
          </Card>
        </div>
      </section>

      {/* FAQ */}
      <section className="px-4 sm:px-6 py-20 border-y border-white/5 glass">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <Badge variant="outline" className="glass border-primary/30 text-primary mb-3">Preguntas frecuentes</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-3">¿Tienes dudas?</h2>
          </div>

          <div className="space-y-3">
            <Faq
              q="¿Necesito internet para usar la app?"
              a="No. SyncCast funciona en tu red WiFi local. Solo necesitas que tu teléfono y tus TVs estén conectados a la misma red WiFi. El servidor SyncCast debe estar ejecutándose en algún dispositivo de la red (PC, Raspberry Pi, etc.)."
            />
            <Faq
              q="¿Puedo desplegar el servidor en la nube?"
              a="Sí. Puedes desplegar el servidor SyncCast en Vercel, Railway, Render o cualquier servicio que soporte Next.js. En ese caso, sí necesitarás internet para que la app se conecte al servidor. Incluimos instrucciones de despliegue en el repositorio."
            />
            <Faq
              q="¿Qué formatos de video y audio soporta?"
              a="Videos: MP4, WebM, MKV, MOV (cualquier formato que soporte el navegador del TV). Música: MP3, WAV, OGG, M4A, FLAC. Los archivos se suben desde tu teléfono al servidor y se transmiten vía HTTP a los TVs."
            />
            <Faq
              q="¿Cuántos TVs puedo conectar?"
              a="Hasta 10 TVs simultáneamente en la misma red. La sincronización se mantiene precisa gracias al algoritmo NTP-like que ajusta los relojes de cada dispositivo."
            />
            <Faq
              q="¿Es segura la app?"
              a="Sí. El APK no incluye código malicioso. Toda la comunicación se hace vía WebSocket en tu red local. Los archivos multimedia se transmiten vía HTTP local. No se envían datos a servidores externos."
            />
            <Faq
              q="¿Funciona con iPhone/iOS?"
              a="La app controladora (APK) es solo para Android. Sin embargo, puedes usar la versión web desde iPhone en el navegador. Los TVs también usan la versión web en sus navegadores, no requieren APK."
            />
            <Faq
              q="¿Qué pasa si mi teléfono o TV se desconecta?"
              a="La app se reconecta automáticamente cuando vuelve la conexión. Si un TV se desconecta durante la reproducción, simplemente se reincorporará cuando se reconecte y se sincronizará con el resto."
            />
            <Faq
              q="¿Cómo actualizo la app?"
              a="Visita esta misma página para descargar la última versión del APK. Cuando lances una nueva versión, simplemente desinstala la anterior e instala la nueva (o instala encima si Android lo permite)."
            />
          </div>
        </div>
      </section>

      {/* Technical specs */}
      <section className="px-4 sm:px-6 py-20">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <Badge variant="outline" className="glass border-primary/30 text-primary mb-3">Especificaciones</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-3">Detalles técnicos</h2>
          </div>

          <Card className="glass-card overflow-hidden">
            <div className="grid sm:grid-cols-2">
              <SpecItem icon={<Package className="w-4 h-4" />} label="Versión" value={`v${version}`} />
              <SpecItem icon={<Smartphone className="w-4 h-4" />} label="Android mínimo" value="6.0 (API 23)" />
              <SpecItem icon={<Monitor className="w-4 h-4" />} label="Target Android" value="14 (API 34)" />
              <SpecItem icon={<Package className="w-4 h-4" />} label="Tamaño" value={apkSize} />
              <SpecItem icon={<Globe className="w-4 h-4" />} label="Application ID" value="com.synccast.app" />
              <SpecItem icon={<Cpu className="w-4 h-4" />} label="Arquitectura" value="Universal (ARM, x86)" />
              <SpecItem icon={<Shield className="w-4 h-4" />} label="Permisos" value="INTERNET, ACCESS_NETWORK_STATE" />
              <SpecItem icon={<Wifi className="w-4 h-4" />} label="Conectividad" value="WiFi local / Internet" />
            </div>
          </Card>

          <div className="mt-6 p-4 rounded-lg glass border border-amber-500/20 bg-amber-500/5 flex gap-3">
            <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-white/80">
              <strong className="text-amber-400">Nota importante:</strong> Esta app requiere un servidor SyncCast ejecutándose
              en tu PC, Raspberry Pi o servicio en la nube. Sin un servidor, la app no podrá controlar los TVs.
              Consulta la documentación del repositorio para desplegar tu propio servidor.
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="px-4 sm:px-6 py-20">
        <Card className="glass-card p-8 sm:p-12 max-w-4xl mx-auto text-center relative overflow-hidden">
          <div className="absolute inset-0 -z-10 bg-gradient-to-br from-primary/10 via-purple-600/5 to-transparent" />
          <div className="absolute top-0 right-0 w-64 h-64 -z-10 bg-primary/20 blur-[100px] rounded-full" />

          <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center glow-strong">
            <Cast className="w-8 h-8 text-white" />
          </div>

          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-3">
            ¿Listo para empezar?
          </h2>
          <p className="text-white/60 mb-8 max-w-xl mx-auto">
            Descarga SyncCast ahora y transforma tus televisores en un sistema de reproducción sincronizada profesional.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button
              onClick={handleDownload}
              disabled={downloading}
              size="lg"
              className="group h-14 px-8 text-base sm:text-lg bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90 glow-strong"
            >
              {downloading ? (
                <>
                  <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                  {downloadProgress > 0 ? `Descargando ${downloadProgress}%` : 'Iniciando...'}
                </>
              ) : (
                <>
                  <Download className="w-5 h-5 mr-2 group-hover:translate-y-0.5 transition-transform" />
                  Descargar SyncCast v{version}
                </>
              )}
            </Button>
          </div>

          <p className="mt-6 text-xs text-white/40">
            Al descargar aceptas usar la app bajo tu responsabilidad.
            SyncCast es software libre y no recopila datos personales.
          </p>
        </Card>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 glass mt-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center">
                <Cast className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">SyncCast</p>
                <p className="text-xs text-white/50">Multi-TV Video & Music Sync</p>
              </div>
            </div>
            <div className="flex items-center gap-4 text-sm text-white/60">
              <a href="/" className="hover:text-white transition flex items-center gap-1">
                Abrir app <ExternalLink className="w-3 h-3" />
              </a>
              <span className="text-white/30">·</span>
              <span>v{version}</span>
              <span className="text-white/30">·</span>
              <span>{releaseDate}</span>
            </div>
          </div>
          <div className="mt-6 pt-6 border-t border-white/5 text-center text-xs text-white/40">
            <p>Hecho con ❤️ usando Next.js, Capacitor y Socket.io</p>
          </div>
        </div>
      </footer>
    </div>
  )
}

function SparklesIcon() {
  return (
    <svg className="w-3 h-3 mr-1.5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7.4-6.3-4.6-6.3 4.6L7.9 14 2 9.4h7.6L12 2z" />
    </svg>
  )
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div>
      <div className="flex items-center justify-center mb-1 text-primary">{icon}</div>
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-xs text-white/50">{label}</p>
    </div>
  )
}

function Feature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <Card className="glass-card p-6 hover:border-primary/30 transition-all group">
      <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-4 group-hover:scale-110 transition-transform">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
      <p className="text-sm text-white/60 leading-relaxed">{desc}</p>
    </Card>
  )
}

function Step({ number, icon, title, desc }: { number: number; icon: React.ReactNode; title: string; desc: string }) {
  return (
    <Card className="glass-card p-6 relative">
      <div className="absolute -top-3 -left-3 w-10 h-10 rounded-full bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center text-white font-bold text-sm glow">
        {number}
      </div>
      <div className="mt-4 mb-3 text-primary">{icon}</div>
      <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
      <p className="text-sm text-white/60 leading-relaxed">{desc}</p>
    </Card>
  )
}

function InstallStep({ num, title, children }: { num: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0">
        <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center text-primary font-bold text-sm">
          {num}
        </div>
      </div>
      <div className="flex-1 pb-2">
        <h3 className="text-base font-semibold text-white mb-1">{title}</h3>
        <p className="text-sm text-white/70 leading-relaxed">{children}</p>
      </div>
    </div>
  )
}

function Faq({ q, a }: { q: string; a: string }) {
  const [activeFaq, setActiveFaq] = useState(false)
  return (
    <Card className="glass-card overflow-hidden">
      <button
        onClick={() => setActiveFaq(!activeFaq)}
        className="w-full p-4 flex items-center justify-between text-left hover:bg-white/5 transition"
      >
        <span className="font-medium text-white text-sm sm:text-base pr-4">{q}</span>
        <ChevronDown className={`w-4 h-4 text-white/40 flex-shrink-0 transition-transform ${activeFaq ? 'rotate-180' : ''}`} />
      </button>
      {activeFaq && (
        <div className="px-4 pb-4 text-sm text-white/60 leading-relaxed border-t border-white/5 pt-3">
          {a}
        </div>
      )}
    </Card>
  )
}

function ReleaseNote({ icon, title, desc, tag }: { icon: React.ReactNode; title: string; desc: string; tag: string }) {
  const tagColor = tag === 'NUEVO' ? 'bg-green-500/20 text-green-400 border-green-500/30' : tag === 'MEJORADO' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' : 'bg-purple-500/20 text-purple-400 border-purple-500/30'
  return (
    <Card className="glass-card p-5 hover:border-primary/30 transition-all">
      <div className="flex items-start justify-between mb-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
          {icon}
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full border ${tagColor}`}>{tag}</span>
      </div>
      <h3 className="text-base font-semibold text-white mb-2">{title}</h3>
      <p className="text-sm text-white/60 leading-relaxed">{desc}</p>
    </Card>
  )
}

function SpecItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="p-4 border-b border-r border-white/5 last:border-b-0 sm:[&:nth-child(odd)]:border-r sm:[&:nth-child(even)]:border-r-0">
      <div className="flex items-center gap-2 text-white/40 text-xs mb-1.5">
        {icon}
        <span>{label}</span>
      </div>
      <p className="text-sm font-medium text-white font-mono">{value}</p>
    </div>
  )
}
