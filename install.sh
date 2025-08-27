# Теперь, чтобы создать APK, вам нужно будет выполнить следующие шаги уже на вашем компьютере:

# Очистите кэш npm: 
npm cache clean --force

# Удалите папку node_modules и android 
rm -rf node_modules
rm -rf node_modules
rm -rf android

# Переустановите зависимости: 
rm package-lock.json
#npm install --legacy-peer-deps
npm install

## Установите зависимости:
npm install @capacitor/core@latest
npm install @capacitor/cli --save-dev
npm audit fix --force

## Соберите веб-приложение:
npm run build:mobile

## Добавьте платформу Android:
npx cap add android
cp -R ~/Documents/mybuild/VoiceText/VoiceText/docs/AndroidManifest.xml ~/Documents/mybuild/VoiceText/VoiceText/android/app/src/main/

## Синхронизируйте проект:
npm run capacitor:sync

## Откройте в Android Studio:
npm run capacitor:open

## После этого откроется Android Studio, где вы сможете собрать APK-файл через меню Build -> Build Bundle(s) / APK(s) -> Build APK(s).