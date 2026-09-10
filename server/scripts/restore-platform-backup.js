#!/usr/bin/env node
/**
 * Restore a GATEZO full-platform backup produced by platformBackup.js.
 *
 * Usage:
 *   BACKUP_ENCRYPTION_KEY=... DATABASE_URL=<TARGET> \
 *     node scripts/restore-platform-backup.js <path-to-backup> [--yes]
 *
 * IMPORTANT
 *   - Point DATABASE_URL at the TARGET (usually a FRESH / empty) database.
 *   - This inserts rows with skipDuplicates, so it's safe to re-run and safe to
 *     load into an empty schema (run `prisma db push` on the target first).
 *   - It does NOT delete existing rows. To restore into a used DB, wipe first.
 *   - Always test-restore into a scratch database before trusting a backup.
 */
import fs from "fs";
import zlib from "zlib";
import crypto from "crypto";
import readline from "readline";
import { PrismaClient } from "@prisma/client";

const MAGIC = "GMB1";
const prisma = new PrismaClient();

function backupKey() {
  const secret = process.env.BACKUP_ENCRYPTION_KEY || "";
  if (!secret) return null;
  return crypto.createHash("sha256").update(secret).digest();
}

function decodeBackup(buf) {
  const isEncrypted = buf.slice(0, 4).toString() === MAGIC;
  let gz = buf;
  if (isEncrypted) {
    const key = backupKey();
    if (!key) throw new Error("Backup is encrypted — set BACKUP_ENCRYPTION_KEY to the same value used at backup time.");
    const iv = buf.slice(4, 16);
    const tag = buf.slice(16, 32);
    const ct = buf.slice(32);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    gz = Buffer.concat([decipher.update(ct), decipher.final()]);
  }
  const json = zlib.gunzipSync(gz).toString("utf8");
  return JSON.parse(json);
}

function confirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a); }));
}

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  const auto = args.includes("--yes");
  if (!file) {
    console.error("Usage: node scripts/restore-platform-backup.js <backup-file> [--yes]");
    process.exit(1);
  }

  const buf = fs.readFileSync(file);
  const sha = crypto.createHash("sha256").update(buf).digest("hex");
  console.log(`File: ${file}`);
  console.log(`SHA-256: ${sha}`);

  const payload = decodeBackup(buf);
  const models = payload.meta?.models || Object.keys(payload.tables || {});
  console.log(`\nBackup generated: ${payload.meta?.generatedAt}`);
  console.log(`Tables: ${models.length} · Records: ${payload.meta?.totalRows}`);
  console.log(`Target DATABASE_URL host: ${(process.env.DATABASE_URL || "").replace(/:\/\/.*@/, "://***@")}`);

  if (!auto) {
    const ans = await confirm("\nRestore into the TARGET database above? Type 'restore' to proceed: ");
    if (ans.trim() !== "restore") {
      console.log("Aborted.");
      process.exit(0);
    }
  }

  // Disable FK triggers so rows can be inserted in any order (needs sufficient
  // privileges; Supabase's default role usually allows it). Falls back silently.
  let fkDisabled = false;
  try {
    await prisma.$executeRawUnsafe("SET session_replication_role = 'replica'");
    fkDisabled = true;
  } catch (e) {
    console.warn("Could not disable FK triggers (will rely on insert order):", e.message);
  }

  const summary = [];
  for (const model of models) {
    const rows = payload.tables?.[model] || [];
    if (!prisma[model]) {
      console.warn(`- ${model}: no such model in this Prisma client, skipped`);
      continue;
    }
    if (rows.length === 0) {
      summary.push(`${model}: 0`);
      continue;
    }
    try {
      const res = await prisma[model].createMany({ data: rows, skipDuplicates: true });
      summary.push(`${model}: ${res.count}/${rows.length}`);
      console.log(`- ${model}: inserted ${res.count} (of ${rows.length})`);
    } catch (e) {
      console.error(`- ${model}: FAILED — ${e.message}`);
      summary.push(`${model}: ERROR`);
    }
  }

  if (fkDisabled) {
    try { await prisma.$executeRawUnsafe("SET session_replication_role = 'origin'"); } catch {}
  }

  console.log("\nRestore summary:\n  " + summary.join("\n  "));
  console.log("\nDone. Verify a few logins and the superadmin overview before going live.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
