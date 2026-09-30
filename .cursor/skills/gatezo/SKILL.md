---
name: gatezo
description: Source of truth for the GATEZO society/preschool app — what it does, repo layout, how it is built, live hosting, demo logins (not production secrets), every feature including AI, infra, limits, MyGate vs GATEZO, and an investor-demo checklist. Read this before changing the product or auditing it for a demo.
---

# GATEZO application skill

Give this file to any AI agent that must **check the product before an investor demo**. Prefer this file and the code over `README.md` (README still talks about SQLite, H2O, and GateMate in places).

**Product name in the UI:** GATEZO  
**Internal / GitHub name:** H2O / H2O_SanketPOC / GateMate (legacy brand still in some docs)  
**Expo slug / Android package (kept for Play/EAS continuity):** `h2o` / `com.h2o.society`  
**Deep link scheme:** `h2o://`  
**Owner:** Sanket Dhamke (GATEZO)

---

## 1. What the app does

GATEZO is a **multi-tenant community operating system** for:

1. **Residential societies** — gate, maintenance, community, SOS.
2. **Preschools** — child pickup, staff attendance, fees (same binary, labels change).

One install, four roles:

| Role | Who | Society scoped? |
|---|---|---|
| `resident` | Flat owner / tenant (labelled Parent in preschool) | Yes |
| `guard` | Gate staff | Yes |
| `admin` | Society / school committee | Yes |
| `superadmin` | GATEZO platform owner | No (`societyId` is null) |

Every society row has `orgType` = `society` | `preschool`. UI copy must go through `labelsFor(user)` in `app/src/lib/org.js` (never hardcode “flat” / “maintenance” if the tenant is a school).

Customer packages (set by superadmin): **Base / Prime / Platinum** (`app/src/lib/plan.js`). Existing tenants default to **platinum** so nothing disappears until we tier them.

---

## 2. Where the code lives

| What | Path |
|---|---|
| GitHub repository | https://github.com/sanket-dhamke/H2O_SanketPOC |
| API | `server/` — Node 18+, Express, Prisma, `server/src/index.js` |
| Prisma schema | `server/prisma/schema.prisma` (PostgreSQL only) |
| Mobile / web UI | `app/` — Expo React Native |
| Navigation / tabs | `app/App.js` |
| Role home tiles | `getActionGroups` in `app/src/screens/HomeScreen.js` |
| Assistant catalogue | `app/src/lib/assistant.js` |
| Brand (GATEZO vs GateMate pack) | `app/src/lib/brandPack.json` (`active`: `gatezo`) |
| Render blueprint | `render.yaml` (`rootDir: server`, `autoDeploy: true`) |
| EAS profiles | `app/eas.json` |
| Deploy notes | `DEPLOY.md` |
| APK notes | `BUILD.md` |
| Disaster recovery | `DISASTER_RECOVERY.md` |
| This skill | `.cursor/skills/gatezo/SKILL.md` |

Do **not** commit: `server/.env`, `INFRA.md`, `CREDENTIALS.md` (gitignored). Those are the private secret stores.

### Branches (read this before opening a PR)

| Branch | Role |
|---|---|
| `feature/ai-first-v1.1` | GATEZO-branded line the owner has historically installed |
| `cursor/admin-home-helplines-2dd7` | Recent phone-layout / helplines / attention-item work |
| `cursor/neighborhood-feed-2dd7` | **Experiment only** — Neighborhood social feed. Draft PR. Do not merge to `main` until we decide. |
| `main` | Older H2O-branded line. Do not base a GATEZO demo PR on `main` unless asked. |
| Agent work | `cursor/<short-name>-2dd7` |

**Live Render does not run a branch until that branch is deployed.** A new API route that 404s on `https://h2o-api-5sxc.onrender.com` means the **phone app will miss it** even if git has the code.

---

## 3. How we implemented it (architecture in one page)

```
Phone / Expo web  --HTTPS-->  Express API (Render)  --SQL-->  Postgres (Supabase)
        |                         |
        |                         +-- optional Redis (cache + BullMQ queue)
        |                         +-- Groq/OpenAI-compatible AI
        |                         +-- Razorpay
        |                         +-- Expo Push
        |                         +-- WhatsApp Cloud API / email
        +-- photos --> Supabase Storage (or placeholder avatars)
```

- **Auth:** JWT (`Authorization: Bearer`), bcrypt cost 10, password policy, optional email OTP reset. Admin-created accounts plus join-code self-register (pending approval).
- **Tenancy:** almost every query filters `societyId`. Superadmin has none.
- **API style:** REST under `/api/...`. Health: `GET /api/health`.
- **Lists:** optional `?page=&limit=` via `server/src/paging.js`.
- **Cache:** `server/src/cache.js` — in-memory unless `REDIS_URL`. Home summary TTL ~45s (`HOME_SUMMARY_TTL_SEC`).
- **Push/email:** `server/src/queue.js` — in-process unless Redis/BullMQ.
- **Rate limits:** ~600 req/min/IP; tighter on login and `/api/ai` (`server/src/rateLimit.js`).
- **Client API wrapper:** `app/src/lib/api.js`. On **web**, same hostname port **4000** unless `extra.apiUrl` is a remote host. On **native**, `EXPO_PUBLIC_API_URL` (EAS) or `app.json` `extra.apiUrl`. Login screen **Advanced** can override the API URL (stored in AsyncStorage).
- **Assistant:** **local-first**. `resolveAssistant` in `app/src/lib/assistant.js` answers from live society data so a dead Groq model does not blank the home card. Remote LLM is extra colour, not the only path. Hindi/Marathi questions use `app/src/lib/lang.js` (whole-word, not substring).
- **Tests:** `cd server && npm test` (`node:test` in `server/test/`).

### Run locally (validated)

Postgres is required (schema is not SQLite).

```bash
sudo apt-get update -q && sudo apt-get install -y -q postgresql
sudo pg_ctlcluster 16 main start
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';"
sudo -u postgres psql -c "CREATE DATABASE gatezo;"

cd server
printf 'DATABASE_URL=postgresql://postgres:postgres@localhost:5432/gatezo\nJWT_SECRET=devsecret\nPORT=4000\n' > .env
npm install && npx prisma generate && npx prisma db push && node src/seed.js
node src/index.js          # http://localhost:4000

cd ../app && npm install
CI=1 EXPO_PUBLIC_API_URL=http://localhost:4000 npx expo start --web --port 8090
```

Open **http://localhost:8090**. Metro cache: restart with `--clear` if a `lib/` edit does not appear.

---

## 4. Live services & repository

| Thing | Value |
|---|---|
| Repo | https://github.com/sanket-dhamke/H2O_SanketPOC |
| API | https://h2o-api-5sxc.onrender.com |
| Health | https://h2o-api-5sxc.onrender.com/api/health — flags `razorpay`, `storage`, `ai`, `cache`, `queue` |
| Host | Render web service `h2o-api`, **free plan** in `render.yaml` (sleeps after idle) |
| Database | Supabase PostgreSQL (`DATABASE_URL` on Render) |
| App builds | EAS, Expo account **sanket2891**, projectId `75b8960c-eda5-41bf-a856-751342266f3b` |
| Preview APK API | `EXPO_PUBLIC_API_URL=https://h2o-api-5sxc.onrender.com` in `app/eas.json` |
| Updates URL | `https://u.expo.dev/75b8960c-eda5-41bf-a856-751342266f3b` |

Phone APK **does not pick up git** until you ship an EAS build / `eas update` / local APK. Expo Go cannot do Razorpay or the microphone.

---

## 5. Credentials (what you may put in git vs what you must not)

### 5.1 Seeded DEMO logins (local `node src/seed.js` only)

Password for **every** seeded account: `Password123`

| Email | Role | Tenant |
|---|---|---|
| `owner@h2o.com` | superadmin | Platform |
| `admin@h2o.com` / `admin2@h2o.com` | admin | Green Valley Residency (Pune) |
| `guard@h2o.com` / `guard2@h2o.com` | guard | Green Valley |
| `resident@h2o.com` (A-101 Aarav), `resident1b@h2o.com`, `resident2@h2o.com` (A-102), `resident3@h2o.com` (B-201) | resident | Green Valley |
| `admin@skyline.com` | admin | Skyline Towers (Mumbai) |
| `guard@skyline.com` | guard | Skyline |
| `resident@skyline.com` / `resident2@skyline.com` | resident | Skyline |

On the **Neighborhood experiment branch seed only**, there is also Riverside Residency (Pune): `admin@riverside.com`, `resident@riverside.com`.

`npm run db:reset` wipes tenant data and keeps superadmin — **do not seed** a live investor DB with fake societies unless asked.

### 5.2 Production / Render — names of secrets, not values

**Never paste these into a chat, PR, or this file.** They live in Render → Environment, Supabase dashboard, and the gitignored `INFRA.md` / `CREDENTIALS.md` on the owner’s laptop.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Supabase Postgres (prefer session/transaction pooler) |
| `DIRECT_URL` | Direct 5432 URL if using pgBouncer 6543 for migrate |
| `JWT_SECRET` | Signs logins |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` | Payments (test keys for demo) |
| `AI_BASE_URL` / `AI_API_KEY` / `AI_CHAT_MODEL` / `AI_TRANSCRIBE_MODEL` | Groq or other OpenAI-compatible |
| `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` / `SUPABASE_BUCKET` | Photos |
| `SUPABASE_BACKUP_BUCKET` / `BACKUP_ENCRYPTION_KEY` | Encrypted platform backups |
| `EMAIL_PROVIDER` + Resend/SMTP vars | OTP + backup mail |
| `WHATSAPP_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` / `WHATSAPP_TEMPLATE` | Live WhatsApp; without them, **dev mode** (log + wa.me) |
| `WHATSAPP_BUSINESS_NUMBER` | Display default in code `917841889241` |
| `CRON_SECRET` | External cron for backups / reminders |
| `REDIS_URL` | Optional shared cache/queue |
| `EXPO_TOKEN` | Cloud Agent EAS login |
| Expo account | `sanket2891` |

Default **local** API: `http://localhost:4000`. Live **phone** API: Render URL above.

---

## 6. Features (including AI)

### Resident (society)

- **Home:** AI-first “Ask GATEZO”, charts, **Needs your attention** (dues, approved clubhouse pay, recent/pinned announcements — some of this is merged client-side when live API is old).
- **Visitors:** approve / deny / leave at gate; history.
- **Gate pass:** pre-approve guest/delivery with a code (Prime).
- **Vehicle QR:** register vehicle, print QR for boom barrier (Platinum).
- **Maintenance:** bills, partial pay, Razorpay (methods from `GET /api/payments/methods` — never fake a UPI sheet), receipts, **mobile number editor**.
- **Transparency / sustainability / AGM votes.**
- **Community:** committee **announcements** (not the classifieds); neighbour **board**; **Buy & Sell** (own society or all); **home services** booking; **helpdesk**; **directory** (opt-in phone); **helplines**; **clubhouse** book → admin approve → pay; **trusted helpers** (Trust Passport); **SOS**; help guide.
- **Rent agreements** (Prime) when the flat is on rent.

### Guard

- Gate desk: photo + fields, **voice dictate** (Whisper when AI + mic build).
- Gate log, visitor wait / checkout.
- Staff & helper **attendance** (photo optional).
- SOS response; read announcements / helplines (no Buy & Sell launcher).

### Admin

- Finance: collections, expenses, ledger, cash collect, reminders, late-fee policy, maintenance heads.
- Members, flats, CSV import, bills generate.
- Confirm **home-service** bookings; amenities; assets/AMC; AGM; rental compliance; reports/PDF; society **manager** (AI draft notices).
- Gate devices / vehicle registry (Platinum).
- Plan tile (Base/Prime/Platinum).

### Superadmin

- All societies, plans/tiers, branding/slug/QR, platform payments, listing moderation, **Backup & recovery**.

### Preschool extras

- Students = flats; class chips; guardian fields; pickup QR; child updates; staff attendance; fees + WhatsApp/email due reminders; no resident visitor-approval loop (guard logs and notifies office).

### Home services (important for investors)

Catalogue in `server/src/homeServicesCatalog.js` / `app/src/lib/homeServices.js`. Resident books a package + slot → `ServiceBooking` (`requested` / `confirmed` / `assigned` / `completed` / `cancelled`). Admin confirms or declines.

**This is not Urban Company.** `partnerName` is a label (e.g. “Sparkle Homes”). **No vendor login, no live dispatch.** Trust Passport (`Worker`) is the existing cross-society helper identity we should attach next.

### Neighborhood feed (experiment)

Branch `cursor/neighborhood-feed-2dd7` (draft PR). Community tile **Neighborhood**: posts/polls, audience **Followers / My society / This area** (same city, not all-India), follow request before chat, photos. **Not on live Render until merged and deployed.** Do not demo it as a shipped store feature unless that branch is running locally.

### AI — how it actually works

| Piece | Implementation |
|---|---|
| Chat | `server/src/ai.js` — OpenAI SDK against **any** OpenAI-compatible host |
| Default live setup | Groq (`AI_BASE_URL=https://api.groq.com/openai/v1`) |
| Home answers | **On-device/local resolver first** (`assistant.js`) using bills, visitors, directory |
| Voice | Whisper-class model for guard dictate |
| Admin drafts | Society manager uses server AI when configured |
| If AI env missing | Friendly “not configured”; rest of app works |
| Cost | Groq **free tier is rate-limited and not a contract**. Paid Groq/OpenAI when usage grows. Models get retired (Llama ids already did). |
| Limit | `aiLimiter` ~30/min/IP |

**Do not tell an investor “AI is free forever.”** Tell them: *metered API, free for the demo, same plug can take a paid key.*

### Payments & monetization

- Resident bills: Razorpay order + checkout + webhook.
- Cash: admin marks collected.
- Venue/vendor booking: Payment Link; **90% society / 10% GATEZO** when a Razorpay linked account exists.
- Society subscription plan + superadmin platform payments.

### Messaging

- Expo push (token on user).
- Email (OTP, receipts, backups) when provider configured; else OTP printed in API for local.
- WhatsApp Cloud API when token set; else console + wa.me.

---

## 7. Infra & technologies

| Layer | Technology |
|---|---|
| UI | Expo / React Native (Android, iOS, web), React Navigation (tabs + stacks), Ionicons, expo-linear-gradient, AsyncStorage, expo-image-picker, expo-audio, expo-notifications, expo-print/sharing, react-native-svg (home donuts — **needs a real APK**, not only OTA) |
| Backend | Node.js, Express, Prisma ORM |
| Database | PostgreSQL on **Supabase** |
| Files | Supabase Storage (visitors, backups); JSON body up to 12 MB for photos (must move off this path at scale) |
| Hosting API | **Render** (`render.yaml`, free sleeper) |
| Auth | JWT + bcrypt |
| Payments | Razorpay |
| AI | Groq / OpenAI / Ollama (env switch) |
| Push | Expo Push |
| Jobs | node-cron in-process; external cron + `CRON_SECRET` because Render Free sleeps |
| Optional scale | `REDIS_URL` → Redis cache + BullMQ |
| App delivery | EAS Build / EAS Update; local Gradle APK fallback |

**Best stack for a one-person technical team: yes.** Scaling to millions is **more machines + Redis + object storage + Mumbai region**, not a rewrite in another language.

---

## 8. Limits today & upgrades needed

Be honest in the demo.

| Today | Limit | Next upgrade |
|---|---|---|
| Render **Free** | Sleeps ~15 min; 512 MB; cold start | Paid always-on (~$7–25/mo) |
| Supabase **Free** | ~500 MB DB, pause, tiny storage | Pro (~$25/mo) + PITR |
| One API process | Cache/queue die on restart | `REDIS_URL` |
| Comfortable load | Hundreds of flats / a few societies | Vertical then horizontal API copies |
| 5 million flats | **Not this box** | Load balancer, DB replicas/partition by society, S3, CDN, workers, India region; cost driven by **photos/WhatsApp/AI** |
| Home services | Ticket + admin confirm | Assign Trust Passport worker + WhatsApp; later vendor login or Urban Company API |
| AI | Free-tier Groq | Paid key + spend cap |
| Photos in JSON | Heavy, not for scale | Direct upload to storage |
| Neighborhood | Separate branch | Merge only if we keep it |
| Expo Go | No Razorpay / mic | Demo on **installed APK** |
| New API on git | Phone still hits old Render | Redeploy, then confirm `/api/health` and the new route |

**Capacity one-liner:** *Pilot and first paid societies: yes, with a ~$50–150/mo always-on stack. National 5M-flat network: later-stage ops, same product.*

**Security (customer data):** Postgres + bcrypt; HTTPS; society scoping; optional AES-256-GCM platform dump; DPDP-minded: do not store Aadhaar in plaintext; photos out of DB; backup key off-server. India residency / RLS / photo TTL are upgrades.

---

## 9. GATEZO vs MyGate (say this carefully)

MyGate is a **large, visitor-first Indian incumbant** with hardware partners, brand, and sales. GATEZO is **not** “MyGate but cheaper” and must not claim their users or code.

| | MyGate (typical market position) | GATEZO (this codebase) |
|---|---|---|
| Centre of gravity | Gate + visitor approvals | **AI-first home** + gate + **money trail** (bills, transparency, AGM) |
| Tenants | Societies | **Society and preschool in one app** |
| Helpers | Society-scoped staff | **Trust Passport** ratings that travel across GATEZO societies |
| Home services | Often partner marketplace | **Our catalogue + booking ticket**; dispatch not live yet |
| Social | In-society notices / chat (product-dependent) | Neighborhood **area** feed is an **experiment** |
| AI | Varies | Local-first assistant on live society data + optional Groq |
| Hardware gate | Mature ANPR/QR ecosystem | Vehicle QR + device API designed; Platinum; needs field devices |
| Scale | Millions of users | **Pilot infra** |
| Independence | — | Original app; no MyGate code, assets, or APIs (`README.md`) |

**Investor sentence:** *MyGate owns the gate habit. GATEZO is the society OS — AI, fees, transparency, helpers that work in the next society, and (later) area discussion. We integrate or partner for hardware and last-mile home service; we do not pretend we already operate their network.*

---

## 10. Investor demo checklist (for the auditing agent)

Run these and report **pass / fail / not on this build**. Do not invent.

**Environment**

1. `GET https://h2o-api-5sxc.onrender.com/api/health` — note `ai`, `razorpay`, `storage`, `cache`, `queue`. If the API is asleep, wait for cold start.
2. Confirm the **APK/web** `apiUrl` is that host (or local `:4000` if demoing localhost). Advanced URL on login if the phone misses the API.
3. Git branch + last commit vs what Render last deployed — if they differ, **say so**.

**Logins (use the environment’s real accounts; seed emails only if this is a seed DB)**

4. Resident: Home Ask GATEZO (English + one Hindi/Marathi question), Needs your attention, pay bill path (Razorpay test or mock).
5. Guard: log visitor (photo); voice only on a **dev/APK** with mic, not Expo Go / not web.
6. Admin: finance, confirm a clubhouse or home-service booking, post announcement.
7. Superadmin: societies list, backup readiness (if env keys set).

**Do not oversell**

8. Home services: booking appears; **no** technician assignment UI beyond admin confirm.
9. Neighborhood: only if that experiment branch + local API is running.
10. “Free AI”: Groq free **today**, rate-limited, replaceable, not a forever cost of ₹0.
11. Scale: do not say we already support millions of flats.

**UI regressions already fixed once (re-check on the APK they will show)**

- No Hindi/Marathi **voice chips** under Ask GATEZO (speech is English; Indic is text).
- Community **grid** of services, not a leftover horizontal strip.
- Maintenance **mobile number** editor for residents.
- Razorpay shows **enabled methods only**.

**If something 404s**

The JS may be new and Render old. App often **falls back silently**. Check the network tab / `curl` the route before calling it a product bug.

---

## 11. Conventions for agents changing code

- Comments: constraints/trade-offs only.
- Money: `₹` Indian grouping; compact `₹1.2L` on donuts.
- Charts: green settled, orange action, red problem, teal info.
- Prisma statuses are **strings** (see header of `schema.prisma`).
- Android `flex: 1` in an auto-height column collapses — do not reintroduce that on Home.
- Express: static paths like `/workers/attendance/today` before `/workers/:id`.
- Announcements = committee; classifieds = Community market.
- Native modules (svg, audio, Razorpay) → **new APK**, not only `eas update`.

---

## 12. One-paragraph brief (paste into a slide)

GATEZO is an Expo + Node society (and preschool) app: visitors, maintenance with Razorpay, helpdesk, marketplace, SOS, AGM, and an AI home that answers from live data first. Code is https://github.com/sanket-dhamke/H2O_SanketPOC. API is Node/Prisma on Render; data is Postgres on Supabase. Demo accounts are seeded locally; production keys stay in Render. Home services and Neighborhood are product directions — bookings exist, live Urban-Company-style dispatch and a public social graph are not the current Render app. Infra is a pilot; the architecture (societyId, Redis hooks, object storage) is how we grow, not a rewrite.
