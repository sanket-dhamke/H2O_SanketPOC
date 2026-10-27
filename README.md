# GATEZO (H2O) — society and preschool app

One JavaScript app for Android, iPhone, and the website, plus a Node.js API.
The live site is https://h2o-api-5sxc.onrender.com. How each login uses the app is in [USER_GUIDE.md](USER_GUIDE.md).

Production data is Supabase PostgreSQL. Render runs the API and the website.

## Features

- **Roles**: resident, guard, admin, GATEZO owner (superadmin), and service professional. Residents can self-register with a society join code. Professionals self-register with a separate provider code. An admin or the owner approves them.
- **Maintenance**: residents view monthly bills + dues and pay (Razorpay: UPI/cards/netbanking, with a mock fallback for demos). Payment history + receipts.
- **Visitors**: guard photographs the visitor and records name, phone, vehicle number, purpose and flat. **All residents of that flat** get a push notification.
- **Approvals**: resident taps **Approve / Reject / Leave at gate**; the guard is notified of the decision. Approved/decided visitors are kept in history.
- **Admin dashboard**: society balance, collected vs pending, flat-wise dues, generate monthly bills, record expenses, and push **reminders** to residents with dues.
- **AI (optional)**:
  - Guards can **dictate** visitor details by voice; the app transcribes (Whisper) and pre-fills the form.
  - Everyone gets a **natural-language assistant** ("who visited my flat last week?", "society balance?", "which flats have dues?"), scoped to their role.

> H2O is an independent, original app inspired by common society-app features. It does not use any MyGate code, assets, brand, or APIs.

## Tech stack

| Part | Tech |
|------|------|
| Screens | Expo (React Native) — Android, iOS, and web |
| Server | Node.js + Express, hosted on Render |
| Database | Prisma + Supabase PostgreSQL |
| How to use it | [USER_GUIDE.md](USER_GUIDE.md) |
| Photo storage | Supabase Storage (optional; placeholder avatars otherwise) |
| Auth | JWT + bcrypt, admin-managed accounts + password policy |
| Push | Expo Push Notifications |
| Payments | Razorpay (optional; mock fallback) |
| AI | OpenAI (optional; assistant + voice) |

```
h2o/
├─ server/
│  ├─ prisma/schema.prisma      # DB schema (Flat, User, Bill, Visitor, Expense)
│  └─ src/
│     ├─ index.js               # app wiring + Razorpay webhook
│     ├─ prisma.js              # Prisma client
│     ├─ auth.js                # JWT helpers
│     ├─ passwordPolicy.js      # single source of truth for password rules
│     ├─ storage.js             # Supabase Storage for visitor photos
│     ├─ ai.js                  # OpenAI assistant + Whisper + field parsing
│     ├─ serializers.js         # DB -> API shapes
│     └─ routes/                # auth, maintenance, visitors, admin, ai
└─ app/                         # Expo React Native app
```

## Prerequisites

- Node.js 18+ and npm
- A phone with **Expo Go** (or a dev build), on the **same Wi-Fi** as your computer.
- No database install needed — SQLite is a local file created automatically.

**Mac (Apple Silicon M1–M5):** from the repo root run `bash scripts/setup-mac.sh`. That installs Node deps for `server/` and `app/`, generates Prisma, and (if Homebrew is present) Node + watchman. iOS Simulator needs Xcode; Android emulator on M-series needs an ARM system image. The hosted API in `app.json` works without a local server.

## 1. Set up the backend

```bash
cd server
npm install
```

Create `server/.env` (copy from `.env.example`). The defaults work out of the box; set a real `JWT_SECRET` and keep the SQLite default:

```
JWT_SECRET=<long-random-string>
DATABASE_URL=file:./dev.db
```

Create the schema and seed demo data:

```bash
npm run db:setup     # prisma generate + prisma db push + seed (creates server/prisma/dev.db)
npm start            # http://0.0.0.0:4000
```

> Prefer PostgreSQL/Supabase? Change the `datasource` provider in `prisma/schema.prisma` to `postgresql` and set `DATABASE_URL` to your connection string, then run `npm run db:setup`.

**Demo logins** (all use password `Password123`):

| Email | Role | Flat |
|-------|------|------|
| admin@h2o.com / admin2@h2o.com | admin | — |
| guard@h2o.com / guard2@h2o.com | guard | — |
| resident@h2o.com | resident | A-101 |
| resident1b@h2o.com | resident | A-101 (same flat) |
| resident2@h2o.com | resident | A-102 |
| resident3@h2o.com | resident | B-201 |

Find your computer's LAN IP (needed by the app): `ipconfig` (Windows) / `ifconfig` (macOS/Linux).

### Creating more accounts

Log in as an **admin** in the app → **Members** tab:
- **New account** — create residents (assign a flat), guards, or other admins. The password must be 8+ chars with an uppercase, lowercase and a number.
- **Flats** — add flats before assigning residents to them.

## 2. Run the mobile app

Edit `app/app.json` → `expo.extra.apiUrl` to your computer's IP (e.g. `http://192.168.1.5:4000`), then:

```bash
cd app
npm install
npx expo start
```

Scan the QR with Expo Go. Push notifications and the camera/microphone work on a **real device** (a dev build is needed for native modules like Razorpay checkout and audio recording).

## 3. Optional integrations

### Supabase Storage (visitor photos)
Set in `server/.env` (from Supabase → Project Settings → API), and create a **public** bucket named `visitors`:
```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=<service-role-key>
SUPABASE_BUCKET=visitors
```
Without these, visitors get placeholder avatars.

### AI (assistant + voice)
Set in `server/.env`:
```
OPENAI_API_KEY=sk-...
OPENAI_CHAT_MODEL=gpt-4o-mini
OPENAI_TRANSCRIBE_MODEL=whisper-1
```
Without a key, the **Assistant** tab and the guard's **Dictate** button return a friendly "AI not configured" message; everything else works.

### Payments (Razorpay)
Test-mode keys (no KYC) from https://dashboard.razorpay.com → Settings → API Keys:
```
RAZORPAY_KEY_ID=rzp_test_xxx
RAZORPAY_KEY_SECRET=xxx
```
Test card `4111 1111 1111 1111` (any future expiry/CVV); UPI `success@razorpay`. Without keys, "Pay" uses a mock success.

## 4. Going to production

- **Database + storage**: a Supabase project (free tier).
- **Backend**: Render / Railway / Fly.io — set the env vars above, start command `npm start`. Run `npm run prisma:migrate` (or `prisma db push`) against the production DB.
- **App**: EAS build for installable Android/iOS (`app/eas.json` is configured). Push and native modules require a dev/production build, not Expo Go.

## API reference (backend)

| Method | Path | Role | Purpose |
|--------|------|------|---------|
| POST | `/api/auth/login` | all | Login, returns JWT |
| GET | `/api/me` | auth | Current user |
| POST | `/api/push-token` | auth | Save device push token |
| GET | `/api/flats` | auth | Flat list (for pickers) |
| GET | `/api/maintenance` | auth | Bills + total due |
| POST | `/api/maintenance/:id/pay` | resident | Pay (mock fallback) |
| POST | `/api/maintenance/:id/create-order` | resident | Create Razorpay order |
| POST | `/api/maintenance/:id/verify` | resident | Verify payment → mark paid |
| POST | `/api/razorpay/webhook` | (signed) | Razorpay payment events |
| GET | `/api/visitors` | auth | Resident: own flat / Guard+Admin: full log |
| POST | `/api/visitors` | guard/admin | Log a visitor (photo, vehicle) → notify residents |
| POST | `/api/visitors/:id/decision` | resident | approve / reject / leave_at_gate |
| GET/POST/PATCH/DELETE | `/api/admin/users` | admin | Manage accounts |
| GET/POST | `/api/admin/flats` | admin | Manage flats |
| GET | `/api/admin/finance` | admin | Balance, dues, flat-wise status |
| POST | `/api/admin/bills` | admin | Generate monthly bills |
| POST | `/api/admin/reminders` | admin | Push reminders to unpaid residents |
| GET/POST | `/api/admin/expenses` | admin | Society expenses |
| POST | `/api/ai/assistant` | auth | Natural-language Q&A (role-scoped) |
| POST | `/api/ai/voice-visitor` | guard/admin | Transcribe + parse spoken visitor details |
