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

// Sends reminders for every due bill across all societies/preschools. Returns
// a summary { attempted, sent, dev, results }. Safe to call from cron or an
// external scheduler. Optionally scope to a single societyId.
export async function runFeeReminders({ societyId } = {}) {
  const today = new Date();
  today.setHours(23, 59, 59, 999); // include everything up to end of today

  const bills = await prisma.bill.findMany({
    where: {
      remindOn: { not: null },
      status: { not: "paid" },
      ...(societyId ? { flat: { societyId } } : {}),
    },
    include: { flat: { include: { society: true, residents: true } } },
  });

  const due = bills.filter((b) => isDue(b, today));
  const results = [];
  let sent = 0;

  for (const bill of due) {
    const flat = bill.flat;
    const orgName = flat?.society?.name || "School";
    const { name: guardian, phone, email } = guardianContact(flat || {});
    const amount = bill.nextDueAmount && bill.nextDueAmount > 0 ? bill.nextDueAmount : billBalance(bill);

    let whatsapp = { sent: false };
    if (phone) {
      whatsapp = await sendFeeReminder({
        toPhone: phone,
        orgName,
        guardian,
        student: flat?.flatNo,
        amount,
        dueDate: bill.remindOn || bill.dueDate,
      });
    }

    let emailed = false;
    if (email) {
      const text = buildReminderText({ orgName, guardian, student: flat?.flatNo, amount, dueDate: bill.remindOn || bill.dueDate });
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

  return { attempted: due.length, sent, results };
}
