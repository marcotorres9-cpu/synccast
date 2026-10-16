import { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.synccast.app',
  appName: 'SyncCast',
  // No webDir - we load from server URL directly
  server: {
    url: 'https://synccast-repo.vercel.app',
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
  },
}

export default config
