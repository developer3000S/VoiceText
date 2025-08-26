import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.voicetext.app',
  appName: 'Голосовой Текст',
  webDir: 'out',
  plugins: {
    VoiceRecorder: {
      microphonePermissionErrorMessage: "Для записи голоса приложению нужен доступ к микрофону. Пожалуйста, предоставьте разрешение.",
    }
  }
};

export default config;
