import { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.synccast.app',
  appName: 'SyncCast',
  webDir: 'out',
  server: {
    androidScheme: 'https',
    // Allow cleartext for HTTP uploads on local network
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
    // Required for accessing local network IPs
    captureInput: true,
    webContentsDebuggingEnabled: true,
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
