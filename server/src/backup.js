import { prisma } from "./prisma.js";
import { sendEmail } from "./email.js";

// ---------- helpers ----------
const money = (n) => `INR ${Number(n || 0).toLocaleString("en-IN")}`;
const currentPeriod = () => new Date().toISOString().slice(0, 7); // YYYY-MM
const csvCell = (v) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (headers, rows) =>
  [headers.join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\n");

// Loads everything for a society (used by both the backup and the wing report).
async function loadSocietyData(societyId) {
  const [society, flats, users, bills, expenses, visitors, bookings, announcements, posts, account] =
    await Promise.all([
      prisma.society.findUnique({ where: { id: societyId } }),
      prisma.flat.findMany({ where: { societyId }, orderBy: [{ block: "asc" }, { flatNo: "asc" }] }),
      prisma.user.findMany({ where: { societyId }, include: { flat: true } }),
      prisma.bill.findMany({ where: { flat: { societyId } }, include: { flat: true }, orderBy: { period: "desc" } }),
      prisma.expense.findMany({ where: { societyId }, orderBy: { date: "desc" } }),
      prisma.visitor.findMany({ where: { flat: { societyId } }, include: { flat: true }, orderBy: { createdAt: "desc" }, take: 1000 }),
      prisma.booking.findMany({ where: { societyId }, include: { amenity: true, slot: true, resident: { include: { flat: true } } }, orderBy: { createdAt: "desc" } }),
      prisma.announcement.findMany({ where: { societyId }, orderBy: { createdAt: "desc" } }),
      prisma.post.findMany({ where: { societyId }, include: { author: { include: { flat: true } } }, orderBy: { createdAt: "desc" } }),
      prisma.societyAccount.findFirst({ where: { societyId } }),
    ]);
  return { society, flats, users, bills, expenses, visitors, bookings, announcements, posts, account };
}

// Aggregate paid/pending per flat.
function duesByFlat(bills) {
  const map = new Map();
  for (const b of bills) {
    const row = map.get(b.flatId) || { paid: 0, pending: 0 };
    if (b.status === "paid") row.paid += b.amount;
    else row.pending += b.amount;
    map.set(b.flatId, row);
  }
  return map;
}

/* ============================ Full backup =============================== */
// Builds a complete, machine-readable JSON backup + human-friendly CSVs for a
// society. Passwords are never included.
export async function buildSocietyBackup(societyId, { period = currentPeriod() } = {}) {
  const d = await loadSocietyData(societyId);
  if (!d.society) throw new Error("Society not found");

  const collected = d.bills.filter((b) => b.status === "paid").reduce((s, b) => s + b.amount, 0);
  const pending = d.bills.filter((b) => b.status !== "paid").reduce((s, b) => s + b.amount, 0);
  const totalExpenses = d.expenses.reduce((s, e) => s + e.amount, 0);
  const stats = {
    flats: d.flats.length,
    residents: d.users.filter((u) => u.role === "resident").length,
    guards: d.users.filter((u) => u.role === "guard").length,
    admins: d.users.filter((u) => u.role === "admin").length,
    collected,
    pending,
    expenses: totalExpenses,
    balance: collected - totalExpenses,
    visitors: d.visitors.length,
    bookings: d.bookings.length,
  };

  const acctMasked = d.account
    ? {
        accountHolderName: d.account.accountHolderName,
        bankName: d.account.bankName,
        accountLast4: (d.account.accountNumber || "").slice(-4),
        upiId: d.account.upiId,
      }
    : null;

  const json = {
    meta: { app: "H2O", type: "society-backup", period, generatedAt: new Date().toISOString() },
    society: { name: d.society.name, city: d.society.city, address: d.society.address, active: d.society.active },
    stats,
    flats: d.flats.map((f) => ({ flatNo: f.flatNo, block: f.block, ownerName: f.ownerName })),
    users: d.users.map((u) => ({ name: u.name, email: u.email, phone: u.phone, role: u.role, flatNo: u.flat?.flatNo || null, active: u.active })),
    bills: d.bills.map((b) => ({ flatNo: b.flat?.flatNo, period: b.period, amount: b.amount, status: b.status, dueDate: b.dueDate, paidAt: b.paidAt, paymentMode: b.paymentMode, collectedBy: b.collectedBy, collectorPhone: b.collectorPhone, paymentRef: b.paymentRef })),
    expenses: d.expenses.map((e) => ({ label: e.label, amount: e.amount, date: e.date })),
    visitors: d.visitors.map((v) => ({ name: v.name, flatNo: v.flat?.flatNo, phone: v.phone, vehicleNo: v.vehicleNo, purpose: v.purpose, status: v.status, at: v.createdAt })),
    bookings: d.bookings.map((b) => ({ amenity: b.amenity?.name, slot: b.slot?.label, date: b.date, status: b.status, amount: b.amount, resident: b.resident?.name, flatNo: b.resident?.flat?.flatNo })),
    announcements: d.announcements.map((a) => ({ title: a.title, body: a.body, authorName: a.authorName, at: a.createdAt })),
    posts: d.posts.map((p) => ({ category: p.category, title: p.title, body: p.body, author: p.author?.name, flatNo: p.author?.flat?.flatNo, at: p.createdAt })),
    bankAccount: acctMasked,
  };

  const billsCsv = toCsv(
    ["Flat", "Period", "Amount", "Status", "Due date", "Paid at", "Mode", "Collected by", "Collector phone", "Ref"],
    d.bills.map((b) => [b.flat?.flatNo, b.period, b.amount, b.status, b.dueDate, b.paidAt ? new Date(b.paidAt).toISOString() : "", b.paymentMode || "", b.collectedBy || "", b.collectorPhone || "", b.paymentRef || ""])
  );
  const expensesCsv = toCsv(
    ["Label", "Amount", "Date"],
    d.expenses.map((e) => [e.label, e.amount, e.date ? new Date(e.date).toISOString() : ""])
  );

  const summaryText =
    `H2O backup — ${d.society.name} (${period})\n` +
    `Generated: ${new Date().toLocaleString("en-IN")}\n\n` +
    `Flats: ${stats.flats} | Residents: ${stats.residents} | Guards: ${stats.guards} | Admins: ${stats.admins}\n` +
    `Collected: ${money(stats.collected)} | Pending dues: ${money(stats.pending)}\n` +
    `Expenses: ${money(stats.expenses)} | Balance: ${money(stats.balance)}\n` +
    `Visitors logged: ${stats.visitors} | Bookings: ${stats.bookings}\n`;

  const slug = d.society.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  return {
    society: d.society,
    stats,
    json,
    summaryText,
    attachments: [
      { filename: `H2O-${slug}-${period}-backup.json`, content: JSON.stringify(json, null, 2), contentType: "application/json" },
      { filename: `H2O-${slug}-${period}-payments.csv`, content: billsCsv, contentType: "text/csv" },
      { filename: `H2O-${slug}-${period}-expenses.csv`, content: expensesCsv, contentType: "text/csv" },
    ],
  };
}

// Emails the backup to every admin of the society. Returns delivery info.
export async function emailSocietyBackup(societyId, { period = currentPeriod() } = {}) {
  const backup = await buildSocietyBackup(societyId, { period });
  const admins = await prisma.user.findMany({ where: { societyId, role: "admin", active: true } });
  const recipients = admins.map((a) => a.email).filter(Boolean);
  if (recipients.length === 0) return { admins: 0, delivered: false, dev: false, message: "No admin email found" };

  const subject = `H2O backup — ${backup.society.name} — ${period}`;
  const html =
    `<h2>H2O monthly backup</h2>` +
    `<p><b>${backup.society.name}</b> — ${period}</p>` +
    `<pre style="font-family:monospace">${backup.summaryText}</pre>` +
    `<p>Attached: full data backup (JSON), payments (CSV) and expenses (CSV). Keep this for your records.</p>`;

  let delivered = false;
  let dev = false;
  for (const to of recipients) {
    const r = await sendEmail({ to, subject, text: backup.summaryText, html, attachments: backup.attachments });
    delivered = delivered || r.delivered;
    dev = dev || r.dev;
  }
  return { admins: recipients.length, recipients, delivered, dev, stats: backup.stats };
}

// Runs the monthly backup for every active society. Called by the scheduler.
export async function runMonthlyBackups() {
  const period = currentPeriod();
  const societies = await prisma.society.findMany({ where: { active: true }, select: { id: true, name: true } });
  const results = [];
  for (const s of societies) {
    try {
      const r = await emailSocietyBackup(s.id, { period });
      results.push({ society: s.name, ...r });
    } catch (e) {
      results.push({ society: s.name, error: e.message });
    }
  }
  console.log(`[backup] monthly run for ${period}:`, JSON.stringify(results));
  return { period, results };
}

/* =========================== Wing-wise report ========================== */
// Returns the distinct blocks/wings in a society (for the admin's picker).
export async function listBlocks(societyId) {
  const flats = await prisma.flat.findMany({ where: { societyId }, select: { block: true } });
  const set = new Set(flats.map((f) => (f.block || "").trim()).filter(Boolean));
  return [...set].sort();
}

// Builds a wing (block) report. block="__all__" (or falsy) => whole society.
export async function buildWingReport(societyId, { block } = {}) {
  const d = await loadSocietyData(societyId);
  if (!d.society) throw new Error("Society not found");

  const wing = block && block !== "__all__" ? block : null;
  const flats = wing ? d.flats.filter((f) => (f.block || "") === wing) : d.flats;
  const flatIds = new Set(flats.map((f) => f.id));
  const bills = d.bills.filter((b) => flatIds.has(b.flatId));
  const dues = duesByFlat(bills);
  const residentsByFlat = new Map();
  for (const u of d.users) {
    if (u.role === "resident" && u.flatId && flatIds.has(u.flatId)) {
      const arr = residentsByFlat.get(u.flatId) || [];
      arr.push({ name: u.name, phone: u.phone, email: u.email });
      residentsByFlat.set(u.flatId, arr);
    }
  }

  const flatRows = flats.map((f) => {
    const dd = dues.get(f.id) || { paid: 0, pending: 0 };
    return {
      flatNo: f.flatNo,
      block: f.block,
      ownerName: f.ownerName,
      residents: residentsByFlat.get(f.id) || [],
      paid: dd.paid,
      pending: dd.pending,
    };
  });

  const collected = flatRows.reduce((s, r) => s + r.paid, 0);
  const pending = flatRows.reduce((s, r) => s + r.pending, 0);
  const visitors = wing ? d.visitors.filter((v) => flatIds.has(v.flatId)) : d.visitors;
  const bookings = wing ? d.bookings.filter((b) => b.resident?.flatId && flatIds.has(b.resident.flatId)) : d.bookings;

  return {
    society: { name: d.society.name, city: d.society.city, address: d.society.address },
    wing: wing || "All wings",
    generatedAt: new Date().toISOString(),
    totals: {
      flats: flatRows.length,
      residents: flatRows.reduce((s, r) => s + r.residents.length, 0),
      collected,
      pending,
    },
    flats: flatRows,
    payments: bills
      .filter((b) => b.status === "paid")
      .slice(0, 500)
      .map((b) => ({ flatNo: b.flat?.flatNo, period: b.period, amount: b.amount, paidAt: b.paidAt, mode: b.paymentMode || "online", collectedBy: b.collectedBy })),
    dues: flatRows
      .filter((r) => r.pending > 0)
      .map((r) => ({ flatNo: r.flatNo, ownerName: r.ownerName, pending: r.pending })),
    recentVisitors: visitors.slice(0, 100).map((v) => ({ name: v.name, flatNo: v.flat?.flatNo, purpose: v.purpose, status: v.status, at: v.createdAt })),
    bookings: bookings.slice(0, 100).map((b) => ({ amenity: b.amenity?.name, slot: b.slot?.label, date: b.date, status: b.status, amount: b.amount, flatNo: b.resident?.flat?.flatNo, resident: b.resident?.name })),
  };
}
