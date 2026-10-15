/**
 * Server URL configuration for the SyncCast app.
 */

const STORAGE_KEY = 'synccast-server-url'

export function getServerUrl(): string {
  if (typeof window === 'undefined') return ''
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      return stored.replace(/\/+$/, '')
    }
  } catch {}
  // Default to production Vercel URL when nothing is configured
  // (used by the APK on first launch)
  return 'https://synccast-repo.vercel.app'
}

export function setServerUrl(url: string): void {
  if (typeof window === 'undefined') return
  const cleaned = (url || '').trim().replace(/\/+$/, '')
  if (cleaned) {
    localStorage.setItem(STORAGE_KEY, cleaned)
  } else {
    localStorage.removeItem(STORAGE_KEY)
  }
}

export function clearServerUrl(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(STORAGE_KEY)
}

/**
 * Build the WebSocket URL.
 * Priority:
 * 1. NEXT_PUBLIC_SOCKET_URL env var (production)
 * 2. User-configured server URL (APK)
 * 3. Default: same origin with Caddy gateway routing (local dev only)
 */
export function getSocketUrl(): string {
  // 1. Environment variable (set in Vercel for production)
  const envSocketUrl = process.env.NEXT_PUBLIC_SOCKET_URL
  if (envSocketUrl) {
    return envSocketUrl.replace(/\/+$/, '')
  }

  // 2. User-configured server URL (APK mode)
  const serverUrl = getServerUrl()
  if (serverUrl) {
    // The user's URL is Vercel. The WebSocket is on Render (separate service).
    // For production deployments, the Render URL is configured via env var.
    // For local dev (with Caddy gateway), use XTransformPort.
    if (serverUrl.includes('localhost') || serverUrl.includes('127.0.0.1')) {
      return `${serverUrl}/?XTransformPort=3003`
    }
    // For production: if env var is set, use it. Otherwise, fall back to Render URL.
    // We hardcode the Render URL as a fallback for APK without env var.
    return 'https://synccast-sync.onrender.com'
  }

  // 3. Local mode
  return '/?XTransformPort=3003'
}

/**
 * Build an API URL.
 */
export function apiUrl(path: string): string {
  const serverUrl = getServerUrl()
  if (serverUrl) {
    const cleanPath = path.startsWith('/') ? path : `/${path}`
    return `${serverUrl}${cleanPath}`
  }
  return path
}

export const STORAGE_KEY_OBSERVER = STORAGE_KEY
