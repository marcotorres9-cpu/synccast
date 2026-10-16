import { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.synccast.app',
  appName: 'SyncCast',
  // NO webDir needed - we load from server URL
  server: {
    // Always load from the live Vercel URL
    // This means web updates are INSTANT - no need to rebuild APK
    url: 'https://synccast-repo.vercel.app',
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#0d0820',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
    },
  },
}

export default config
