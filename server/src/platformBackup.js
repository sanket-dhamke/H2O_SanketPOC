import zlib from "zlib";
import crypto from "crypto";
import { prisma } from "./prisma.js";
import { sendEmail } from "./email.js";
import { uploadBackup, storageEnabled } from "./storage.js";

// Full-platform disaster-recovery backup. Unlike the per-society monthly email
// backup (a business snapshot), this is a COMPLETE logical dump of every table
// (including bcrypt password hashes, so logins survive a restore). It is gzipped
// and optionally AES-256-GCM encrypted, uploaded to private off-site storage,
// and emailed to the GateMate owner with a checksum + link. Restore with
// scripts/restore-platform-backup.js.

// Prisma client accessors for every model we back up (BackupLog itself excluded).
const MODELS = [
  "society", "platformSetting", "platformPayment", "societyAccount",
  "flat", "user", "amenity", "amenitySlot", "bill", "payment", "expense",
  "visitor", "staffAttendance", "announcement", "post", "ticket", "ticketComment",
  "booking", "rentAgreement", "gatePass", "billingSetting", "maintenanceHead",
  "listing", "listingMessage", "venueBooking", "vehicle", "gateDevice", "vehicleEntry",
];

const MAGIC = "GMB1"; // GateMate Backup v1 (encrypted container header)

// Normalise any passphrase into a 32-byte AES key.
function backupKey() {
  const secret = process.env.BACKUP_ENCRYPTION_KEY || "";
  if (!secret) return null;
  return crypto.createHash("sha256").update(secret).digest();
}

function encryptBuffer(plain) {
  const key = backupKey();
  if (!key) return { buffer: plain, encrypted: false };
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  // [magic(4)][iv(12)][tag(16)][ciphertext]
  return { buffer: Buffer.concat([Buffer.from(MAGIC), iv, tag, ct]), encrypted: true };
}

// Builds the complete backup buffer (gzip [+ encryption]) plus metadata.
export async function buildPlatformBackup() {
  const tables = {};
  const counts = {};
  for (const model of MODELS) {
    if (!prisma[model]) continue;
    const rows = await prisma[model].findMany();
    tables[model] = rows;
    counts[model] = rows.length;
  }
  const totalRows = Object.values(counts).reduce((s, n) => s + n, 0);

  const payload = {
    meta: {
      app: "GateMate",
      type: "platform-backup",
      version: 1,
      generatedAt: new Date().toISOString(),
      models: MODELS,
      counts,
      totalRows,
    },
    tables,
  };

  const json = JSON.stringify(payload);
  const gz = zlib.gzipSync(Buffer.from(json, "utf8"), { level: 9 });
  const { buffer, encrypted } = encryptBuffer(gz);
  const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
  const filename = `gatemate-platform-${stamp}.${encrypted ? "gmb" : "json.gz"}`;

  return { buffer, filename, sha256, encrypted, sizeBytes: buffer.length, counts, totalRows };
}

// Superadmin users + the platform contact email → dedup list of recipients.
async function backupRecipients() {
  const admins = await prisma.user.findMany({ where: { role: "superadmin", active: true }, select: { email: true } });
  const settings = await prisma.platformSetting.findFirst().catch(() => null);
  const list = admins.map((a) => a.email).filter(Boolean);
  if (settings?.contactEmail) list.push(settings.contactEmail);
  return [...new Set(list.map((e) => e.trim().toLowerCase()).filter(Boolean))];
}

const humanSize = (n) => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
};

// Builds, uploads (off-site), emails the owner, and records a BackupLog row.
export async function runPlatformBackup({ trigger = "manual" } = {}) {
  const backup = await buildPlatformBackup();
  const uploaded = storageEnabled ? await uploadBackup(backup.buffer, backup.filename) : null;

  const recipients = await backupRecipients();
  const summary =
    `GateMate FULL PLATFORM backup\n` +
    `Generated: ${new Date().toLocaleString("en-IN")}\n` +
    `Trigger: ${trigger}\n\n` +
    `Records: ${backup.totalRows} across ${Object.keys(backup.counts).length} tables\n` +
    `File: ${backup.filename} (${humanSize(backup.sizeBytes)})\n` +
    `Encrypted: ${backup.encrypted ? "yes (AES-256-GCM)" : "NO — set BACKUP_ENCRYPTION_KEY"}\n` +
    `SHA-256: ${backup.sha256}\n` +
    (uploaded?.url ? `\nDownload (link expires in 7 days):\n${uploaded.url}\n` : "");

  // Attach the file only when small enough for email; otherwise rely on the link.
  const canAttach = backup.sizeBytes <= 8 * 1024 * 1024;
  const attachments = canAttach
    ? [{ filename: backup.filename, content: backup.buffer, contentType: "application/octet-stream" }]
    : [];

  let delivered = false;
  let dev = false;
  for (const to of recipients) {
    const r = await sendEmail({
      to,
      subject: `GateMate platform backup — ${new Date().toISOString().slice(0, 10)}`,
      text: summary,
      html: `<h2>GateMate full platform backup</h2><pre style="font-family:monospace">${summary}</pre>` +
        (canAttach ? `<p>The encrypted backup is attached.</p>` : `<p><b>Backup too large to attach</b> — use the download link above.</p>`),
      attachments,
    });
    delivered = delivered || r.delivered;
    dev = dev || r.dev;
  }

  const log = await prisma.backupLog.create({
    data: {
      kind: "platform",
      sizeBytes: backup.sizeBytes,
      sha256: backup.sha256,
      url: uploaded?.path || null, // store the storage PATH; re-sign on demand
      encrypted: backup.encrypted,
      ok: true,
      note: `${trigger} · ${recipients.length} recipient(s) · ${delivered ? "emailed" : dev ? "dev-mode" : "email-failed"}${uploaded ? "" : " · no off-site upload"}`,
      stats: { counts: backup.counts, totalRows: backup.totalRows },
    },
  });

  return {
    ok: true,
    filename: backup.filename,
    sizeBytes: backup.sizeBytes,
    sha256: backup.sha256,
    encrypted: backup.encrypted,
    totalRows: backup.totalRows,
    counts: backup.counts,
    uploaded: !!uploaded,
    downloadUrl: uploaded?.url || null,
    storagePath: uploaded?.path || null,
    emailed: delivered,
    emailDev: dev,
    recipients: recipients.length,
    logId: log.id,
    at: log.at,
  };
}

// Runs the platform backup and never throws (for schedulers). Logs failures.
export async function runPlatformBackupSafe(opts) {
  try {
    return await runPlatformBackup(opts);
  } catch (e) {
    console.error("[platform-backup] failed:", e.message);
    try {
      await prisma.backupLog.create({ data: { kind: "platform", ok: false, note: `error: ${e.message}` } });
    } catch {}
    return { ok: false, error: e.message };
  }
}
