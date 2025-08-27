import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.voicetext.app',
  appName: 'Голосовой Текст',
  webDir: 'out',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    Keyboard: {
      resize: 'ionic',
      resizeOnFullScreen: true,
    },
  },
  android: {
    allowMixedContent: true,
    buildOptions: {
      keystorePath: undefined,
      keystoreAlias: undefined,
    },
    permissions: [
        {
            alias: "storage",
            name: "android.permission.WRITE_EXTERNAL_STORAGE"
        },
        {
            alias: "microphone",
            name: "android.permission.RECORD_AUDIO"
        }
    ]
  },
};

export default config;
