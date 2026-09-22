---
name: gatezo
description: Project context for the GATEZO (H2O) society-management app — repo layout, roles, branches, live services, how to run the whole stack locally, how to verify UI changes without a device, how to ship an APK/QR, and the gotchas that have already cost a debugging session. Read this before working anywhere in this repo.
---

# GATEZO (repo name H2O_SanketPOC)

Society / preschool management app: an Expo React Native client in `app/` and a
Node + Express + Prisma API in `server/`. One codebase serves two org types
(`society`, `preschool`) and four roles (`resident`, `guard`, `admin`,
`superadmin`). `README.md` predates the current app — trust this file and the
code over it.

## Branches

- `main` — older H2O-branded line.
- `feature/ai-first-v1.1` — **the GATEZO UI the owner actually installs and
  tests** (GATEZO branding, AI-first home, EAS preview APK config). Unless told
  otherwise, feature work belongs here and PRs target it. Basing a PR on `main`
  dumps every GATEZO commit into the diff.
- Work branches: `cursor/<descriptive-name>-2dd7`.

## Live services

| Thing | Where |
|---|---|
| API | `https://h2o-api-5sxc.onrender.com` (`/api/health` shows `razorpay`, `storage`, `ai`, `cache`, `queue` flags) |
| Hosting | Render blueprint in `render.yaml`, `autoDeploy: true`, `rootDir: server` |
| Database | Supabase Postgres via `DATABASE_URL`. The schema is Postgres-only (`mode: "insensitive"`, arrays) — do not try SQLite |
| AI | OpenAI-compatible (Groq) via `AI_BASE_URL` / `AI_API_KEY` / `AI_CHAT_MODEL` / `AI_TRANSCRIBE_MODEL` |
| Payments | Razorpay **test** keys; settles to the society's linked account when one exists |
| App builds | EAS, Expo account `sanket2891`, project `h2o`, package `com.h2o.society` |

Server changes are **not live until Render redeploys**. Before asking the owner
to test on a phone, check the endpoint exists: a 404 on a new route means the
app will silently fall back.

## Role → feature map

- **Resident**: bills + Razorpay + receipts, visitors/approvals, gate pass,
  vehicle QR, clubhouse booking, helpdesk, board, Community market, home
  services, trusted helpers, helplines, SOS, AGM, transparency, sustainability.
- **Guard**: gate desk (voice-dictated visitor entry), gate log, staff & helper
  attendance, SOS response, read-only helplines/announcements.
- **Admin**: collections/expenses/ledger, members & flats, CSV import, bills,
  amenities approve/manage, assets & AMC, AGM, rental compliance, reports,
  society manager (AI drafts), plan/subscription, gate devices.
- **Superadmin**: societies, platform payments, platform helplines, backups.

Role menus live in `getActionGroups` (`app/src/screens/HomeScreen.js`), the tab
sets in `app/App.js`, and the assistant's per-role catalogue in
`app/src/lib/assistant.js`.

## Run the whole stack locally (validated)

```bash
# Postgres (not preinstalled)
sudo apt-get update -q && sudo apt-get install -y -q postgresql
sudo pg_ctlcluster 16 main start
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';" -c "CREATE DATABASE gatezo;"

# API
cd server
printf 'DATABASE_URL=postgresql://postgres:postgres@localhost:5432/gatezo\nJWT_SECRET=devsecret\nPORT=4000\n' > .env
npm install && npx prisma generate && npx prisma db push && node src/seed.js
node src/index.js            # http://localhost:4000

# App (web build is the fastest way to click through)
cd ../app && npm install
CI=1 npx expo start --web --port 8090
```

Seeded logins, all with password `Password123`: `owner@h2o.com` (superadmin),
`admin@h2o.com` / `guard@h2o.com` / `resident@h2o.com` (Green Valley),
`admin@skyline.com` / `guard@skyline.com` / `resident@skyline.com` (Skyline —
useful as a second society with different data).

Two things that waste time if you forget them:

- **`/api/home-summary` is cached ~45s** (`HOME_SUMMARY_TTL_SEC`). After
  changing bills or payments, restart the API to see the dashboard move.
- **Metro caches modules.** If an edit to a `lib/` file does not change
  behaviour in the browser, restart with `npx expo start --web --clear` and
  hard-reload. Confirm what is actually served:
  `curl 'http://localhost:8090/index.bundle?platform=web&dev=true&hot=false' | grep -c yourNewSymbol`

On web, `api.js` derives the API base from the page host; on native it comes
from `app.config.js`, which prefers `EXPO_PUBLIC_API_URL` (set per profile in
`app/eas.json`) over `app.json`'s `extra.apiUrl` (which is localhost for dev).

## Verifying UI without a device

Phone-width headless browser, no GUI session needed:

```bash
cd /tmp && npm install playwright && npx playwright install chromium
```

Log in by filling the `Email` / `Password` placeholders and pressing Enter, then
drive the screen (`getByPlaceholder(/Type a question about/i)` is the Ask GATEZO
box). Screenshot a single card with
`page.locator("text=" + question).first().locator("xpath=ancestor::div[4]")`.

If using the `computerUse` subagent instead: it is stateful and dies with
"too many images" after roughly a hundred screenshots, so keep prompts short and
split long walkthroughs. Web layout will not reproduce Android-only flexbox
bugs — say so rather than claiming a device-specific fix is proven.

Useful API smoke test:

```bash
TOKEN=$(curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"guard@h2o.com","password":"Password123"}' | python3 -c 'import json,sys;print(json.load(sys.stdin)["token"])')
curl -s -H "Authorization: Bearer $TOKEN" localhost:4000/api/workers/attendance/today
```

## Shipping to the owner's phone

The owner tests on Android and asks for a **QR code**. Past runs generated a QR
PNG for the build URL and committed it (`h2o_apk_qr.png`,
`gatemate_latest_qr.png`, … each encodes an `expo.dev` build or artifact URL).

Preferred, because it keeps the EAS signing key so the app upgrades in place:

```bash
cd app
npx eas-cli login                                        # account sanket2891
npx eas-cli build --platform android --profile preview    # .apk + QR, 10–20 min
# JS-only change? skip the build entirely:
npx eas-cli update --branch preview --message "…"
```

This needs an Expo credential. In a Cloud Agent, ask for `EXPO_TOKEN` in
Dashboard → Cloud Agents → Secrets; without it, hand the owner the commands.

Fallback that needs nobody's credentials — build in the VM and serve the APK
from this **public** repo (`https://raw.githubusercontent.com/<owner>/<repo>/refs/heads/<branch>/<file>.apk`),
then `qrencode -o qr.png <url>`:

```bash
sudo apt-get install -y openjdk-17-jdk-headless unzip
# Android cmdline-tools into ~/android-sdk, then:
yes | sdkmanager --licenses && sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0"
cd app && EXPO_PUBLIC_API_URL=https://h2o-api-5sxc.onrender.com npx expo prebuild -p android --no-install
# pin one ABI in android/gradle.properties: reactNativeArchitectures=arm64-v8a
cd android && ./gradlew :app:assembleRelease -x lintVitalRelease -x lintVitalAnalyzeRelease
```

Caveats, all learned the hard way: `lintVitalRelease` burns ~20 min of CPU and
is skippable; all four ABIs push the APK past GitHub's 100 MB file limit, one
ABI keeps it small; the Expo template signs release with the **debug** keystore,
so a locally built APK cannot upgrade an EAS-signed install (the owner must
uninstall first); `expo prebuild` rewrites `package.json` scripts (revert it) and
`android/` is build output, never edited by hand; a second Gradle run fails on a
stale journal lock if you kill the first (`kill -9` the JVM, remove the lock).

Adding a **native module** means a new APK — JS-only changes can ride an
`eas update`. `BUILD.md` spells this out.

## Gotchas that have already caused bugs

- **Razorpay checkout only offers what the account enabled.** A key with UPI off
  shows Cards/Netbanking/Wallet, which is why the app asks
  `GET /api/payments/methods` (`getEnabledMethods` in `server/src/razorpay.js`)
  instead of advertising Google Pay. Never re-add a second, app-drawn "pay via
  UPI" sheet in front of Razorpay's.
- **The assistant is deliberately local-first.** `resolveAssistant` in
  `app/src/lib/assistant.js` answers from live app data because the remote model
  has been retired mid-flight before. Remote chat is optional colour.
- **AI off ⇒ `translateText` returns its input.** Anything that relies on
  translation must degrade: Devanagari questions route through the keyword map in
  `app/src/lib/lang.js`.
- **Hindi vs Marathi must match whole words.** As a substring, `काय` sits inside
  the Hindi `शिकायत` and answered Hindi complaints in Marathi.
- **`flex: 1` inside an auto-height column collapses to zero on Android**, and
  RN does not clip by default, so the home donut painted over Emergency SOS.
  Stacked cards drop `fill`, reserve a min height, and clip overflow.
- **Express route order**: declare `/workers/attendance/today` away from
  `/workers/:id` collisions, and remember `roleRequired("guard","admin")`.
- **Announcements are committee-only**; the board is neighbour talk; selling
  belongs in Community market. Guards see no resident-only launcher links.
- **Helpline RBAC**: admin full CRUD on society scope, residents may create but
  not edit/delete shared entries, guards read-only (enforced in
  `server/src/routes/services.js`, not just the UI).
- **Expo Go cannot** do Razorpay or the microphone — demos need a real build.

## Conventions

- Comments explain a constraint or a trade-off the code cannot show. No
  narration, no change logs in comments.
- Never hardcode "flat"/"society"/"maintenance" in UI copy: use
  `labelsFor(user)` from `app/src/lib/org.js` so preschool tenants read
  "student"/"school"/"fees".
- Chart colours mean the same thing everywhere: green settled, orange needs
  action, red problem, teal informational.
- Money is `₹` with Indian digit grouping; donut centres use the compact form
  (`₹1.2L`).
- Prisma statuses are plain strings documented at the top of `schema.prisma`.
- `server/test/*.test.js` runs with `npm test` (node:test).
