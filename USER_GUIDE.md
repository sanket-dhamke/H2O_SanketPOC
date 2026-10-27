# GATEZO — how to use the app

GATEZO is one app for a housing society or a preschool. The same screens run in a phone browser, and the same project builds the Android and iPhone apps. This guide is what each login can do, and the exact taps.

Install the Android app by opening this on the phone and downloading the file:

**https://h2o-api-5sxc.onrender.com/gatezo.apk**

Android will ask you to allow installs from the browser. The same address without `/gatezo.apk` opens the website. A Play Store or iPhone build is still a separate store release.

The first open after a quiet period can take up to a minute. Render’s free plan sleeps, then wakes.

---

## 1. Who signs in

You do not pick a role on the login screen. The account already has one.

| Login | What they are | Bottom tabs |
|---|---|---|
| Resident / parent | Person in a flat, or a parent | Home, Maintenance (or Fees), Visitors, Community |
| Guard | Gate desk | Home, Gate, Staff, Community, Visitors |
| Society admin | Office of one society or school | Home, Finance (or Fees), Members, Community, Visitors. A preschool also has Staff. |
| GATEZO owner | Runs the whole product | Overview, Societies, Professionals |
| Service professional | Cleaner, AC technician, carpenter, and the other home-service trades | Jobs, Hours, Guide |

A preschool uses different words for the same screens: flat → student, resident → parent, maintenance → fees, society → school, clubhouse → hall.

---

## 2. Sign in, register, reset

1. Open the link above.
2. Enter email and password. Tap **Show** if you want to check the password.
3. Tap **Sign in**.

**New resident.** On the login screen tap **New resident? Register with a join code**. Ask the society admin for the code (it starts with `GM`). Enter the code, flat or student, name, email, and password. An admin must approve you before you can sign in.

**New service professional.** On the same register screen choose **Service professional**. Ask the GATEZO owner for the provider code (it starts with `SP`). A society join code will not work. Pick at least one service you can do. You cannot sign in until the owner approves you, and you will not receive jobs until the owner records your annual pack.

**Forgot password.** Tap **Forgot password**, enter your email, then the one-time code and a new password. The password needs 8 characters, one capital letter, one small letter, and one number.

**Log out.** Open the profile icon on Home (or the header tools) and tap **Logout**.

### Demo logins

Every demo account uses the password `Password123`.

| Email | Who |
|---|---|
| owner@h2o.com | GATEZO owner |
| admin@h2o.com, admin2@h2o.com | Green Valley admins (Pune) |
| guard@h2o.com, guard2@h2o.com | Green Valley guards |
| resident@h2o.com | Aarav Sharma, flat A-101 |
| resident1b@h2o.com | Ananya Sharma, same flat A-101 |
| resident2@h2o.com | Diya Mehta, A-102 |
| resident3@h2o.com | Rohan Kapoor, B-201 |
| admin@skyline.com | Skyline Towers admin (Mumbai) |
| guard@skyline.com | Skyline guard |
| resident@skyline.com | Vikram Rao, S-101 |
| resident2@skyline.com | Neha Gupta, S-102 |
| ac.ravi@gatezo.com | AC professional, higher rating |
| ac.meera@gatezo.com | AC professional |
| clean.anil@gatezo.com | Cleaning, pest, laundry |
| salon.priya@gatezo.com | Salon |
| trades.imran@gatezo.com | Plumbing, electrician, carpentry, instant visits, painting |
| move.neha@gatezo.com | Movers, legal, interiors |
| desk@gatezo.com | House desk. Takes a job only after every other professional has passed |

---

## 3. Resident or parent

### Home

The home page shows your society, charts, and **Needs your attention** (a visitor waiting, a due bill, a Buy & Sell message on your listing). Each attention row can be removed if you do not need it.

**Ask GATEZO** answers from your own live bills and visitors. Examples: “How much maintenance is pending?”, “Who visited last week?”, “How do I book the clubhouse?”. Hindi and Marathi questions are answered too. This reply is built from your records. It is not a paid chat model.

Folders on Home jump to the screens below: visitors, gate pass, vehicle passes, pay bills, clubhouse, transparency, sustainability, AGM, home services, helpdesk, Buy & Sell, trusted helpers, and Help.

### Maintenance / Fees

- Open bills show the period, amount, due date, and any late fee.
- Pay with UPI, card, or net banking through Razorpay. The charge goes to the society account the admin set up. You can pay part of a bill.
- After payment, open the receipt and share it.
- **Transparency** shows where the money went.
- **Sustainability** shows the society green score and your flat’s water reading, when the office has entered meters.
- **Rent agreement** shows the agreement on a rented flat and warns before it expires.

### Visitors

- When the guard logs someone for your flat, you get **Approve**, **Deny**, or **Leave at gate**, with the photo and purpose.
- **Gate pass:** tap +, enter the guest or delivery, and share the code. The guard types that code and lets them in.
- **Vehicle passes:** register a vehicle and its gate QR.

### Community

- **Announcements** from the office, and the neighbours’ board (general, for sale, question, lost & found, recommend).
- **Buy & Sell:** post an item with photos and a price. Another resident taps **Message owner**. Both of you can read that conversation. A new message shows under Needs your attention for the flat that owns the listing, not for the society admin.
- **Home services:** book a visit. See section 7.
- **Helpdesk:** raise a ticket and call the guard or the office from the directory.
- **Trusted helpers:** maids, cooks, and other people the society already knows, separate from GATEZO home-service professionals.
- **Book clubhouse / hall:** pick a date and slot. The admin approves, then you pay if the slot has a price.
- **SOS:** sends an emergency alert.
- **AGM & voting:** vote and read minutes.
- **Help & how-to:** short instructions inside the app.
- **Assistant:** the same Ask GATEZO answers, in a full screen.

---

## 4. Guard

### Home

Shortcuts to log a visitor, see the gate log, and open the directory.

### Gate

1. Take the visitor’s photo. The server shrinks it before it is stored.
2. Choose the flat or student, purpose, phone, and vehicle number.
3. Tap notify. Residents of that flat approve on their phones.
4. **Voice entry** fills the form from what you say, when voice is switched on at the server.
5. **Admit a pre-approved pass:** type the code the resident shared.

### Staff

Check staff and helpers in and out. Preschool guards use the same tab for teachers.

### Visitors

Today’s gate log and each visit’s status: waiting, approved, denied, or left at the gate.

---

## 5. Society admin or preschool admin

You only see your own society. Skyline and Green Valley are separate.

### Home

Tiles for the office, dues, members, the gate log, and Help. **Needs your attention** is for society work (dues, gate, bookings). A private Buy & Sell chat between two flats does not land here.

### Finance / Fees

- Collected, pending, and balance, including older months.
- Generate this month’s bills from one amount or from heads (security, water, sinking fund, and so on). Rented flats can use a different amount.
- Late fee runs only after the due date plus any grace days.
- Remind people who still owe, by the app and by WhatsApp when that is configured.
- Approve clubhouse or hall bookings and set slots and prices.
- **Society office:** moves in and out, vendor bills, and the day-to-day desk.
- **Society manager:** drafts a notice or a dues reminder from the real numbers.
- Reports and the monthly backup email.

### Members

- Add a flat or student and a login, or share the **join code** so residents register themselves. You still approve them.
- Edit, disable, or remove an account.
- Mark a flat as rented, set its maintenance, and store the agreement.
- Enter the society bank account or UPI id that resident payments should reach.
- Bulk import from a spreadsheet.
- Vehicle registry and staff attendance.

### Community and Visitors

Post announcements, moderate the board, handle helpdesk tickets, and read the full gate log.

---

## 6. GATEZO owner

This login is `owner@h2o.com` in the demo. It sees every society.

### Overview

Totals across societies for the month you pick, plus **Backup & recovery**.

**Backup & recovery** builds a full copy of the platform, locks it when `BACKUP_ENCRYPTION_KEY` is set, stores it in a private Supabase bucket, and emails you a link. You can also email one society its own backup.

### Societies

- Add a society or a preschool.
- Add that organisation’s admin, set the plan, the logo, and the login link.
- Open a flat to see its full payment ledger.
- Deactivate an organisation.

### Professionals

This is where home-service people are onboarded.

1. Copy the provider code (`SP…`). Share that, not the society code. You can rotate the code; the old one stops working.
2. Either wait for them to register, or tap add and create the login yourself.
3. **Approve** a waiting registration. Until you do, they cannot sign in.
4. **Record the annual pack** (the demo amount is ₹4,999 for one year). Until this is recorded, they are skipped when a resident books.
5. The **house desk** (`desk@gatezo.com`) does not pay the pack. It is the last stop.

Remove sets the professional inactive so they stop receiving jobs.

---

## 7. Home services and service professionals

### The 11 services

These are the types a professional picks. Carpentry is not its own type. It is a package inside **Plumbing, Electrician & Carpentry**, together with plumbing and electrical work. Anyone who ticks that type can be offered a carpentry job, a plumbing job, or an electrical job.

| Service | Examples you can book |
|---|---|
| Instant Services | Electrician, plumber, or locksmith visit |
| Home Cleaning | 1–3 BHK deep clean, sofa shampoo |
| Packers & Movers | Local move, intercity survey |
| AC Service & Appliances | AC service, gas, fridge, washer, TV, lights, geyser, RO |
| Plumbing, Electrician & Carpentry | Plumbing job, electrical job, carpentry job |
| Home Painting | One room, 2 BHK, colour consult |
| Rent Agreement & Legal | 11-month agreement, notary, legal notice |
| Home Interiors | Design call, kitchen survey, full-home kickoff |
| Home Salon | Blow dry, facial, party makeup |
| Pest Control | General pest, bedbug, termite inspection |
| Laundry Pickup | Wash & fold, iron, dry clean |

### What a resident does

1. Community → **Home services** (or the Home folder).
2. Pick the service and a package.
3. Pick a date and an hour. An hour is shown only when at least one paid professional who does that service is free then. Hours are 9–10 through 19–20, with a break at 13–14.
4. Confirm. You are not choosing a person by name.

### What happens when 10 carpenters exist and one resident books

The job is offered to **one** person, not all 10.

1. GATEZO lines up professionals who listed that service, whose annual pack is paid, who work that weekday and hour, and who are not already on another job in that same hour.
2. The highest rating is offered the job for **60 seconds**.
3. If they accept, it is theirs. The resident then sees a 4-digit **start code**.
4. If they decline, or the 60 seconds pass, the same job moves to the next person. The others do not see it while it is offered to someone else.
5. An unpaid professional is skipped even if their rating is higher.
6. After everyone has passed, the **house desk** accepts so the visit is not left with nobody.

### What the professional does

Tabs: **Jobs**, **Hours**, **Guide**.

1. **Hours.** Set the start, the end, and the days you are off. Sunday is off until you turn it on. Save.
2. **Jobs.** A new offer shows a countdown. Tap accept or pass. The list refreshes on its own.
3. At the flat, ask for the resident’s start code and enter it. The visit is now started, and the resident sees a different **finish code**.
4. When the work is done, enter the finish code and mark it done. A wrong code is rejected.
5. The resident rates the visit from 1 to 5. That rating changes who is offered the next job first.

The house desk uses the same Jobs screen. It does not get the first offer.

---

## 8. What is stored, and what is locked

- Passwords are stored only as a bcrypt hash. The app cannot show the original password.
- Card numbers stay with Razorpay. GATEZO does not keep them.
- Photos are shrunk on the server. With Supabase Storage switched on, the file sits in a storage bucket and the database keeps the link.
- Emails, phone numbers, UPI ids, and bank details are sealed only after `DATA_ENCRYPTION_KEY` is set on Render. Until then those columns are readable in the database. Keep a private copy of that key. Losing it makes the sealed columns unreadable.
- Each society’s residents, bills, and visitors are separate. Home-service professionals are platform accounts, so one AC technician can take a job from Green Valley or from Skyline.

---

## 9. Phone install versus the link

| How you open GATEZO | When it updates |
|---|---|
| Phone or laptop browser at https://h2o-api-5sxc.onrender.com | When `main` is deployed on Render. |
| Android install from https://h2o-api-5sxc.onrender.com/gatezo.apk | When a new APK is published at that address. Installing it replaces the copy on the phone. |
| Play Store and the iPhone app | Only after a new store build is published. |

Android package and iPhone bundle id are both `com.h2o.society`. Apple still needs an Apple Developer account before TestFlight or the App Store. The screens are not rewritten for each store.
