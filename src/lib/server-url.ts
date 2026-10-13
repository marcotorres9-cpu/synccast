/**
 * Server URL configuration for the SyncCast app.
 *
 * - When running as a web app served by Next.js, this is empty (uses relative URLs)
 * - When running inside the Android APK, the user configures a server URL on first launch
 *   and it's stored in localStorage.
 */

const STORAGE_KEY = 'synccast-server-url'

export function getServerUrl(): string {
  if (typeof window === 'undefined') return ''
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      // Remove trailing slash
      return stored.replace(/\/+$/, '')
    }
  } catch {}
  return ''
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
 * Build the socket.io URL for the given (or configured) server.
 * If serverUrl is empty, uses the current origin (Next.js dev/prod server).
 * Otherwise, points to the configured remote server.
 *
 * The XTransformPort query parameter is still appended so the Caddy gateway
 * on the server can route to the sync-service on port 3003.
 */
export function getSocketUrl(): string {
  const serverUrl = getServerUrl()
  if (serverUrl) {
    // Connect to remote server directly (Caddy will route to sync-service)
    return `${serverUrl}/?XTransformPort=3003`
  }
  // Local mode: same origin, gateway handles routing
  return '/?XTransformPort=3003'
}

/**
 * Build an API URL. When a server URL is configured (APK mode), prefixes it.
 * Otherwise, returns the relative path (served by Next.js).
 */
export function apiUrl(path: string): string {
  const serverUrl = getServerUrl()
  if (serverUrl) {
    const cleanPath = path.startsWith('/') ? path : `/${path}`
    return `${serverUrl}${cleanPath}`
  }
  return path
}

// Stub for backward compatibility - not used internally; notifications go through
// the subscribe/notify functions in use-sync-socket.ts
export const STORAGE_KEY_OBSERVER = STORAGE_KEY
