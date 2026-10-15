/**
 * Auto-updater for SyncCast APK
 * Uses a simple version check + download mechanism.
 *
 * On app start:
 * 1. Check latest version from GitHub releases
 * 2. If newer version available, download in background
 * 3. Show notification when ready
 * 4. Apply on next app launch
 */

const GITHUB_RELEASES_URL = 'https://api.github.com/repos/marcotorres9-cpu/synccast/releases/latest'
const CURRENT_VERSION = '1.2.3' // Must match package.json / build.gradle

export interface UpdateInfo {
  version: string
  downloadUrl: string
  size: number
  releaseNotes: string
  publishedAt: string
}

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  try {
    const response = await fetch(GITHUB_RELEASES_URL)
    if (!response.ok) return null
    const release = await response.json()

    // Get the latest APK asset
    const apkAsset = release.assets?.find((a: any) => a.name.endsWith('.apk'))
    if (!apkAsset) return null

    const latestVersion = release.tag_name?.replace(/^v/, '') || '0.0.0'

    // Compare versions
    if (compareVersions(latestVersion, CURRENT_VERSION) <= 0) {
      return null // Already up to date
    }

    return {
      version: latestVersion,
      downloadUrl: apkAsset.browser_download_url,
      size: apkAsset.size,
      releaseNotes: release.body || '',
      publishedAt: release.published_at || '',
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

// Store update info in localStorage so the UI can access it
const UPDATE_KEY = 'synccast-pending-update'

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
    } else {
      localStorage.removeItem(UPDATE_KEY)
    }
  } catch {}
}

export function getCurrentVersion(): string {
  return CURRENT_VERSION
}
