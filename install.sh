# Теперь, чтобы создать APK, вам нужно будет выполнить следующие шаги уже на вашем компьютере:

## Установите зависимости:
npm install

## Соберите веб-приложение:
npm run build:mobile

## Добавьте платформу Android:
npx cap add android

## Синхронизируйте проект:
npm run capacitor:sync

## Откройте в Android Studio:
npm run capacitor:open

## После этого откроется Android Studio, где вы сможете собрать APK-файл через меню Build -> Build Bundle(s) / APK(s) -> Build APK(s).