# ФЛИП

Однопальцевая аркада: тап переворачивает гравитацию, герой бежит по коридору между
двумя стенами, шипы убивают, сферы дают очки. Рекорд хранится на устройстве.

- Движок: чистый Canvas 2D, без игровых фреймворков (~700 строк в `www/game.js`)
- Обёртка: Capacitor 8 → нативное Android-приложение, работает офлайн
- Та же сборка открывается в браузере как PWA (манифест + service worker)

## Структура

```
www/                  сама игра (index.html, styles.css, game.js, sw.js, иконки)
scripts/make-icons.js генератор всех иконок (PNG кодом, без зависимостей)
scripts/serve.js      локальный сервер для теста в браузере
android/              нативный проект Capacitor
.github/workflows/    сборка подписанного APK + AAB
```

## Играть в браузере

```bash
npm install
npm run serve      # → http://localhost:5173
```

## Собрать APK

Где угодно, где есть Android SDK и JDK 21:

```bash
npm ci
npx cap sync android
cd android && ./gradlew assembleRelease
# android/app/build/outputs/apk/release/app-release.apk
```

Либо просто запушьте в GitHub и запустите workflow **Android build** (Actions → Run
workflow). Через ~5 минут в Releases появится `flip.apk` и `flip.aab`.

## Установка на телефон

1. Откройте страницу релиза на телефоне.
2. Скачайте `flip.apk`.
3. Разрешите установку из этого источника, если Android попросит.
4. «Установить».

## Подпись

`android/keystore.properties` ссылается на `android/keystore/flip-release.p12` —
**публичный тестовый ключ** (пароль `flipflip`). Он нужен, чтобы сборки из CI
обновляли друг друга, а не требовали переустановки.

Перед публикацией в Google Play или RuStore на реальную аудиторию:

```bash
keytool -genkeypair -v -keystore my-release.jks -alias upload \
  -keyalg RSA -keysize 2048 -validity 10000
```

и подставьте свой файл и пароли в `keystore.properties` (файл не коммитьте).
Для Play используйте Play App Signing — тогда публичный ключ останется только
upload-ключом.

## Публикация

- **Без магазина:** APK из GitHub Releases — самый быстрый путь.
- **RuStore:** бесплатная регистрация, нужен подписанный APK/AAB, targetSdk ≥ 28 (здесь 36).
- **Samsung Galaxy Store / Amazon Appstore:** бесплатно, принимают APK.
- **Google Play:** $25, верификация личности, для личных аккаунтов — 12 тестеров на 14 дней.

## Управление

- Тап / клик / пробел — переворот гравитации
- Кнопка динамика в правом верхнем углу — звук
