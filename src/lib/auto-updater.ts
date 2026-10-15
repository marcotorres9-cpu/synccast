/**
 * Version checker for SyncCast
 * Checks the deployed web version and GitHub releases
 */

const GITHUB_RELEASES_URL = 'https://api.github.com/repos/marcotorres9-cpu/synccast/releases/latest'
const WEB_VERSION_URL = 'https://synccast-repo.vercel.app/api/version'

// This version is set at BUILD TIME of the APK
// It's injected via env var NEXT_PUBLIC_APP_VERSION
const CURRENT_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || '1.2.3'

export interface UpdateInfo {
  version: string
  downloadUrl: string
  size: number
  releaseNotes: string
  publishedAt: string
  source: 'github' | 'web'
}

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  try {
    // First check the web version (faster, more reliable)
    const webResponse = await fetch(WEB_VERSION_URL, { cache: 'no-store' })
    if (webResponse.ok) {
      const webData = await webResponse.json()
      const webVersion = webData.version

      if (compareVersions(webVersion, CURRENT_VERSION) > 0) {
        // Web has a newer version, find the download URL from GitHub
        const ghResponse = await fetch(GITHUB_RELEASES_URL)
        if (ghResponse.ok) {
          const release = await ghResponse.json()
          const apkAsset = release.assets?.find((a: any) => a.name.endsWith('.apk'))
          if (apkAsset) {
            return {
              version: webVersion,
              downloadUrl: apkAsset.browser_download_url,
              size: apkAsset.size,
              releaseNotes: webData.changelog || release.body || '',
              publishedAt: webData.deployedAt || release.published_at || '',
              source: 'web',
            }
          }
        }
      }
    }

    // Fallback: check GitHub releases directly
    const response = await fetch(GITHUB_RELEASES_URL)
    if (!response.ok) return null
    const release = await response.json()

    const apkAsset = release.assets?.find((a: any) => a.name.endsWith('.apk'))
    if (!apkAsset) return null

    const latestVersion = release.tag_name?.replace(/^v/, '') || '0.0.0'

    if (compareVersions(latestVersion, CURRENT_VERSION) <= 0) {
      return null
    }

    return {
      version: latestVersion,
      downloadUrl: apkAsset.browser_download_url,
      size: apkAsset.size,
      releaseNotes: release.body || '',
      publishedAt: release.published_at || '',
      source: 'github',
    }
  } catch (e) {
    console.error('Update check failed:', e)
    return null
  }
}

function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number)
  const parts2 = v2.split('.').map(Number)
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const a = parts1[i] || 0
    const b = parts2[i] || 0
    if (a > b) return 1
    if (a < b) return -1
  }
  return 0
}

const UPDATE_KEY = 'synccast-pending-update'
const DISMISSED_KEY = 'synccast-update-dismissed'

export function getPendingUpdate(): UpdateInfo | null {
  if (typeof window === 'undefined') return null
  try {
    const stored = localStorage.getItem(UPDATE_KEY)
    if (stored) return JSON.parse(stored)
  } catch {}
  return null
}

export function setPendingUpdate(update: UpdateInfo | null): void {
  if (typeof window === 'undefined') return
  try {
    if (update) {
      localStorage.setItem(UPDATE_KEY, JSON.stringify(update))
      localStorage.removeItem(DISMISSED_KEY)
    } else {
      localStorage.removeItem(UPDATE_KEY)
    }
  } catch {}
}

export function isUpdateDismissed(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return localStorage.getItem(DISMISSED_KEY) === 'true'
  } catch {}
  return false
}

export function dismissUpdate(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(DISMISSED_KEY, 'true')
  } catch {}
}

export function getCurrentVersion(): string {
  return CURRENT_VERSION
}
