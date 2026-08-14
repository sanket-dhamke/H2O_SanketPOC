# GateMate — Master Build Prompt

Paste the block below into any fresh agent window to reconstruct or continue this app.
It captures the full scope of what has been built so far.

> **For accounts, credentials, connection strings and hosting details, see `INFRA.md`**
> (git-ignored, kept private). This file is only the product/engineering spec.
>
> **Quick handoff / how to run**
> - Repo layout: `server/` (Node + Express + Prisma API) and `app/` (React Native / Expo).
> - Backend: `cd server; npm install; npm run db:setup` (seed) `; npm start` (port 4000).
> - App: `cd app; npm install; npx expo start`. API URL is in `app/app.json` → `extra.apiUrl`.
> - Cloud build (APK/AAB): `cd app; npx eas-cli build -p android --profile preview|production`.
> - Clean slate for QA: `cd server; npm run db:reset` (wipes all tenant data, keeps only the
>   superadmin login + platform settings). Do NOT run `db:setup`/`seed` for a QA handoff — those
>   repopulate the fake demo societies. `reset.js` refuses to run if no superadmin exists.
> - Windows/PowerShell: chain commands with `;` (not `&&`).
> - Branding: the app is now **GateMate** (icon, splash, and all user-visible text). The internal
>   Expo `slug` (`h2o`) and Android package (`com.h2o.society`) are intentionally kept for
>   EAS/Play continuity. Deep-link scheme is `h2o://`. The `PayToH2O` route id is an internal
>   identifier only (screen title reads "Pay to GateMate").

```
You are building a production-grade, multi-tenant community & premises management mobile app
(React Native / Expo) called "GateMate" (internally "H2O"). It is a MyGate-style app with AI,
serving TWO tenant types from ONE codebase and ONE app binary:
  1. Residential SOCIETIES (gate + maintenance + community)
  2. PRESCHOOLS (visitor entry/exit + staff attendance + student fee management)

Existing society tenants must remain 100% unchanged when preschool features are added. The tenant
type is a per-tenant field (orgType = "society" | "preschool"); all UI labels/flows adapt from it.

================================================================================
TECH STACK
================================================================================
Backend:  Node.js + Express, JWT auth, bcrypt password hashing, Prisma ORM,
          PostgreSQL (Supabase — use the IPv4 "Session pooler" connection string, since direct
          IPv6 Supabase endpoints are blocked on corporate networks), node-cron for scheduling,
          nodemailer/Resend for email, pdfkit for server-side PDFs.
Payments: Razorpay (orders, checkout, webhook signature verify, Payment Links for vendor payouts).
AI:       Provider-agnostic LLM layer supporting Groq (Llama 3.3 chat + Whisper voice), OpenAI,
          and Ollama. Voice transcription for guard visitor entry; natural-language assistant.
Storage:  Supabase Storage (optional) for visitor photos.
Frontend: React Native (Expo SDK), React Navigation (stack + tabs), AsyncStorage, expo-linear-gradient,
          expo-print, expo-sharing, expo-image-picker, expo-av, expo-notifications, @expo/vector-icons.
Push:     Expo Push Notifications.
Build:    EAS (production profile builds Android .aab; submit profile for Play Store).
Deploy:   Backend on Render (render.yaml blueprint); DB on Supabase.
Scale:    OPTIONAL Redis (REDIS_URL) → shared cross-instance cache + durable BullMQ push/email queue.
          Without Redis the app is identical: a bounded in-process cache (cache.js) + async in-process
          notification queue (queue.js) keep behavior the same on a single instance. Per-IP rate limiting
          (express-rate-limit; rateLimit.js) with tight limits on auth/AI and exemptions for health/cron/
          webhook/gate-device. Backward-compatible pagination helper (paging.js: ?page/?limit, additive
          hasMore) on high-volume list endpoints. Composite DB indexes on hot paths. `trust proxy` set so
          req.ip is correct behind Render. GET /api/health reports {cache, queue} backend in use.

================================================================================
ROLES & AUTH
================================================================================
- superadmin (H2O platform owner): societyId = null; sees ALL tenants, platform totals, revenue,
  creates/edits tenants, resets any user's password, manages branding, subscription plans.
- admin (per society/preschool): manages users/flats(students), finance/fees, bills, expenses,
  reminders, reports, backups, amenities, announcements, moderates posts, marks cash payments.
- guard: logs visitors (with photo + details, or by VOICE via AI); marks visitor exit.
- resident (labeled "Parent" for preschools): pays bills/fees (full or partial/installment),
  approves/denies/leave-at-gate visitors (society only), views history, posts, books amenities.

Auth features: JWT login, "Enter" key submits, show/hide password, self-service change password,
superadmin password reset for any user, email-OTP forgot-password flow. Admin creates all accounts
(no public signup). Strong password policy. Role-based access control; every query scoped by societyId.

================================================================================
MULTI-TENANCY MODEL
================================================================================
- Society model has: name, city, address, active, orgType ("society"|"preschool"), plan
  ("free"|"premium"), planExpiresAt, planAmount, slug (unique, for branded login links),
  logoUrl (in-app branding), bank account details.
- Every core entity carries societyId (or reaches it via relation) and is filtered by it.
- A labelsFor(user)/org.js helper returns orgType-specific strings for EVERY user-facing label:
  society vs preschool wording (unit=Flat/Student, members, fees, wing, gate, roleAdmin,
  amenities="clubhouse"/"open hall", reportsSub, class options for preschool, etc.).

================================================================================
CORE SOCIETY FEATURES
================================================================================
1. Gate/Visitors: guard logs visitor (photo, flat no, phone, vehicle no, purpose). Resident gets
   push -> approve / deny / leave-at-gate. On approve, visitor added to history. Guard can dictate
   entry by VOICE (Whisper -> parsed fields). Visitor exit tracking (exitAt/exitBy).
2. Maintenance/Bills: admin generates bills; residents pay via Razorpay (full OR partial/installment)
   or mock; a Payment ledger tracks each transaction. Admin can mark CASH payment with collector
   name + phone. Auto PDF receipt emailed to resident on payment + admin notification.
3. Finance dashboard (admin): flat-wise paid/pending status, society balance, dues list, expenses,
   automatic reminders to unpaid members. All aggregates are partial-payment aware
   (effectivePaid/billBalance helpers).
4. Community: Announcements (admin-posted) + Posts (residents post queries/for-sale; admin moderates/deletes).
5. Amenities/Clubhouse booking: admin enables + defines slots (default morning/afternoon/evening + custom)
   and price; resident requests slot -> admin approves -> resident pays in-app. Disabled by default.
6. Reports & backup: wing-wise (A/B/C/D) data export to PDF; automated monthly backup emailed to admin.
7. AI assistant: natural-language queries ("who came to my flat 2 weeks ago", balance, dues). Context is
   enriched with month-aware financials (collectedThisMonth, collectionByMonth) and a society staff
   contact directory so residents can ask "who is my guard/admin" and about future/annual maintenance.
   The assistant is orgType-aware (uses student/school/fees vocabulary for preschools).
8. Payment audit trail: admin (own tenant) and superadmin (any tenant) can open a per-flat/student
   LEDGER showing every bill + every individual payment chronologically with running totals, so any
   miscalculation is traceable from the beginning. Server: buildFlatLedger() in billing.js exposed via
   GET /admin/flats/:id/ledger and /superadmin/flats/:id/ledger; screen: FlatLedgerScreen (flat picker
   + summary + timeline). Reachable from the admin finance dashboard and each society card.
9. Rent management: mark a flat as on-rent (own monthly maintenance amount for rented flats); tenants/
   admins add rent agreements with admin verification; early notifications before agreement expiry.
10. Calendar date pickers: dependency-free, cross-platform. DateField (app/src/components/DateField.js)
    = month-grid day picker with optional minToday (used for reminder dates and amenity/hall booking).
    MonthField (app/src/components/MonthField.js) = year + 12-month grid with optional minCurrent
    (used for "Generate monthly bills" so only the current/future months are selectable).
11. Helpdesk tickets (helpdesk.js; Ticket + TicketComment): a resident raises a ticket (category,
    priority, subject, description); society admins are notified; they reply in a comment thread and
    mark it open→in_progress→resolved with a closing note. Residents track status + full history.
12. Member directory (directory): residents who opt in (User.sharePhone) are listed so neighbours can
    call each other; a one-tap "call the security guard" action. Labels adapt for preschools.
13. Gate Pass — MyGate-style pre-approval (gatepass.js; GatePass): a resident pre-approves an expected
    guest/delivery/cab/service with a short code + validity window; the guard admits by code without
    disturbing the resident; on use the creator gets a "your guest arrived" push. Statuses:
    active/used/expired/cancelled.
14. Buy & Sell marketplace (marketplace.js; Listing + ListingMessage): residents post items (category,
    price, images, location) visible to their own society or ALL societies; buyers message the owner
    in-app (owner gets a push); owner marks sold. Superadmin moderation: view every listing across all
    tenants and disable (status="removed") or delete it (MarketplaceModerationModal). It is a consumer/
    individual feature → available on the Base tier.
15. Late-fee policy (BillingSetting): per-society rule — flat / per-day / percent, with grace days and an
    optional cap. Accrues ONLY on overdue bills and is always 0 once a bill is fully paid, so paying
    several months in advance or on time never picks up a late fee.
16. Maintenance heads (MaintenanceHead): admins split the monthly bill into configurable components
    (Maintenance, Sinking fund, Water, Common area, …); generated bills snapshot a per-head breakdown
    so receipts show the split.
17. Vehicle gate automation — PLATINUM (gate.js; Vehicle + GateDevice + VehicleEntry): residents/admins
    register vehicles, each getting an opaque, revocable/rotatable `code` encoded into a printable QR.
    A gate scanner authenticates with its own deviceKey and calls POST /gate/verify (accepts a scanned
    code AND/OR an ANPR-read plate) or syncs the active whitelist via GET /gate/whitelist to match
    offline; the device fires its own relay to lift the boom barrier when open=true. Software-only
    anti-passback + clone detection: same code at two lanes within IMPOSSIBLE_TRAVEL_SEC = cloned QR
    (deny + alert), re-open within REOPEN_GRACE_SEC = silent, same direction within SAME_DIR_WINDOW_SEC =
    passback (deny). Every read is logged (VehicleEntry) with residents/admins notified; anomalies push a
    "QR blocked — regenerate" alert. Screens: VehiclesScreen (resident/admin), GateDevicesScreen (admin).
- Student CRUD: for preschools, admins add/edit/delete students directly from AdminFeesScreen (a
  student is a Flat). Delete is blocked if linked app accounts (parents) exist.
- Flat/student editor: admins edit any unit's details (FlatEditorModal) and create a login for it
  directly ("Add login"), for both societies and preschools.

================================================================================
PRESCHOOL FEATURES (orgType = "preschool")
================================================================================
- Login copy/background become preschool-themed; society-only text removed.
- Guard flow: just ADDS visitor (NO approval). Button = "Log entry & notify CLO" (CLO = principal);
  stays on same page after submit; visitor auto-approved; all admins notified.
- Flats represent STUDENTS: flatNo = student name/roll; block = selectable Class chip
  (Preschool/Nursery/Jr KG/Sr KG); plus guardianName, guardianPhone, guardianEmail.
- Student fee management (AdminFeesScreen): class-wise students with paid/unpaid status; partial
  payments + remaining dues; set nextDueAmount (e.g. quarterly installment) + remindOn date.
  KPIs: Total / Collected / Pending. "Set fee", "Manage fee", record cash, and "Remind" per student.
- Automated reminders: daily node-cron sweep sends WhatsApp (Meta Cloud API) + email on due dates.
  WhatsApp module (whatsapp.js) has DEV MODE fallback (logs + wa.me tap-to-send link) until
  WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID env vars are set, then it goes LIVE automatically.
  Business number 917841889241; approved template "fee_reminder" with 5 body params in order:
  guardian, school name, student, amount, due date. A GET /admin/whatsapp-status endpoint + a
  "WhatsApp: LIVE/dev mode" badge on the fees screen show current sending state.
- Parents can log in (resident role, labeled "Parent") and pay fees in-app.
- Reports for preschools = visitor log + staff attendance history (StaffAttendance model:
  check-in/check-out), exported to PDF. Amenities relabeled "school open hall booking".
- Assistant tab enabled for preschool admins.

================================================================================
LOGIN BRANDING
================================================================================
- Neutral default login (no Society/Preschool toggle, no sticky behavior).
- Per-tenant slug enables branded deep links: web "/?t=slug", native "h2o://?t=slug"
  (app.json scheme is intentionally still `h2o` for continuity). A public GET /tenant/:slug returns
  name/orgType/slug/logoUrl for auto-branding.
- Because real users install from app stores (not via QR/URL), the tenant "feels like theirs" via
  IN-APP branding: name + logo shown on header/home after login (societyLogoUrl / logoUrl).
- Superadmin can generate branded link + QR and edit each tenant's name/logo.

================================================================================
SUPERADMIN DASHBOARD
================================================================================
- Platform overview: totals (societies, flats, residents/guards/admins, collected, pending, expenses,
  balance), revenue (subscriptions + 10% vendor platform fees), top-pending list.
- Societies list: searchable (name/city), each card shows plan, orgType badge (society/preschool),
  counts, finances, admin emails, branding + share-link + email actions. Cross-platform notify()
  (window.alert on web since RN Alert is a no-op on web).
- SCALE: all cross-society aggregation is pushed to the DATABASE (Prisma groupBy for users/expenses/
  bookings + ONE grouped raw SQL join Bill->Flat for bill totals). Never load all rows into Node.
  Constant memory regardless of tenant/bill count. Still partial-payment aware.
- Month selector on the overview: view collected/pending/billed/revenue for a specific month across ALL
  tenants (MonthField), computed with month-scoped SQL.
- Manage plans (premium subscription, yearly amount), premium invoice emails.
- Product tier per tenant: assign base/prime/platinum (drives in-app feature gating); societies list shows
  a "<Tier> Package" badge instead of free/premium.
- Buy & Sell moderation across all tenants; Backup & recovery panel (see DISASTER RECOVERY below).

================================================================================
PLAN TIERS (customer-facing feature gating)
================================================================================
- Society.tier = "base" | "prime" | "platinum" (defaults to "platinum" so existing tenants keep all
  features until explicitly tiered). Set by the superadmin. app/src/lib/plan.js is the single source of
  truth: TIERS, TIER_RANK/LABEL/COLOR, FEATURE_TIER (feature→minimum tier), hasFeature(user,feature),
  requiredTierLabel, and TIER_FEATURES (human lists for the Plans screen). publicUser serializes
  societyTier so the app can gate locally.
- Base: visitor log, maintenance/fees + online pay, late-fee policy, maintenance heads, Buy & Sell,
  announcements, helpdesk, directory, basic reports/profile.
- Prime: everything in Base + AI Assistant, Gate Pass, amenities/hall booking, WhatsApp+email reminders,
  rent management, automated backups + wing-wise exports.
- Platinum: everything in Prime + automated vehicle gate (QR/ANPR), printable vehicle QR & registry,
  real-time entry/exit logs + notifications, priority support/branding.
- HomeScreen tiles gate on `feature`: locked tiles show a lock + required-tier badge and prompt to
  upgrade instead of navigating. Admins get a "Your plan" tile → customer-facing PlansScreen.

================================================================================
DISASTER RECOVERY (superadmin)
================================================================================
- Full-platform backup (platformBackup.js): dumps EVERY table (incl. bcrypt hashes so logins survive)
  → gzip → optional AES-256-GCM encryption (BACKUP_ENCRYPTION_KEY) → uploads an off-site copy to a
  PRIVATE Supabase Storage bucket (signed URL) → emails the owner a checksum (SHA-256) + link. Each run
  is recorded in BackupLog. Runs weekly (in-process cron, default Sun 02:00) and on demand.
- Triggers: manual POST /api/superadmin/backup/run; external scheduler POST /api/cron/platform-backup
  (x-cron-secret: CRON_SECRET); GET /api/superadmin/backup/download streams a fresh dump; per-society
  backup email/download endpoints reuse the monthly society backup builder.
- App panel: BackupRecoveryScreen (Superadmin → Overview → Backup & recovery) shows a readiness
  checklist (off-site storage / encryption / email / external cron), last backup (time/size/records/
  checksum), history with re-signed download links, one-tap "Run full backup now", and per-society email.
- Restore: server/scripts/restore-platform-backup.js decrypts + verifies + inserts FK-safe (idempotent).
  DISASTER_RECOVERY.md is the step-by-step runbook (Supabase PITR as primary; the encrypted dump as the
  account-loss fallback; a quarterly test-restore drill).

================================================================================
MONETIZATION
================================================================================
- Premium plan per society (yearly fee) unlocks vendor venue marketplace.
- Vendor marketplace: external vendor books society premises; pays via Razorpay Payment Link;
  90% auto-routed to society's linked bank account, 10% platform fee to H2O.
- Onboarding: CSV bulk import + structure generator (wings/flats). The ADMIN (society) controls how
  many wings and flats-per-floor exist for their tenant; superadmin creates the tenant shell.

================================================================================
DATA MODEL (Prisma) — key models
================================================================================
Society(id,name,city,address,active,orgType,plan,planExpiresAt,planAmount,tier,slug@unique,logoUrl,bank fields)
User(id,email@unique,passwordHash,name,phone,role,societyId,flatId,expoPushToken,notifyEnabled,sharePhone,resetOtp*)
Flat(id,flatNo,block,societyId,ownerName,occupancy,rentMaintenanceAmount, guardianName,guardianPhone,guardianEmail)  // Flat==Student for preschool
Visitor(id,name,flatId,phone,vehicleNo,purpose,photoUrl,status, exitAt,exitBy, decidedBy)
StaffAttendance(id,name,role,societyId,date,inAt,outAt)
Bill(id,flatId,period,amount,status, paidAmount,nextDueAmount,remindOn,lastRemindedAt,lateFee,breakdown,
     paymentMode,collectedBy,collectorPhone, payments[])
Payment(id,billId,amount,mode,ref,collectedBy,collectorPhone,createdAt)  // per-transaction ledger
Expense(id,societyId,label,amount,date)
Announcement(id,societyId,title,body,pinned,createdBy) / Post(id,societyId,authorId,category,title,body,price)  // admin can delete
Amenity(id,societyId,name,enabled) / AmenitySlot(price) / Booking(status: requested/approved/paid)
VenueBooking(id,societyId,vendorName,amount,platformFee,societyNet,status,paymentLink*)
RentAgreement(id,flatId,societyId,tenant*,owner*,startDate,endDate,documentUrl,status,lastNotifiedStage)
Ticket(id,societyId,authorId,flatId,category,priority,subject,description,status,resolution) / TicketComment
GatePass(id,societyId,flatId,createdById,guestName,type,code,validFrom,validUntil,status)
Listing(id,societyId,authorId,title,description,price,category,images,visibility,status) / ListingMessage
BillingSetting(id,societyId@unique,lateFeeEnabled,lateFeeType,lateFeeAmount,lateFeeGraceDays,lateFeeMaxAmount)
MaintenanceHead(id,societyId,name,amount,enabled,isDefault,sortOrder)
Vehicle(id,societyId,flatId,type,plate,code@unique,active) / GateDevice(id,societyId,name,deviceKey@unique,active,lastSeenAt)
VehicleEntry(id,societyId,vehicleId,deviceId,plate,code,direction,decision,reason,at)  // gate read log
PlatformSetting(id="platform",contactEmail,bank fields) / PlatformPayment(id,societyId,amount,status)
BackupLog(id,kind,societyId,at,sizeBytes,sha256,url,encrypted,ok,note,stats)  // DR audit
Hot-path indexes: User(societyId,role)+(flatId), Bill(flatId,period)+(status), Visitor(flatId,createdAt),
VehicleEntry(societyId,at)+(vehicleId,at), plus existing per-tenant indexes.

Helpers: billing.js (effectivePaid, billBalance, recordPayment, buildFlatLedger), slug.js (slugify,
ensureUniqueSlug, backfillSlugs on boot), whatsapp.js, feeReminders.js (isDue, guardianContact,
runFeeReminders), rentReminders.js (runRentExpiryChecks), backup.js (society backup + wing reports),
platformBackup.js (full-platform DR dump), cache.js (cacheGet/Set/Del/Wrap), queue.js (enqueuePush/
enqueueEmail + startQueueWorkers), rateLimit.js (globalLimiter/authLimiter/aiLimiter), paging.js
(parsePaging/hasMore), serializers.js (publicUser includes societyOrgType/societyPlan/societyTier/
societyLogoUrl; serializeBill includes paidAmount/balance/lateFee/breakdown/nextDueAmount/remindOn +
payments, status-aware paidAmount for legacy paid bills).

================================================================================
CONVENTIONS & GOTCHAS
================================================================================
- Windows/PowerShell dev: chain commands with ";" not "&&". Backend on port 4000.
- Prisma engine DLL can get locked by antivirus -> stop server before `prisma generate`.
- `prisma db push` warns on new nullable unique columns -> safe, use --accept-data-loss.
- Demo password for all seeded users: Password123. Keep credentials in CREDENTIALS.md (gitignored).
- `npm run db:reset` wipes all tenant data but keeps the superadmin + platform settings (for a clean QA
  slate); it refuses to run if no superadmin remains. `db:setup`/`seed` REPOPULATE demo data — never use
  those for a handoff. Both are destructive on the shared DB; confirm scope before running.
- Consistent styled UI: gradient headers with custom back buttons on inner screens, matching
  receipt/form modals, app icon + splash. Teal palette (#0B6E8F / #0E85AC / #075064).
- Env: DATABASE_URL, JWT_SECRET, GROQ_API_KEY (or OPENAI/OLLAMA), RAZORPAY keys, RESEND/SMTP,
  WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_TEMPLATE, WHATSAPP_LANG,
  WHATSAPP_BUSINESS_NUMBER=917841889241, CRON_SECRET.
  Scaling/DR (all OPTIONAL): REDIS_URL (enables shared cache + BullMQ queue), QUEUE_CONCURRENCY,
  RATE_LIMIT_ENABLED/RATE_LIMIT_MAX/AUTH_RATE_LIMIT_MAX/AI_RATE_LIMIT_MAX, BACKUP_ENCRYPTION_KEY,
  SUPABASE_BACKUP_BUCKET, PLATFORM_BACKUP_CRON_ENABLED/PLATFORM_BACKUP_CRON.
- External cron endpoints (all use header x-cron-secret: CRON_SECRET): POST /api/cron/fee-reminders,
  /api/cron/rent-expiry, /api/cron/monthly-backup, /api/cron/platform-backup.
- Notifications go through the queue (enqueuePush/enqueueEmail) to stay off the request path; the
  background cron reminder jobs still call sendPush/sendEmail directly (already off the request path).

================================================================================
DIFFERENTIATOR FEATURES (competitive moat vs MyGate/ADDA)
================================================================================
- Proactive AI Society/School Manager: deterministic insights engine (insights.js) flags anomalies
  (spend spikes, chronic defaulters, odd-hour gate activity) and AI drafts monthly notices, dues
  reminders and "where your money went" summaries (ai.js: draftManagerText). Admin ManagerScreen.
- Portable Helper & Vendor Trust Passport: cross-society worker identity (Worker/WorkerRating/
  WorkerAttendance) with one QR + network-wide ratings and gate attendance. routes/workers.js.
- Tamper-evident finances + Transparency Score: hash-chained per-society ledger (ledger.js,
  LedgerEntry) over payments/expenses; resident-facing score + money-flow. TransparencyScreen.
- Preschool pickup-safety: parent-authorised pickup QR verified at the gate + live child updates
  (PickupAuthorization/PickupEvent/ChildUpdate). routes/preschool.js, ChildScreen/PickupScreen.
- SOS neighbour mesh: panic button alerts guards/admins/opted-in responders + one-tap ambulance
  (SosAlert/SosResponse, User.isResponder/responderSkill). routes/sos.js, SosScreen.
- Offline-first gate: /gate/whitelist carries a version fingerprint (skip re-download when unchanged)
  + embedded anti-passback policy; /gate/offline-sync batch-ingests reads logged while offline.
- Vernacular voice + spoken notices + IVR fallback: Whisper multilingual guard entry (Devanagari
  digits), /api/ai/translate + expo-speech "Listen" on announcements (mr/hi/en), and a stubbed
  Twilio/Exotel IVR visitor-approval flow (ivr.js, routes/ivr.js; enable purely via env).
- Hyperlocal circular economy: Listing.kind = sale|borrow|skill|group_buy; group buys track
  participants vs a target with auto-notify + organiser roster (ListingJoin). routes/marketplace.js.
- Tier-3 quick wins: Asset & AMC tracker with warranty/service alerts (Asset/AssetLog, routes/
  assets.js), Digital AGM e-voting + quorum + AI minutes (Meeting/Motion/Vote, routes/agm.js),
  Rental compliance loop (RentalCompliance, routes/rental.js), Sustainability green score + per-flat
  water metering (WaterReading, routes/sustainability.js).

================================================================================
YOUR TASK
================================================================================
Recreate and/or extend this app faithfully. Preserve strict multi-tenant isolation, keep society
behavior unchanged when touching preschool logic (and vice versa), keep all financial math
partial-payment aware, keep DB-side aggregation for anything cross-tenant, and keep every user-facing
string driven through the orgType label helper. Gate features by tier via plan.js (hasFeature) rather
than hardcoding. Keep the optional-infra invariant: everything MUST work with NO Redis (in-process
cache/queue fallbacks) and degrade gracefully — cache/queue/email/storage errors must never break a
request. Route user notifications through enqueuePush/enqueueEmail. Paginate new list endpoints with
paging.js and keep responses backward-compatible. When adding features, follow the existing patterns
(routes under server/src/routes, screens under app/src/screens, api client in app/src/lib/api.js).
```
