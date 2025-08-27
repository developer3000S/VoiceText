import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.voicetext.app',
  appName: 'Голосовой Текст',
  webDir: 'out',
  server: {
    androidScheme: 'https',
  },
  android: {
    permissions: [
      {
        alias: 'microphone',
        name: 'android.permission.RECORD_AUDIO',
      },
      {
        alias: 'storage',
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
