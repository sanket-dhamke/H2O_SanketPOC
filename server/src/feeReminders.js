import { prisma } from "./prisma.js";
import { effectivePaid, billBalance } from "./billing.js";
import { sendFeeReminder, buildReminderText } from "./whatsapp.js";
import { sendEmail } from "./email.js";

// A bill is "due for reminding" when it has a remindOn date that has arrived,
// it isn't fully paid, and we haven't already reminded for this remindOn date.
function isDue(bill, today) {
  if (!bill.remindOn) return false;
  if (bill.status === "paid") return false;
  const remind = new Date(`${bill.remindOn}T00:00:00`);
  if (isNaN(remind.getTime())) return false;
  if (remind > today) return false;
  // Already reminded on/after this remindOn date? then skip (avoids daily spam).
  if (bill.lastRemindedAt && new Date(bill.lastRemindedAt) >= remind) return false;
  return true;
}

// Picks the guardian contact: prefers explicit guardian fields on the student,
// falls back to the linked parent/resident user's phone/email.
function guardianContact(flat) {
  const parent = (flat.residents || []).find((u) => u.role === "resident") || null;
  return {
    name: flat.guardianName || parent?.name || flat.ownerName || null,
    phone: flat.guardianPhone || parent?.phone || null,
    email: flat.guardianEmail || parent?.email || null,
  };
}

// Loads a society's saved payment details (for the "how to pay" block in the
// reminder). Cached per-society within a single run.
async function payInfoFor(societyId, cache) {
  if (cache.has(societyId)) return cache.get(societyId);
  const acc = await prisma.societyAccount.findFirst({
    where: { societyId, active: true },
    orderBy: { createdAt: "asc" },
  });
  const info = acc
    ? {
        upiId: acc.upiId || null,
        bankName: acc.bankName || null,
        accountName: acc.accountHolderName || null,
        accountNumber: acc.accountNumber || null,
        ifsc: acc.ifsc || null,
      }
    : null;
  cache.set(societyId, info);
  return info;
}

// Sends fee reminders. Two modes:
//  - scheduled (default): only bills whose remindOn date has arrived and that
//    haven't been reminded for that date yet. Used by the daily cron.
//  - includeAllUnpaid=true: remind EVERY student with an outstanding balance
//    right now, regardless of any reminder date. Used by the admin's
//    "Send due reminders now" button so it always reaches pending fees.
// Returns { attempted, sent, results }. Optionally scoped to one societyId.
export async function runFeeReminders({ societyId, includeAllUnpaid = false } = {}) {
  const today = new Date();
  today.setHours(23, 59, 59, 999); // include everything up to end of today

  const bills = await prisma.bill.findMany({
    where: {
      status: { not: "paid" },
      ...(includeAllUnpaid ? {} : { remindOn: { not: null } }),
      ...(societyId ? { flat: { societyId } } : {}),
    },
    include: { flat: { include: { society: true, residents: true } } },
  });

  // In "all unpaid" mode, remind anything with a real outstanding balance;
  // otherwise use the scheduled remindOn gating.
  const due = includeAllUnpaid
    ? bills.filter((b) => billBalance(b) > 0)
    : bills.filter((b) => isDue(b, today));
  const results = [];
  let sent = 0;
  const payCache = new Map();

  for (const bill of due) {
    const flat = bill.flat;
    const orgName = flat?.society?.name || "School";
    const { name: guardian, phone, email } = guardianContact(flat || {});
    const amount = bill.nextDueAmount && bill.nextDueAmount > 0 ? bill.nextDueAmount : billBalance(bill);
    const payInfo = flat?.societyId ? await payInfoFor(flat.societyId, payCache) : null;

    let whatsapp = { sent: false };
    if (phone) {
      whatsapp = await sendFeeReminder({
        toPhone: phone,
        orgName,
        guardian,
        student: flat?.flatNo,
        amount,
        dueDate: bill.remindOn || bill.dueDate,
        payInfo,
      });
    }

    let emailed = false;
    if (email) {
      const text = buildReminderText({ orgName, guardian, student: flat?.flatNo, amount, dueDate: bill.remindOn || bill.dueDate, payInfo });
      try {
        const r = await sendEmail({ to: email, subject: `Fee reminder — ${flat?.flatNo || "student"}`, text });
        emailed = !!(r && (r.delivered || r.dev));
      } catch {}
    }

    // Mark reminded so we don't resend for this remindOn (even in dev/no-contact
    // cases we advance it to avoid re-scanning; admins can reset remindOn later).
    await prisma.bill.update({ where: { id: bill.id }, data: { lastRemindedAt: new Date() } });

    if (whatsapp.sent) sent++;
    results.push({
      billId: bill.id,
      student: flat?.flatNo,
      guardian,
      amount,
      whatsapp: whatsapp.sent ? "sent" : whatsapp.dev ? "dev" : whatsapp.error || "no-phone",
      email: emailed ? "sent" : email ? "failed" : "no-email",
    });
  }

  // Students with dues but no phone AND no email on file — admin should add a
  // guardian contact to reach them.
  const noContact = due
    .filter((b) => {
      const c = guardianContact(b.flat || {});
      return !c.phone && !c.email;
    })
    .map((b) => b.flat?.flatNo)
    .filter(Boolean);

  return { attempted: due.length, sent, emailed: results.filter((r) => r.email === "sent").length, noContact, results };
}
