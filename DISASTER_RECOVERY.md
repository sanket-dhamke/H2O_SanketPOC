# GateMate — Disaster Recovery (DR) Runbook

This is the step-by-step guide for the GateMate owner (superadmin) to recover the
platform after data loss, a bad deploy, an accidental delete, or losing the
Supabase/Render account. Keep a copy of this file **off the platform** (print it
or store it in a personal drive) — you may not be able to open the repo during an
incident.

---

## 1. Recovery objectives

| Metric | Target |
| --- | --- |
| **RPO** (max data loss) | ≤ 24h (Supabase daily backup) · ≤ 5 min with PITR on Pro |
| **RTO** (time to restore) | ≤ 1–2 hours |

## 2. Backup layers (3-2-1)

You have **three independent** backups, on **two+ media**, with **one off-site**:

1. **Supabase managed backups (PRIMARY).** Automatic daily backups (Free/Pro) and
   Point-In-Time-Recovery (Pro). This is the fastest, most complete restore path.
2. **Weekly full-platform logical dump (SECONDARY, off-site).** Every table
   (including bcrypt password hashes) → gzip → **AES-256-GCM encrypted** →
   uploaded to a **private storage bucket** and **emailed to the owner** with a
   SHA-256 checksum + download link. Runs weekly and on demand from the app.
   *This is your escape hatch if the entire Supabase account is lost.*
3. **Monthly per-society email backups.** Business snapshot (JSON + CSVs) emailed
   to each society's admins. Good for a single-society mistake.

## 3. One-time setup (do this now, before you need it)

Set these environment variables on the API server (Render → Environment):

| Variable | Purpose |
| --- | --- |
| `BACKUP_ENCRYPTION_KEY` | **Any strong passphrase.** Encrypts the platform dump. **Store it in your password manager — without it the dump cannot be decrypted.** |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | Enables the off-site upload of the encrypted dump. |
| `SUPABASE_BACKUP_BUCKET` | (optional) Private bucket name, default `backups`. |
| `CRON_SECRET` | Shared secret for the external scheduler endpoints. |
| `EMAIL_PROVIDER` + provider keys | So the checksum/link email actually sends. |

Optional schedule overrides: `PLATFORM_BACKUP_CRON` (default `0 2 * * 0` — Sundays
02:00) and `PLATFORM_BACKUP_CRON_ENABLED=false` to disable the in-process weekly job.

**Wake-from-sleep scheduling (recommended on Render Free):** add an external cron
(cron-job.org / GitHub Actions / Render Cron) that calls:

```
POST https://<your-api>/api/cron/platform-backup
Header: x-cron-secret: <CRON_SECRET>
```

Verify readiness in the app: **Superadmin → Overview → Backup & recovery**. All four
readiness rows should say **Ready**.

## 4. Taking a backup on demand

- **In the app:** Superadmin → Overview → **Backup & recovery** → **Run full backup
  now**. You'll get the size, record count, checksum, an off-site link, and an email.
- **Per society:** same screen → **Per-society backup → Email**.
- **From a terminal / CI:** `curl -X POST -H "x-cron-secret: $CRON_SECRET" https://<api>/api/cron/platform-backup`

Always confirm the email arrived and the checksum matches the app.

---

## 5. Restore procedures

### Scenario A — Bad deploy / accidental delete, Supabase account intact (MOST COMMON)

Use **Supabase's own backup** — it's the fastest and most faithful.

1. Supabase Dashboard → your project → **Database → Backups**.
2. **PITR (Pro):** pick a timestamp just *before* the incident → Restore.
   **Daily (Free):** choose the latest good daily backup → Restore.
3. Wait for Supabase to finish, then redeploy/restart the Render API.
4. Verify (section 6).

> If only one society's data is wrong and everything else is fine, prefer restoring
> from that society's monthly email backup rather than rolling back the whole DB.

### Scenario B — Total loss of the Supabase project/account

Rebuild on a fresh Postgres (new Supabase project or any Postgres), then load the
**encrypted weekly dump**.

1. **Create a new database** and set `DATABASE_URL` to it.
2. **Create the schema:** from `server/`, run `npx prisma db push`.
3. **Get the latest dump** from your email (attachment) or the off-site bucket link.
4. **Restore it** (needs the same `BACKUP_ENCRYPTION_KEY` used when it was made):

   ```bash
   cd server
   BACKUP_ENCRYPTION_KEY="<your key>" DATABASE_URL="<new db url>" \
     node scripts/restore-platform-backup.js /path/to/gatemate-platform-*.gmb
   ```

   The script decrypts, verifies, and inserts every table in FK-safe order
   (temporarily disabling FK triggers). It is idempotent (`skipDuplicates`).
5. Point the Render API's `DATABASE_URL` at the new DB and redeploy.
6. Re-create the Supabase Storage buckets if photos/docs were also lost (visitor
   photos and rent docs live in Storage, not the DB — restore those separately from
   Supabase Storage backups if you have them).
7. Verify (section 6).

### Scenario C — Restore a single society

Ask for/open that society's **monthly email backup** (JSON). It's a business
snapshot for reference and manual re-entry, or import selectively. For a full
row-level restore of one society, use Scenario B's dump filtered to that society.

---

## 6. Post-restore verification checklist

- [ ] Superadmin can log in; **Overview** shows the expected society count.
- [ ] One admin per society can log in (password hashes restored).
- [ ] One resident/parent can log in.
- [ ] Spot-check a flat's **payment ledger** — totals match pre-incident.
- [ ] Recent visitors / gate entries present.
- [ ] Run **Backup & recovery → Run full backup now** to confirm the new DB backs up.

## 7. Test-restore drill (do quarterly)

A backup you haven't restored is a hope, not a plan.

1. Spin up a scratch Postgres (local Docker or a throwaway Supabase project).
2. `prisma db push` the schema, then run the restore script against the latest dump.
3. Confirm record counts match the email's reported totals; check a couple of logins.
4. Tear down the scratch DB. Log the date you did this.

## 8. Contacts & credentials

- Supabase project + Render service: see `INFRA.md` (kept out of git).
- `BACKUP_ENCRYPTION_KEY`: your password manager. **Losing it makes dumps unrecoverable.**
- Email provider dashboard: to confirm backup emails are sending.

---

*Backups run weekly automatically and can be triggered any time from the app. The
platform dump is encrypted and emailed off-site so recovery never depends on a
single provider.*
