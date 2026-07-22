# WhatsApp fee reminders — Meta Cloud API setup

This turns the **automated** WhatsApp reminders in GateMate from "dev mode"
(logs a message + gives a `wa.me` click‑to‑send link) into real, hands‑off
messages sent by Meta on a schedule.

Until the env vars below are set, everything still works in **dev mode** — the
app logs the intended message and shows a tap-to-send `wa.me` link, so you can
demo without any Meta account.

---

## What you need (one‑time, ~30–60 min + Meta review)

1. A **Meta (Facebook) Business account** — https://business.facebook.com
2. A phone number for WhatsApp that is **not** already on a normal WhatsApp /
   WhatsApp Business app. (Your display number is **+91 78418 89241**.)
3. A **Meta for Developers** app with the *WhatsApp* product added.

> Meta must **verify your business** and **approve your message template**
> before business‑initiated messages send. Approval is usually minutes–hours.

---

## Step 1 — Create the app & add WhatsApp

1. Go to https://developers.facebook.com/apps → **Create app** → type
   **Business** → finish.
2. In the app dashboard, **Add product → WhatsApp → Set up**.
3. Pick (or create) your **Business portfolio** when prompted.

You now get a **test number** for free. Use it to try everything before you
add the real +91 78418 89241 number.

## Step 2 — Grab the IDs you need

On **WhatsApp → API Setup**:

| You see on the page            | Env var                     |
|--------------------------------|-----------------------------|
| **Phone number ID**            | `WHATSAPP_PHONE_NUMBER_ID`  |
| Temporary access token (24h)   | `WHATSAPP_TOKEN` (for now)  |
| The display number (78418…)    | `WHATSAPP_BUSINESS_NUMBER`  |

> ⚠️ `WHATSAPP_PHONE_NUMBER_ID` is the long numeric **ID**, NOT the phone
> number itself.

## Step 3 — Create a PERMANENT token (so it doesn't expire in 24h)

1. https://business.facebook.com → **Settings → Users → System users**.
2. **Add** a system user → role **Admin**.
3. **Assign assets** → your WhatsApp app → give **Full control**.
4. **Generate new token** → select the app → permissions
   **`whatsapp_business_messaging`** and **`whatsapp_business_management`** →
   generate. **Copy it now** — this is your permanent `WHATSAPP_TOKEN`.

## Step 4 — Create the message template (must match the code)

**WhatsApp Manager → Account tools → Message templates → Create template.**

- **Category:** `Utility`
- **Name:** `fee_reminder`  → this is `WHATSAPP_TEMPLATE`
- **Language:** English → `en`  → this is `WHATSAPP_LANG`
- **Body** — copy this EXACTLY (5 variables, in this order):

  ```
  Dear {{1}}, this is a fee reminder from {{2}}.
  Student: {{3}}
  Amount due: {{4}}
  Due date: {{5}}
  Please pay at your earliest convenience. Thank you.
  ```

- **Sample values** (Meta requires examples to approve):
  `{{1}}=Rahul Sharma`, `{{2}}=Little Millennium`, `{{3}}=Aarav Sharma`,
  `{{4}}=₹30,000`, `{{5}}=25 Jul 2026`

> The code sends the 5 body parameters in exactly this order:
> **1 guardian, 2 school name, 3 student, 4 amount, 5 due date**
> (see `server/src/whatsapp.js` → `sendFeeReminder`). If you change the
> wording that's fine — just keep 5 variables in the same order.

Submit → wait for **Approved**.

## Step 5 — Set the env vars on the server

Local (`server/.env`) or your host (Render → Environment):

```
WHATSAPP_TOKEN=EAAG...your-permanent-token...
WHATSAPP_PHONE_NUMBER_ID=123456789012345
WHATSAPP_TEMPLATE=fee_reminder
WHATSAPP_LANG=en
WHATSAPP_BUSINESS_NUMBER=917841889241
# optional, defaults to v20.0
# WHATSAPP_GRAPH_VERSION=v20.0
```

Restart the server. On boot, `whatsappEnabled` becomes `true` automatically
(it's `Boolean(TOKEN && PHONE_NUMBER_ID)`), so reminders now go out for real.

## Step 6 — Test it

1. **Add the recipient's number as a tester** in the app (only needed while
   your app is in *development*; a verified/live app can message anyone who
   opted in). API Setup → *To* field → add number → confirm the code.
2. From the app: **Admin → Student fees → Remind** on any student, or hit the
   manual sweep endpoint:

   ```bash
   curl -X POST https://YOUR-API/api/admin/fees/run-reminders \
     -H "Authorization: Bearer <admin-jwt>"
   ```
3. You should receive the WhatsApp message. If not, check server logs — a
   failed send logs `[whatsapp] send failed: <reason>` and the app still
   returns a `wa.me` fallback link.

---

## How automation runs (already built)

- A daily **cron** (`node-cron` in `server/src/index.js`) calls
  `runFeeReminders()` in `server/src/feeReminders.js`.
- It picks bills whose `remindOn` date is due (and not already reminded today),
  builds guardian/student/amount/dueDate, and calls `sendFeeReminder`.
- It also tries email (`server/src/email.js`) when a guardian email exists.
- External schedulers (e.g. Render Cron, cron-job.org) can instead hit:
  `POST /api/cron/fee-reminders` with header `x-cron-key: <CRON_KEY>`.

## Going live to everyone (not just testers)

1. **WhatsApp Manager → complete Business Verification.**
2. Move the app from *Development* to *Live* (App dashboard toggle).
3. Register/verify the real number **+91 78418 89241** on the Cloud API
   (API Setup → add phone number → verify by SMS/voice), then use its
   **Phone number ID** for `WHATSAPP_PHONE_NUMBER_ID`.

## Costs & rules (quick notes)

- Business‑initiated **Utility** template messages are billed per conversation
  by Meta (a few paise–rupees each in India; free tier for the first 1,000
  service conversations/month).
- Business‑initiated messages **must** use an approved template. Free‑form text
  is only allowed inside the 24‑hour window after the user messages you.
- Keep numbers **opted‑in**; template category must be `Utility` for reminders
  (not `Marketing`) to avoid extra restrictions.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Messages log `[whatsapp:dev]` and never arrive | `WHATSAPP_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` not set — still dev mode. |
| `(#132001) Template name does not exist` | Template not **Approved**, or `WHATSAPP_TEMPLATE` / `WHATSAPP_LANG` don't match the approved name/language. |
| `(#131030) Recipient not in allowed list` | App still in Development — add the number as a tester, or go Live. |
| `(#190) access token expired` | You used the 24h token — create the **permanent** system-user token (Step 3). |
| `Number of parameters does not match` | Template body must have exactly **5** `{{ }}` variables in the order above. |
