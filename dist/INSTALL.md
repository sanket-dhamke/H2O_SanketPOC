# GATEZO test APK

`GATEZO-preview-v1.0.0-build32.apk` — built from `cursor/admin-home-helplines-2dd7`,
pointed at the live API (`https://h2o-api-5sxc.onrender.com`).

Scan `gatezo_apk_qr.png`, or open the link on the phone:

```
https://raw.githubusercontent.com/sanket-dhamke/H2O_SanketPOC/refs/heads/cursor/gatezo-apk-2dd7/dist/GATEZO-preview-v1.0.0-build32.apk
```

## Before you install

**Uninstall the GATEZO app you already have.** This build is signed with the
Android debug key, not the EAS key, so Android refuses to install it over an
EAS-signed copy ("App not installed"). Uninstalling clears that app's local
data — your society data lives on the server and is untouched.

Android will also ask you to allow installs from Chrome/Files the first time.

Phones only: arm64 (every Android phone sold in the last several years). Not an
emulator build.

## What is in it

Admin: full "Maintenance this month" title, `vs last month` showing a dash
instead of `undefined%`, scrolling Browse chips, committee-only announcement
copy, the admin clubhouse answer from Ask GATEZO, helpline permissions, and no
chart painting over Emergency SOS.

Resident: one Razorpay screen instead of two, honest payment-method copy,
marketplace filters that scroll with the listings, board separated from Community
market, Hindi and Marathi questions understood.

Guard: announcements without shopping links, and a Staff tab for staff and
helper attendance.

## Two server-side pieces need a deploy first

`/api/payments/methods` and `/api/workers/attendance/today` are new in this
branch and are not on Render yet. Until the API redeploys, the Helpers list will
look empty and the bills-tab wording falls back to a generic sentence — the app
code is right, the endpoints just 404.

## Replacing this build

This is a stopgap because the build ran here instead of on EAS. A real preview
build keeps the EAS keystore, so it upgrades in place and can take
JavaScript-only fixes over the air:

```bash
cd app
npx eas-cli build --platform android --profile preview   # new APK + QR
npx eas-cli update --branch preview                      # JS-only, no reinstall
```

Delete this branch once that exists — it carries a 51 MB binary.
