# GATEZO test APK

`GATEZO-preview-v1.0.0-build33.apk` — built from `cursor/admin-home-helplines-2dd7`
at `8b0fa9f`, pointed at the live API (`https://h2o-api-5sxc.onrender.com`).

Scan `gatezo_apk_qr.png`, or open this link on the phone:

```
https://raw.githubusercontent.com/sanket-dhamke/H2O_SanketPOC/refs/heads/cursor/gatezo-apk-2dd7/dist/GATEZO-preview-v1.0.0-build33.apk
```

## Before you install

This build uses the same debug signature as build 32 and a higher version, so it
can install over that test APK. Your society data stays on the server.

If Android says the app is not installed, the phone still has an older copy
signed by Expo's key. Uninstall that GATEZO first, then open the link again.
Android will ask you to allow installs from Chrome the first time.

Phones only: arm64. Not an emulator build.

## What is new in this build

Home → Needs your attention shows an approved clubhouse booking, with the slot
and the amount to pay. Opening it goes to My bookings.

A society notice is on that same list. Listen reads the notice in English.

Staff and helpers are one list. Tap a name for today, this week, or this month.
A photo on register, check-in, or check-out is optional.

## What still waits on the server

Email and WhatsApp for a new notice go out only after this server is deployed,
and only for people who have an email or a phone on file. The row on Home works
now.

A check-in or check-out photo is stored on the visit after the server deploy.
The check-in itself still saves. A registration photo saves now.
