import { prisma } from "./prisma.js";
import { effectivePaid, billBalance } from "./billing.js";

// Deterministic "Society Manager" insight engine. Computes a proactive snapshot
// of a society's health — finance deltas, defaulters, security/ops anomalies —
// entirely from the DB (no AI needed, so it works even when AI is disabled).
// The AI layer (ai.js) only turns these facts into polished prose.

const pad2 = (n) => String(n).padStart(2, "0");
const periodOfDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;

function shiftPeriod(period, deltaMonths) {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(y, m - 1 + deltaMonths, 1);
  return periodOfDate(d);
}

function pct(cur, base) {
  if (!base) return null;
  return Math.round(((cur - base) / base) * 100);
}

const inr = (n) => `₹${Math.round(n || 0).toLocaleString("en-IN")}`;

// Localised nouns so preschool tenants never see "flat/society/maintenance".
function vocab(orgType) {
  return orgType === "preschool"
    ? { unit: "student", units: "students", fees: "fees", org: "school" }
    : { unit: "flat", units: "flats", fees: "maintenance", org: "society" };
}

export async function computeSocietyInsights(societyId) {
  const now = new Date();
  const currentPeriod = periodOfDate(now);
  const prevPeriod = shiftPeriod(currentPeriod, -1);

  const [society, flats, bills, expenses, openTickets, pendingBookings, pendingApprovals, agreements, devices, recentVisitors] =
    await Promise.all([
      prisma.society.findUnique({ where: { id: societyId }, select: { name: true, orgType: true, tier: true } }),
      prisma.flat.findMany({ where: { societyId }, select: { id: true, flatNo: true, block: true } }),
      prisma.bill.findMany({ where: { flat: { societyId } }, select: { flatId: true, period: true, amount: true, status: true, paidAmount: true, lateFee: true, dueDate: true } }),
      prisma.expense.findMany({ where: { societyId }, select: { amount: true, date: true, label: true } }),
      prisma.ticket.findMany({ where: { societyId, status: { in: ["open", "in_progress"] } }, select: { createdAt: true, subject: true } }),
      prisma.booking.count({ where: { societyId, status: "requested" } }),
      prisma.user.count({ where: { societyId, pendingApproval: true } }),
      prisma.rentAgreement.findMany({ where: { societyId, status: "verified" }, select: { endDate: true, tenantName: true } }),
      prisma.gateDevice.findMany({ where: { societyId, active: true }, select: { name: true, lastSeenAt: true, createdAt: true } }),
      prisma.visitor.findMany({ where: { flat: { societyId }, createdAt: { gte: new Date(now.getTime() - 7 * 864e5) } }, select: { createdAt: true } }),
    ]);

  const orgType = society?.orgType === "preschool" ? "preschool" : "society";
  const v = vocab(orgType);
  const flatById = new Map(flats.map((f) => [f.id, f]));

  // ---- Finance: per-period billed / collected / pending ----
  let totalCollected = 0;
  let totalPending = 0;
  const byPeriod = new Map(); // period -> { billed, collected, pending }
  const dueByFlat = new Map(); // flatId -> { months:Set, balance }
  for (const b of bills) {
    const paid = effectivePaid(b);
    const bal = billBalance(b);
    totalCollected += paid;
    totalPending += bal;
    const p = b.period || "unknown";
    const row = byPeriod.get(p) || { billed: 0, collected: 0, pending: 0 };
    row.billed += b.amount || 0;
    row.collected += paid;
    row.pending += bal;
    byPeriod.set(p, row);
    if (bal > 0.5) {
      const d = dueByFlat.get(b.flatId) || { months: new Set(), balance: 0 };
      d.months.add(p);
      d.balance += bal;
      dueByFlat.set(b.flatId, d);
    }
  }
  const cur = byPeriod.get(currentPeriod) || { billed: 0, collected: 0, pending: 0 };
  const prev = byPeriod.get(prevPeriod) || { billed: 0, collected: 0, pending: 0 };

  // ---- Expenses: this month vs trailing 3-month average ----
  const expByPeriod = new Map();
  for (const e of expenses) {
    const p = periodOfDate(new Date(e.date));
    expByPeriod.set(p, (expByPeriod.get(p) || 0) + (e.amount || 0));
  }
  const expThisMonth = expByPeriod.get(currentPeriod) || 0;
  const prior3 = [1, 2, 3].map((k) => expByPeriod.get(shiftPeriod(currentPeriod, -k)) || 0);
  const expAvg3 = prior3.reduce((s, x) => s + x, 0) / 3;
  const totalExpenses = expenses.reduce((s, e) => s + (e.amount || 0), 0);

  // ---- Defaulters (2+ months outstanding), worst first ----
  const defaulters = [...dueByFlat.entries()]
    .map(([flatId, d]) => ({ flatNo: flatById.get(flatId)?.flatNo || "?", block: flatById.get(flatId)?.block || null, months: d.months.size, amount: Math.round(d.balance) }))
    .filter((d) => d.months >= 2)
    .sort((a, b) => b.amount - a.amount);

  // ---- Ops counts ----
  const WEEK = 7 * 864e5;
  const agingTickets = openTickets.filter((t) => now - new Date(t.createdAt) > WEEK).length;
  const expiringAgreements = agreements.filter((a) => {
    const end = new Date(a.endDate);
    const days = (end - now) / 864e5;
    return days >= 0 && days <= 30;
  }).length;
  const overnight = recentVisitors.filter((x) => {
    const h = new Date(x.createdAt).getHours();
    return h >= 0 && h < 5;
  }).length;
  const staleDevices = devices.filter((d) => {
    const seen = d.lastSeenAt ? new Date(d.lastSeenAt) : null;
    const ref = seen || new Date(d.createdAt);
    return now - ref > 864e5; // no contact in 24h
  });

  // ---- Alerts (color-coded, ordered by severity) ----
  const alerts = [];
  const defAmt = defaulters.reduce((s, d) => s + d.amount, 0);
  const chronic = defaulters.filter((d) => d.months >= 3);
  if (chronic.length) {
    alerts.push({ level: "critical", icon: "alert-circle", title: `${chronic.length} ${chronic.length === 1 ? v.unit : v.units} unpaid 3+ months`, detail: `${inr(chronic.reduce((s, d) => s + d.amount, 0))} chronically overdue. Consider a call or late-fee.`, action: "finance" });
  } else if (defaulters.length) {
    alerts.push({ level: "warn", icon: "cash-outline", title: `${defaulters.length} ${defaulters.length === 1 ? v.unit : v.units} with dues`, detail: `${inr(defAmt)} outstanding across 2+ months.`, action: "finance" });
  }
  const expDelta = pct(expThisMonth, expAvg3);
  if (expDelta != null && expDelta >= 25 && expThisMonth > 0) {
    alerts.push({ level: "warn", icon: "trending-up", title: `Expenses up ${expDelta}% this month`, detail: `${inr(expThisMonth)} vs a 3-month average of ${inr(expAvg3)}.`, action: "expenses" });
  }
  const collDelta = pct(cur.collected, prev.collected);
  if (collDelta != null && collDelta <= -35 && prev.collected > 0) {
    alerts.push({ level: "warn", icon: "trending-down", title: `Collections down ${Math.abs(collDelta)}% vs last month`, detail: `${inr(cur.collected)} collected so far this month vs ${inr(prev.collected)} last month.`, action: "finance" });
  }
  for (const d of staleDevices) {
    alerts.push({ level: "critical", icon: "hardware-chip-outline", title: `Gate scanner "${d.name}" offline`, detail: `No contact in over 24 hours — vehicle entry may be manual.`, action: "gateDevices" });
  }
  if (agingTickets) {
    alerts.push({ level: "warn", icon: "construct-outline", title: `${agingTickets} ticket${agingTickets === 1 ? "" : "s"} open 7+ days`, detail: `Residents are waiting on a resolution.`, action: "helpdesk" });
  }
  if (pendingApprovals) {
    alerts.push({ level: "info", icon: "person-add-outline", title: `${pendingApprovals} ${pendingApprovals === 1 ? v.unit + " member" : "members"} awaiting approval`, detail: `Self-registered ${v.units} pending your review.`, action: "users" });
  }
  if (pendingBookings) {
    alerts.push({ level: "info", icon: "calendar-outline", title: `${pendingBookings} booking request${pendingBookings === 1 ? "" : "s"} to review`, detail: `Amenity slots awaiting approval.`, action: "bookings" });
  }
  if (expiringAgreements) {
    alerts.push({ level: "info", icon: "document-text-outline", title: `${expiringAgreements} rent agreement${expiringAgreements === 1 ? "" : "s"} expiring soon`, detail: `Ends within 30 days — renew or re-verify.`, action: "rent" });
  }
  if (overnight >= 5) {
    alerts.push({ level: "info", icon: "moon-outline", title: `${overnight} late-night gate entries this week`, detail: `Logged between 12–5 AM. Worth a quick review of the gate log.`, action: "gate" });
  }
  if (!alerts.length) {
    alerts.push({ level: "ok", icon: "checkmark-circle", title: "All clear", detail: `No dues spikes, security or ops issues detected for ${society?.name || "your " + v.org}.` });
  }

  return {
    generatedAt: now.toISOString(),
    orgType,
    societyName: society?.name || null,
    tier: society?.tier || "platinum",
    currentPeriod,
    prevPeriod,
    finance: {
      collectedThisMonth: Math.round(cur.collected),
      billedThisMonth: Math.round(cur.billed),
      pendingThisMonth: Math.round(cur.pending),
      collectedPrevMonth: Math.round(prev.collected),
      collectionDeltaPct: collDelta,
      pendingTotal: Math.round(totalPending),
      collectedAllTime: Math.round(totalCollected),
      totalExpenses: Math.round(totalExpenses),
      balance: Math.round(totalCollected - totalExpenses),
      expenseThisMonth: Math.round(expThisMonth),
      expenseAvg3mo: Math.round(expAvg3),
      expenseDeltaPct: expDelta,
    },
    defaulters: defaulters.slice(0, 12),
    ops: {
      openTickets: openTickets.length,
      agingTickets,
      pendingBookings,
      pendingApprovals,
      expiringAgreements,
      gateDevicesOffline: staleDevices.length,
      lateNightEntries: overnight,
    },
    alerts,
  };
}
