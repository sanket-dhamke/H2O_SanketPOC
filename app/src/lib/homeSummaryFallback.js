// Lightweight home dashboard built from the endpoints that already exist on
// the live API (bills + visitors). Used when GET /api/home-summary 404s —
// that route is new and has not been deployed to Render yet.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad2 = (n) => String(n).padStart(2, "0");

function lastPeriods(count) {
  const now = new Date();
  const out = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ period: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`, label: MONTHS[d.getMonth()] });
  }
  return out;
}

function visitorDonut(visitors) {
  const since = Date.now() - 30 * 864e5;
  const counts = { approved: 0, pending: 0, leave_at_gate: 0, rejected: 0, other: 0 };
  for (const v of visitors || []) {
    const t = v.createdAt ? new Date(v.createdAt).getTime() : Date.now();
    if (t < since) continue;
    if (counts[v.status] != null) counts[v.status] += 1;
    else counts.other += 1;
  }
  const labels = {
    approved: "Approved",
    pending: "Pending",
    leave_at_gate: "Left at gate",
    rejected: "Rejected",
    other: "Other",
  };
  const segments = ["approved", "pending", "rejected", "leave_at_gate", "other"]
    .map((key) => ({ key, label: labels[key], value: counts[key] }))
    .filter((s) => s.value > 0 || s.key === "approved" || s.key === "pending" || s.key === "rejected");
  return {
    windowDays: 30,
    total: segments.reduce((sum, s) => sum + s.value, 0),
    segments,
  };
}

function visitorTrend(visitors) {
  const byPeriod = new Map();
  for (const v of visitors || []) {
    if (!v.createdAt) continue;
    const d = new Date(v.createdAt);
    const period = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
    const cur = byPeriod.get(period) || { approved: 0, pending: 0, rejected: 0, leave_at_gate: 0, other: 0 };
    if (cur[v.status] != null) cur[v.status] += 1;
    else cur.other += 1;
    byPeriod.set(period, cur);
  }
  return lastPeriods(4).map(({ period, label }) => {
    const c = byPeriod.get(period) || { approved: 0, pending: 0, rejected: 0, leave_at_gate: 0, other: 0 };
    return {
      label,
      period,
      ...c,
      value: c.approved + c.pending + c.rejected + c.leave_at_gate + c.other,
    };
  });
}

export function composeHomeSummary({ role, bills = [], totalDue = 0, visitors = [] }) {
  const billed = bills.reduce((sum, b) => sum + (b.amount || 0) + (b.lateFee || 0), 0);
  const pendingAmt = Math.round(totalDue || 0);
  const paid = Math.max(0, Math.round(billed) - pendingAmt);
  const awaiting = (visitors || []).filter((v) => v.status === "pending").length;

  const pending = [];
  if (awaiting > 0) {
    pending.push({
      key: "visitor_approvals",
      level: "critical",
      icon: "person-outline",
      label: `${awaiting} visitor${awaiting === 1 ? "" : "s"} at the gate`,
      detail: "Waiting for you to approve or deny.",
      route: "Visitors",
      params: { screen: "VisitorsHome" },
    });
  }
  if (role !== "guard" && pendingAmt > 0.5) {
    pending.push({
      key: "bills",
      level: "warn",
      icon: "cash-outline",
      label: `₹${pendingAmt.toLocaleString("en-IN")} outstanding`,
      detail: "Pay from the bills tab.",
      route: "Maintenance",
      params: { screen: "MaintenanceHome" },
    });
  }

  return {
    role,
    visitors: visitorDonut(visitors),
    finance:
      role === "guard"
        ? null
        : {
            billed: Math.round(billed),
            paid,
            pending: pendingAmt,
            paidPct: billed > 0 ? Math.round((paid / billed) * 100) : 100,
            overdueBills: 0,
            segments: [
              { key: "paid", label: "Paid", value: paid },
              { key: "pending", label: "Pending", value: pendingAmt },
            ],
          },
    trend: visitorTrend(visitors),
    pending,
  };
}
