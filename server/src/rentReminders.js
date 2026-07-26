// Rent-agreement expiry reminders.
//
// For every VERIFIED agreement on a rented flat, we watch its end date and send:
//   - early reminders at ~30, ~15 and ~7 days before expiry, and
//   - an on-expiry notice (which also marks the agreement "expired").
// Recipients are the society admins, the flat owner (their app account) and the
// tenant (email). Each stage fires once, tracked via lastNotifiedStage so cron
// can run daily without spamming.

import { prisma } from "./prisma.js";
import { sendPush } from "./push.js";
import { sendEmail } from "./email.js";

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const end = new Date(`${dateStr}T00:00:00`);
  if (isNaN(end.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((end - today) / 86400000);
}

const RANK = { null: 0, "T-30": 1, "T-15": 2, "T-7": 3, expired: 4 };
const rank = (stage) => RANK[stage ?? "null"] ?? 0;

function stageFor(daysLeft) {
  if (daysLeft == null) return null;
  if (daysLeft < 0) return "expired";
  if (daysLeft <= 7) return "T-7";
  if (daysLeft <= 15) return "T-15";
  if (daysLeft <= 30) return "T-30";
  return null;
}

function buildMessage({ stage, flatNo, tenantName, endDate, daysLeft }) {
  const who = tenantName ? ` (tenant: ${tenantName})` : "";
  if (stage === "expired") {
    return {
      title: `Rent agreement expired — Flat ${flatNo}`,
      body: `The lease for flat ${flatNo}${who} ended on ${endDate}. Please renew the agreement or update the flat's status.`,
    };
  }
  return {
    title: `Rent agreement expiring — Flat ${flatNo}`,
    body: `The lease for flat ${flatNo}${who} ends on ${endDate} — ${daysLeft} day(s) left. Please plan the renewal.`,
  };
}

// Sends the reminder to admins (push+email), the owner's app account (push+email)
// and the tenant (email). Best-effort; missing tokens/emails are skipped.
async function notify({ agreement, flat, message }) {
  const admins = await prisma.user.findMany({
    where: { societyId: agreement.societyId, role: "admin" },
    select: { email: true, expoPushToken: true, notifyEnabled: true },
  });

  const owner = (flat.residents || []).find((u) => u.role === "resident") || null;

  const pushTargets = [...admins, owner].filter((u) => u && u.notifyEnabled && u.expoPushToken);
  await Promise.all(
    pushTargets.map((u) => sendPush(u.expoPushToken, message.title, message.body, { type: "rent_expiry" }))
  );

  const emails = new Set(
    [...admins.map((a) => a.email), owner?.email, agreement.tenantEmail].filter(Boolean)
  );
  await Promise.all(
    [...emails].map((to) =>
      sendEmail({ to, subject: message.title, text: message.body }).catch(() => {})
    )
  );

  return { pushed: pushTargets.length, emailed: emails.size };
}

// Scans verified agreements and fires any newly-due stage. Optionally scope to a
// single society. Returns { checked, notified, results }.
export async function runRentExpiryChecks({ societyId } = {}) {
  const agreements = await prisma.rentAgreement.findMany({
    where: { status: "verified", ...(societyId ? { societyId } : {}) },
    include: { flat: { include: { residents: true } } },
  });

  const results = [];
  let notified = 0;

  for (const a of agreements) {
    const daysLeft = daysUntil(a.endDate);
    const stage = stageFor(daysLeft);
    if (!stage) continue;
    if (rank(stage) <= rank(a.lastNotifiedStage)) continue; // already handled

    const message = buildMessage({
      stage,
      flatNo: a.flat?.flatNo,
      tenantName: a.tenantName,
      endDate: a.endDate,
      daysLeft,
    });

    let delivery = { pushed: 0, emailed: 0 };
    try {
      delivery = await notify({ agreement: a, flat: a.flat || {}, message });
    } catch (e) {
      console.error("[rent] notify failed:", e.message);
    }

    await prisma.rentAgreement.update({
      where: { id: a.id },
      data: {
        lastNotifiedStage: stage,
        lastNotifiedAt: new Date(),
        ...(stage === "expired" ? { status: "expired" } : {}),
      },
    });

    notified++;
    results.push({ id: a.id, flatNo: a.flat?.flatNo, stage, daysLeft, ...delivery });
  }

  return { checked: agreements.length, notified, results };
}
