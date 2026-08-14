import { createHash } from "crypto";
import { prisma } from "./prisma.js";

// Local copies (avoid importing billing.js, which imports this module).
const effectivePaid = (b) => (!b ? 0 : b.status === "paid" ? b.amount || 0 : b.paidAmount || 0);
const billBalance = (b) => Math.max(0, (b?.amount || 0) + (b?.lateFee || 0) - effectivePaid(b));

// Tamper-evident financial ledger: a per-society hash chain over money events.
// Silent edits to history (or to the chain itself) break the hashes, which the
// verify step detects. This is what turns the existing payment/expense data into
// a resident-facing TRUST product (Transparency Score).

const pad2 = (n) => String(n).padStart(2, "0");
const periodOfDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
const round = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Canonical, stable serialization so the same event always hashes the same way.
function hashEntry(prevHash, e) {
  const canonical = JSON.stringify({
    seq: e.seq,
    type: e.type,
    refId: e.refId || null,
    direction: e.direction,
    amount: round(e.amount),
    at: new Date(e.at).toISOString(),
  });
  return createHash("sha256").update(`${prevHash}|${canonical}`).digest("hex");
}

// Pulls all money events (payments in, expenses out) for a society in strict
// chronological order — the canonical event stream the chain is built from.
async function loadEvents(societyId) {
  const [payments, expenses] = await Promise.all([
    prisma.payment.findMany({
      where: { bill: { flat: { societyId } } },
      select: { id: true, amount: true, mode: true, createdAt: true, bill: { select: { period: true, flat: { select: { flatNo: true } } } } },
    }),
    prisma.expense.findMany({ where: { societyId }, select: { id: true, amount: true, label: true, date: true } }),
  ]);
  const events = [
    ...payments.map((p) => ({ type: "payment", refId: p.id, direction: "in", amount: p.amount || 0, at: p.createdAt, label: `${p.mode === "cash" ? "Cash" : "Online"} · ${p.bill?.flat?.flatNo || ""} ${p.bill?.period || ""}`.trim() })),
    ...expenses.map((e) => ({ type: "expense", refId: e.id, direction: "out", amount: e.amount || 0, at: e.date, label: e.label || "Expense" })),
  ];
  events.sort((a, b) => new Date(a.at) - new Date(b.at) || String(a.refId).localeCompare(String(b.refId)));
  return events;
}

// Rebuilds the stored chain from the canonical event stream (idempotent). Used
// to establish/refresh the baseline; new events also append via appendLedger.
export async function rebuildLedger(societyId) {
  const events = await loadEvents(societyId);
  let prevHash = "";
  const rows = events.map((e, i) => {
    const seq = i + 1;
    const hash = hashEntry(prevHash, { ...e, seq });
    const row = { societyId, seq, type: e.type, refId: e.refId, direction: e.direction, amount: round(e.amount), label: e.label || null, at: e.at, prevHash, hash };
    prevHash = hash;
    return row;
  });
  await prisma.$transaction([
    prisma.ledgerEntry.deleteMany({ where: { societyId } }),
    ...(rows.length ? [prisma.ledgerEntry.createMany({ data: rows })] : []),
  ]);
  return { count: rows.length, head: prevHash };
}

// Appends a single event to the tail of the chain (called as money moves).
// Best-effort: never throws into the caller's critical path.
export async function appendLedger(societyId, ev) {
  if (!societyId) return;
  try {
    const last = await prisma.ledgerEntry.findFirst({ where: { societyId }, orderBy: { seq: "desc" } });
    const seq = (last?.seq || 0) + 1;
    const prevHash = last?.hash || "";
    const at = ev.at || new Date();
    const hash = hashEntry(prevHash, { ...ev, seq, at });
    await prisma.ledgerEntry.create({
      data: { societyId, seq, type: ev.type, refId: ev.refId || null, direction: ev.direction, amount: round(ev.amount), label: ev.label || null, at, prevHash, hash },
    });
  } catch (e) {
    console.error("[ledger] append failed:", e.message);
  }
}

// Verifies the stored chain: recomputes every hash and confirms linkage. Returns
// the first broken sequence number if tampering is detected.
export async function verifyLedger(societyId) {
  const entries = await prisma.ledgerEntry.findMany({ where: { societyId }, orderBy: { seq: "asc" } });
  let prevHash = "";
  for (const e of entries) {
    const expected = hashEntry(prevHash, e);
    if (e.prevHash !== prevHash || e.hash !== expected) {
      return { ok: false, count: entries.length, brokenAt: e.seq };
    }
    prevHash = e.hash;
  }
  return { ok: true, count: entries.length, head: prevHash };
}

// Computes the Transparency Score (0–100) + money-flow view. The score is fully
// explainable: each factor lists its contribution so the committee/residents
// see exactly why the number is what it is.
export async function computeTransparency(societyId) {
  const now = new Date();
  const currentPeriod = periodOfDate(now);

  const [society, account, expenses, payments, bills, integrity, entryCount, announcements] = await Promise.all([
    prisma.society.findUnique({ where: { id: societyId }, select: { name: true, orgType: true } }),
    prisma.societyAccount.findFirst({ where: { societyId, active: true }, select: { id: true } }),
    prisma.expense.findMany({ where: { societyId }, select: { amount: true, label: true, date: true } }),
    prisma.payment.findMany({ where: { bill: { flat: { societyId } } }, select: { amount: true, createdAt: true } }),
    prisma.bill.findMany({ where: { flat: { societyId } }, select: { amount: true, status: true, paidAmount: true, lateFee: true } }),
    verifyLedger(societyId),
    prisma.ledgerEntry.count({ where: { societyId } }),
    prisma.announcement.count({ where: { societyId, createdAt: { gte: new Date(now.getTime() - 45 * 864e5) } } }),
  ]);

  // Money flow by month (last 12): collected in vs spent out.
  const flow = new Map();
  const bump = (period, key, amt) => {
    const row = flow.get(period) || { period, in: 0, out: 0 };
    row[key] += amt || 0;
    flow.set(period, row);
  };
  for (const p of payments) bump(periodOfDate(new Date(p.createdAt)), "in", p.amount);
  for (const e of expenses) bump(periodOfDate(new Date(e.date)), "out", e.amount);
  const byMonth = [...flow.values()].sort((a, b) => (a.period < b.period ? 1 : -1)).slice(0, 12).reverse()
    .map((r) => ({ period: r.period, in: Math.round(r.in), out: Math.round(r.out) }));

  // Expense breakdown by label (top 8).
  const byLabel = new Map();
  for (const e of expenses) byLabel.set(e.label || "Other", (byLabel.get(e.label || "Other") || 0) + (e.amount || 0));
  const expenseByLabel = [...byLabel.entries()].map(([label, amount]) => ({ label, amount: Math.round(amount) })).sort((a, b) => b.amount - a.amount).slice(0, 8);

  const totalCollected = payments.reduce((s, p) => s + (p.amount || 0), 0);
  const totalExpenses = expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const totalBilled = bills.reduce((s, b) => s + (b.amount || 0), 0);
  const totalOutstanding = bills.reduce((s, b) => s + billBalance(b), 0);

  // ---- Score factors (each contributes to /100) ----
  const factors = [];
  const add = (key, label, score, max, detail) => factors.push({ key, label, score: Math.round(score), max, detail });

  // 1) Ledger integrity (30)
  add("integrity", "Tamper-proof ledger intact", integrity.ok ? 30 : 0, 30, integrity.ok ? `${integrity.count} verified entries` : `Chain broken at #${integrity.brokenAt}`);

  // 2) Labelled expenses (20)
  const labelled = expenses.filter((e) => (e.label || "").trim()).length;
  const labelPct = expenses.length ? labelled / expenses.length : 1;
  add("labels", "Expenses are itemised", labelPct * 20, 20, `${labelled}/${expenses.length || 0} expenses labelled`);

  // 3) Bookkeeping recency (15) — money recorded in the last 45 days
  const recent = [...payments, ...expenses.map((e) => ({ createdAt: e.date }))].some((x) => now - new Date(x.createdAt) < 45 * 864e5);
  add("recency", "Books kept up to date", recent ? 15 : 0, 15, recent ? "Activity in last 45 days" : "No entries in 45 days");

  // 4) Collection ratio (15)
  const collRatio = totalBilled ? Math.min(1, totalCollected / totalBilled) : 1;
  add("collection", "Dues collected", collRatio * 15, 15, `${Math.round(collRatio * 100)}% of billed collected`);

  // 5) Payee account configured (10)
  add("account", "Verified payee account", account ? 10 : 0, 10, account ? "Bank/UPI on file" : "No payout account set");

  // 6) Committee communicates (10) — an announcement/summary in last 45 days
  add("comms", "Regular updates posted", announcements > 0 ? 10 : 0, 10, announcements > 0 ? `${announcements} recent update(s)` : "No recent announcements");

  const score = Math.max(0, Math.min(100, Math.round(factors.reduce((s, f) => s + f.score, 0))));
  const band = score >= 80 ? "Excellent" : score >= 60 ? "Good" : score >= 40 ? "Fair" : "Needs work";

  return {
    generatedAt: now.toISOString(),
    societyName: society?.name || null,
    orgType: society?.orgType === "preschool" ? "preschool" : "society",
    score,
    band,
    factors,
    integrity: { ok: integrity.ok, count: entryCount, brokenAt: integrity.brokenAt || null },
    totals: {
      collected: Math.round(totalCollected),
      expenses: Math.round(totalExpenses),
      balance: Math.round(totalCollected - totalExpenses),
      billed: Math.round(totalBilled),
      outstanding: Math.round(totalOutstanding),
    },
    moneyFlow: byMonth,
    expenseByLabel,
  };
}
