import { Router } from "express";
import { prisma } from "../prisma.js";
import { authRequired } from "../auth.js";
import { effectivePaid, billBalance, refreshLateFees } from "../billing.js";
import { computeSocietyInsights } from "../insights.js";
import { cacheWrap } from "../cache.js";

// Role-scoped snapshot that powers the graphical summary on the home tab
// (donuts + trend bars + "needs your attention" list). Everything here is
// deterministic — no AI — so the dashboard renders even when the AI provider is
// down. Colours are chosen by the app; the server only names the segments.
export const homeRouter = Router();

const WINDOW_DAYS = 30;
const TREND_MONTHS = 4;
const SUMMARY_TTL_SEC = Number(process.env.HOME_SUMMARY_TTL_SEC || 45);

const VISITOR_SEGMENTS = [
  { key: "approved", label: "Approved" },
  { key: "pending", label: "Pending" },
  { key: "leave_at_gate", label: "Left at gate" },
  { key: "rejected", label: "Rejected" },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad2 = (n) => String(n).padStart(2, "0");
const periodOf = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;

function lastPeriods(count) {
  const now = new Date();
  const out = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ period: periodOf(d), label: MONTHS[d.getMonth()] });
  }
  return out;
}

// Visitor counts per status over the trailing window, as donut segments.
async function visitorDonut(where) {
  const since = new Date(Date.now() - WINDOW_DAYS * 864e5);
  const groups = await prisma.visitor.groupBy({
    by: ["status"],
    where: { ...where, createdAt: { gte: since } },
    _count: { _all: true },
  });
  const byStatus = new Map(groups.map((g) => [g.status, g._count._all]));
  const segments = VISITOR_SEGMENTS.map((s) => ({ ...s, value: byStatus.get(s.key) || 0 }));
  // Any status outside the known set still has to count towards the total.
  const known = new Set(VISITOR_SEGMENTS.map((s) => s.key));
  const other = groups
    .filter((g) => !known.has(g.status))
    .reduce((sum, g) => sum + g._count._all, 0);
  if (other) segments.push({ key: "other", label: "Other", value: other });
  return {
    windowDays: WINDOW_DAYS,
    total: segments.reduce((sum, s) => sum + s.value, 0),
    segments,
  };
}

// Monthly visitor counts for the trend bars. Grouped in SQL so a busy society
// never pulls thousands of rows into Node just to bucket them by month.
async function visitorTrend({ flatId, societyId }) {
  const since = new Date();
  since.setMonth(since.getMonth() - (TREND_MONTHS - 1));
  since.setDate(1);
  since.setHours(0, 0, 0, 0);

  const rows = flatId
    ? await prisma.$queryRaw`
        SELECT to_char(v."createdAt", 'YYYY-MM') AS period, v.status AS status, COUNT(*)::int AS count
        FROM "Visitor" v
        WHERE v."flatId" = ${flatId} AND v."createdAt" >= ${since}
        GROUP BY 1, 2`
    : await prisma.$queryRaw`
        SELECT to_char(v."createdAt", 'YYYY-MM') AS period, v.status AS status, COUNT(*)::int AS count
        FROM "Visitor" v JOIN "Flat" f ON f.id = v."flatId"
        WHERE f."societyId" = ${societyId} AND v."createdAt" >= ${since}
        GROUP BY 1, 2`;

  const known = ["approved", "pending", "rejected", "leave_at_gate"];
  return lastPeriods(TREND_MONTHS).map(({ period, label }) => {
    const row = { label, period, approved: 0, pending: 0, rejected: 0, leave_at_gate: 0, other: 0, value: 0 };
    for (const r of rows) {
      if (r.period !== period) continue;
      const k = known.includes(r.status) ? r.status : "other";
      row[k] += Number(r.count) || 0;
    }
    row.value = row.approved + row.pending + row.rejected + row.leave_at_gate + row.other;
    return row;
  });
}

const inr = (n) => Math.round(n || 0);

async function residentSummary(user) {
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { flatId: true, societyId: true, flat: { select: { flatNo: true } } },
  });
  const flatId = dbUser?.flatId || null;
  const societyId = dbUser?.societyId || null;

  if (!flatId) {
    return {
      unit: null,
      visitors: { windowDays: WINDOW_DAYS, total: 0, segments: [] },
      finance: { billed: 0, paid: 0, pending: 0, paidPct: 0, segments: [], overdueBills: 0 },
      trend: lastPeriods(TREND_MONTHS).map(({ label, period }) => ({ label, period, value: 0 })),
      pending: [],
    };
  }

  // Late fees are throttled internally, so this is cheap on repeat loads but
  // keeps the pending figure honest right after a due date passes.
  if (societyId) await refreshLateFees(societyId).catch(() => {});

  const [visitors, bills, awaitingApproval, unpaidBookings, agreements, trend] = await Promise.all([
    visitorDonut({ flatId }),
    prisma.bill.findMany({
      where: { flatId },
      select: { amount: true, status: true, paidAmount: true, lateFee: true, dueDate: true, period: true },
    }),
    prisma.visitor.count({ where: { flatId, status: "pending" } }),
    prisma.booking.count({ where: { residentId: user.id, status: "approved" } }),
    prisma.rentAgreement.findMany({
      where: { flatId },
      select: { status: true, endDate: true },
    }),
    visitorTrend({ flatId }),
  ]);

  let billed = 0;
  let paid = 0;
  let pendingAmount = 0;
  let overdueBills = 0;
  const today = new Date().toISOString().slice(0, 10);
  for (const b of bills) {
    billed += (b.amount || 0) + (b.lateFee || 0);
    paid += effectivePaid(b);
    const balance = billBalance(b);
    pendingAmount += balance;
    if (balance > 0.5 && b.dueDate && b.dueDate < today) overdueBills += 1;
  }

  const pending = [];
  if (awaitingApproval > 0) {
    pending.push({
      key: "visitor_approvals",
      level: "critical",
      icon: "person-outline",
      label: `${awaitingApproval} visitor${awaitingApproval === 1 ? "" : "s"} at the gate`,
      detail: "Waiting for you to approve or deny.",
      route: "Visitors",
      params: { screen: "VisitorsHome" },
    });
  }
  if (pendingAmount > 0.5) {
    pending.push({
      key: "bills",
      level: overdueBills > 0 ? "critical" : "warn",
      icon: "cash-outline",
      label: `₹${inr(pendingAmount).toLocaleString("en-IN")} outstanding`,
      detail: overdueBills > 0 ? `${overdueBills} bill${overdueBills === 1 ? "" : "s"} past the due date.` : "Pay from the bills tab.",
      route: "Maintenance",
      params: { screen: "MaintenanceHome" },
    });
  }
  if (unpaidBookings > 0) {
    pending.push({
      key: "bookings",
      level: "warn",
      icon: "calendar-outline",
      label: `${unpaidBookings} booking${unpaidBookings === 1 ? "" : "s"} approved`,
      detail: "Approved by the admin — payment pending.",
      route: "Amenities",
    });
  }
  const now = new Date();
  const expiring = agreements.filter((a) => {
    if (a.status !== "verified" || !a.endDate) return false;
    const days = (new Date(`${a.endDate}T00:00:00`) - now) / 864e5;
    return days >= 0 && days <= 30;
  }).length;
  const unverified = agreements.filter((a) => a.status === "pending").length;
  if (expiring > 0 || unverified > 0) {
    pending.push({
      key: "rent",
      level: "info",
      icon: "document-text-outline",
      label: expiring > 0 ? "Rent agreement expiring" : "Rent agreement under review",
      detail: expiring > 0 ? "Ends within 30 days — renew it to stay compliant." : "Awaiting admin verification.",
      route: "Maintenance",
      params: { screen: "RentAgreements" },
    });
  }

  return {
    unit: dbUser?.flat?.flatNo || null,
    visitors,
    finance: {
      billed: inr(billed),
      paid: inr(paid),
      pending: inr(pendingAmount),
      paidPct: billed > 0 ? Math.round((paid / billed) * 100) : 100,
      overdueBills,
      segments: [
        { key: "paid", label: "Paid", value: inr(paid) },
        { key: "pending", label: "Pending", value: inr(pendingAmount) },
      ],
    },
    trend,
    pending,
  };
}

// Maps an insight alert's `action` onto a navigable route in the app.
const ADMIN_ALERT_ROUTES = {
  finance: { route: "Finance", params: { screen: "FinanceHome" } },
  expenses: { route: "Finance", params: { screen: "FinanceHome" } },
  helpdesk: { route: "Community", params: { screen: "Helpdesk" } },
  users: { route: "Members", params: { screen: "ManageUsers" } },
  bookings: { route: "Finance", params: { screen: "Amenities" } },
  rent: { route: "Members", params: { screen: "RentAgreements" } },
  gateDevices: { route: "Members", params: { screen: "GateDevices" } },
  gate: { route: "Visitors" },
};

async function societySummary(user, { includeInsights }) {
  const societyId = user.societyId || "__none__";
  const [visitors, trend, insights] = await Promise.all([
    visitorDonut({ flat: { societyId } }),
    visitorTrend({ societyId }),
    includeInsights ? computeSocietyInsights(societyId) : Promise.resolve(null),
  ]);

  if (!insights) {
    // Guard view: gate activity only, no finances.
    const awaiting = await prisma.visitor.count({
      where: { flat: { societyId }, status: "pending" },
    });
    return {
      unit: null,
      visitors,
      finance: null,
      trend,
      pending: awaiting
        ? [{
            key: "visitor_approvals",
            level: "warn",
            icon: "person-outline",
            label: `${awaiting} entr${awaiting === 1 ? "y" : "ies"} awaiting approval`,
            detail: "Residents have not responded yet.",
            route: "Visitors",
          }]
        : [],
    };
  }

  const { finance, alerts, defaulters, ops } = insights;
  const collected = finance.collectedThisMonth;
  const outstanding = finance.pendingThisMonth;

  return {
    unit: null,
    visitors,
    finance: {
      billed: finance.billedThisMonth,
      paid: collected,
      pending: outstanding,
      paidPct: finance.billedThisMonth > 0 ? Math.round((collected / finance.billedThisMonth) * 100) : 100,
      balance: finance.balance,
      collectedAllTime: finance.collectedAllTime,
      pendingTotal: finance.pendingTotal,
      totalExpenses: finance.totalExpenses,
      collectionDeltaPct: finance.collectionDeltaPct,
      segments: [
        { key: "paid", label: "Collected", value: collected },
        { key: "pending", label: "Pending", value: outstanding },
      ],
    },
    trend,
    // The insights engine calls the outstanding figure `amount`; the dashboard
    // speaks in `pending` everywhere, so translate here rather than in the UI.
    defaulters: defaulters.slice(0, 5).map((d) => ({
      flatNo: d.flatNo,
      block: d.block,
      months: d.months,
      pending: d.amount,
    })),
    ops,
    pending: alerts
      .filter((a) => a.level !== "ok")
      .slice(0, 5)
      .map((a) => ({
        key: a.action || a.title,
        level: a.level,
        icon: a.icon,
        label: a.title,
        detail: a.detail,
        ...(ADMIN_ALERT_ROUTES[a.action] || {}),
      })),
  };
}

// GET /api/home-summary — one call powers the whole graphical home dashboard.
homeRouter.get("/home-summary", authRequired, async (req, res) => {
  const { role, id, societyId } = req.user;
  try {
    const key = `home-summary:${role}:${role === "resident" ? id : societyId}`;
    const data = await cacheWrap(key, SUMMARY_TTL_SEC, async () => {
      if (role === "resident") return residentSummary(req.user);
      if (role === "admin") return societySummary(req.user, { includeInsights: true });
      return societySummary(req.user, { includeInsights: false });
    });

    const society = societyId
      ? await prisma.society.findUnique({ where: { id: societyId }, select: { orgType: true } })
      : null;

    res.json({
      role,
      orgType: society?.orgType === "preschool" ? "preschool" : "society",
      generatedAt: new Date().toISOString(),
      ...data,
    });
  } catch (err) {
    console.error("home-summary failed:", err.message);
    res.status(500).json({ message: "Could not load your summary right now." });
  }
});
