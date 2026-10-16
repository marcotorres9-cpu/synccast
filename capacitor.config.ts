import { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.synccast.app',
  appName: 'SyncCast',
  webDir: 'out',
  server: {
    androidScheme: 'https',
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
    // Capgo Updater config - updates web content without rebuilding APK
    Updater: {
      autoUpdate: true,
      resetWhenUpdate: true,
    },
  },
}

export default config
