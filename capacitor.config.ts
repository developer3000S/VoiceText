import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.voicetext.app',
  appName: 'Голосовой Текст',
  webDir: 'out',
  server: {
    // androidScheme: 'https', // Раскомментируйте, если возникнут проблемы с HTTP
  },
  android: {
    permissions: [
      {
        alias: 'microphone',
        name: 'android.permission.RECORD_AUDIO',
      },
    ],
  },
};

export default config;
