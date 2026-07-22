# GateMate — Master Build Prompt

Paste the block below into any fresh agent window to reconstruct or continue this app.
It captures the full scope of what has been built so far.

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
- Per-tenant slug enables branded deep links: web "/?t=slug", native "gatemate://?t=slug"
  (app.json scheme). A public GET /tenant/:slug returns name/orgType/slug/logoUrl for auto-branding.
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
- Manage plans (premium subscription, yearly amount), premium invoice emails.

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
Society(id,name,city,address,active,orgType,plan,planExpiresAt,planAmount,slug@unique,logoUrl,bank fields)
User(id,email@unique,passwordHash,name,phone,role,societyId,expoPushToken,notifPref)
Flat(id,flatNo,block,societyId,ownerName, guardianName,guardianPhone,guardianEmail)  // Flat==Student for preschool
Visitor(id,name,flatId,phone,vehicleNo,purpose,photoUrl,status,societyId, exitAt,exitBy, decisionBy)
StaffAttendance(id,staffName,societyId,checkInAt,checkOutAt)
Bill(id,flatId,period,amount,status, paidAmount,nextDueAmount,remindOn,lastRemindedAt,
     paymentMode,collectedBy,collectorPhone, payments[])
Payment(id,billId,amount,mode,ref,collectedBy,collectorPhone,createdAt)  // per-transaction ledger
Expense(id,societyId,amount,category,note,date)
Announcement(id,societyId,title,body,createdBy)
Post(id,societyId,authorId,body,createdAt)  // admin can delete
Amenity(id,societyId,name,price,enabled) / AmenitySlot / Booking(status: requested/approved/paid)
VenueBooking(id,societyId,vendorName,amount,platformFee,status)

Helpers: billing.js (effectivePaid, billBalance, recordPayment), slug.js (slugify, ensureUniqueSlug,
backfillSlugs on boot), whatsapp.js, feeReminders.js (isDue, guardianContact, runFeeReminders),
serializers.js (publicUser includes societyOrgType/societyPlan/societyLogoUrl; serializeBill includes
paidAmount/balance/nextDueAmount/remindOn + payments, status-aware paidAmount for legacy paid bills).

================================================================================
CONVENTIONS & GOTCHAS
================================================================================
- Windows/PowerShell dev: chain commands with ";" not "&&". Backend on port 4000.
- Prisma engine DLL can get locked by antivirus -> stop server before `prisma generate`.
- `prisma db push` warns on new nullable unique columns -> safe, use --accept-data-loss.
- Demo password for all seeded users: Password123. Keep credentials in CREDENTIALS.md (gitignored).
- Consistent styled UI: gradient headers with custom back buttons on inner screens, matching
  receipt/form modals, app icon + splash. Teal palette (#0B6E8F / #0E85AC / #075064).
- Env: DATABASE_URL, JWT_SECRET, GROQ_API_KEY (or OPENAI/OLLAMA), RAZORPAY keys, RESEND/SMTP,
  WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_TEMPLATE, WHATSAPP_LANG,
  WHATSAPP_BUSINESS_NUMBER=917841889241, CRON_KEY.
- External cron can hit POST /api/cron/fee-reminders with header x-cron-key.

================================================================================
YOUR TASK
================================================================================
Recreate and/or extend this app faithfully. Preserve strict multi-tenant isolation, keep society
behavior unchanged when touching preschool logic (and vice versa), keep all financial math
partial-payment aware, keep DB-side aggregation for anything cross-tenant, and keep every user-facing
string driven through the orgType label helper. When adding features, follow the existing patterns
(routes under server/src/routes, screens under app/src/screens, api client in app/src/lib/api.js).
```
