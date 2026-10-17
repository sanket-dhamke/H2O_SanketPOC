import { effectivePaid, billBalance } from "./billing.js";

function ymd(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function periodOf(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function moneySplits(bills, now = new Date()) {
  const today = ymd(now);
  const currentPeriod = periodOf(now);
  let collected = 0;
  let pending = 0;
  let overdue = 0;
  let advance = 0;
  for (const b of bills || []) {
    const paid = effectivePaid(b);
    const bal = billBalance(b);
    collected += paid;
    pending += bal;
    if (bal > 0 && b.dueDate && String(b.dueDate) < today) overdue += bal;
    if (b.period && String(b.period) > currentPeriod) {
      advance += paid;
    } else {
      const over = paid - (b.amount || 0) - (b.lateFee || 0);
      if (over > 0) advance += over;
    }
  }
  return {
    collected: Math.round(collected),
    pending: Math.round(pending),
    overdue: Math.round(overdue),
    advance: Math.round(advance),
  };
}

export function collectionMonths(bills, now = new Date(), count = 6) {
  const months = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const period = periodOf(d);
    const rows = (bills || []).filter((b) => b.period === period);
    const invoiced = rows.reduce((s, b) => s + (b.amount || 0) + (b.lateFee || 0), 0);
    const collected = rows.reduce((s, b) => s + effectivePaid(b), 0);
    const pending = rows.reduce((s, b) => s + billBalance(b), 0);
    months.push({
      period,
      invoiced: Math.round(invoiced),
      collected: Math.round(collected),
      pending: Math.round(pending),
    });
  }
  return months;
}

export function serializeMove(m, flatNo) {
  return {
    id: m.id,
    flatId: m.flatId,
    flatNo: flatNo || null,
    kind: m.kind,
    residentName: m.residentName,
    phone: m.phone || null,
    email: m.email || null,
    date: m.date,
    notes: m.notes || null,
    depositAmount: m.depositAmount ?? null,
    createdAt: m.createdAt,
  };
}

export function vendorImageList(images) {
  if (!Array.isArray(images)) return [];
  return images.filter((item) => typeof item === "string" && item.trim());
}

export function serializeVendorBill(v) {
  return {
    id: v.id,
    vendorName: v.vendorName,
    category: v.category,
    description: v.description || null,
    images: vendorImageList(v.images),
    amount: v.amount,
    dueDate: v.dueDate || null,
    status: v.status,
    paidAt: v.paidAt || null,
    paymentRef: v.paymentRef || null,
    createdAt: v.createdAt,
  };
}
