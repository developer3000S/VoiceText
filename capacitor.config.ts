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
        alias: 'microphone',
        name: 'android.permission.RECORD_AUDIO',
      },
      {
        alias: 'audio_setting',
        name: 'android.permission.MODIFY_AUDIO_SETTINGS'
      },
      {
        alias: 'storage_read',
        name: 'android.permission.READ_EXTERNAL_STORAGE',
      },
      {
        alias: 'storage_write',
        name: 'android.permission.WRITE_EXTERNAL_STORAGE',
      },
      {
        alias: 'internet',
        name: 'android.permission.INTERNET',
      }
    ],
  },
};

export default config;
