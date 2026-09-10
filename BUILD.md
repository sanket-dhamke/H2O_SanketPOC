# Building the GateMate app

The backend deploys from `DEPLOY.md`. This file covers producing an installable
Android APK (and the iOS equivalent) from `app/`.

## Read this before you ship the AI-first release

This release adds **`react-native-svg`** (the donut charts on the home tab). It is
a *native* module, so it is compiled into the app binary rather than shipped in
the JavaScript bundle.

That means **an over-the-air update is not enough**. Anyone running an APK built
before this change must install a new APK. If you push only an OTA update, the
old binary will download JavaScript that imports a module it does not contain and
will crash on the home screen — the first thing an investor sees.

```
New native module added  ->  build a new APK, distribute the file
JS / styling only        ->  eas update is fine
```

The same applies to the microphone. `expo-audio` and the `RECORD_AUDIO`
permission were already in `app.json`, so voice works in any recent build, but
Expo Go cannot record — you need a real build to demo the mic.

## One-time setup

```bash
npm install -g eas-cli
eas login            # the Expo account that owns the project (currently "sanket2891")
cd app
npm install
```

The project is already linked: `app.json` carries the EAS `projectId`, the Android
package `com.h2o.society` and an `updates.url`, so no `eas init` is needed.

## Build an APK for the demo

`app/eas.json` defines a **preview** profile that produces a directly installable
`.apk` (the default `production` profile produces an `.aab` for the Play Store,
which you cannot sideload).

```bash
cd app
eas build --platform android --profile preview
```

The build runs on Expo's servers and takes roughly 10–20 minutes. It ends with a
download URL and a QR code; opening either on the phone installs the app. The
first build for a package also generates and stores an Android keystore — let EAS
manage it, and keep using the same Expo account so later builds stay upgradeable.

`autoIncrement` is on for this profile, so `versionCode` in `app.json` rises on
each build. Commit that change.

### Building locally instead

Only if you need to avoid the queue, and you have Android Studio plus a JDK:

```bash
cd app
npx expo prebuild --platform android   # generates android/ (gitignored)
cd android && ./gradlew assembleRelease
# app/android/app/build/outputs/apk/release/app-release.apk
```

`expo prebuild` overwrites the native folders from `app.json`, so treat `android/`
as build output, never as something to edit by hand.

## Point the app at the right backend

The API base URL comes from `app.json` → `expo.extra.apiUrl`, currently the hosted
backend. Change it *before* building; it is baked into the bundle.

```json
"extra": { "apiUrl": "https://your-api.onrender.com" }
```

There is also a runtime override on the login screen under **Advanced**, which is
useful for pointing a demo build at a laptop on the same Wi-Fi without rebuilding.

## Shipping JavaScript-only fixes after the build

For copy changes, styling and logic — anything that adds no native module — push
an update to the channel the build is subscribed to instead of rebuilding:

```bash
cd app
eas update --branch preview --message "Reworded the assistant prompts"
```

`runtimeVersion` follows `appVersion`, so an update only reaches builds with a
matching `version` in `app.json`. Bumping `version` deliberately cuts older
binaries off from new updates.

## iOS

```bash
eas build --platform ios --profile preview
```

Needs a paid Apple Developer account, and the device UDIDs registered
(`eas device:create`) for internal distribution. For an investor demo, Android
APKs are far less friction.

## Checklist before an investor build

- [ ] `npm test` passes in `server/`
- [ ] `npx expo export --platform web` completes without errors (fast bundling check)
- [ ] `app.json` → `extra.apiUrl` points at the live backend
- [ ] The backend has `AI_API_KEY` set and a **current** `AI_CHAT_MODEL` (see `server/.env.example`)
- [ ] Built with `--profile preview` so you get an `.apk`, not an `.aab`
- [ ] Installed on a real phone and the mic tested — Expo Go cannot record audio
