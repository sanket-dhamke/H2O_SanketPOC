import { prisma } from "./prisma.js";
import { onBillPaid } from "./paymentNotify.js";
import { serializeBill } from "./serializers.js";

// The amount effectively collected for a bill (handles legacy fully-paid bills
// that predate partial-payment tracking, where paidAmount may be 0).
export function effectivePaid(bill) {
  if (!bill) return 0;
  if (bill.status === "paid") return bill.amount || 0;
  return bill.paidAmount || 0;
}

// Outstanding balance on a bill.
export function billBalance(bill) {
  return Math.max(0, (bill?.amount || 0) - effectivePaid(bill));
}

// Records a payment against a bill: appends to the Payment ledger, bumps
// paidAmount, flips status to "partial" or "paid", and (on full settlement)
// fires the receipt email + admin notification. Returns the updated bill with flat.
export async function recordPayment(
  billId,
  { amount, mode = "online", ref = null, collectedBy = null, collectorPhone = null } = {}
) {
  const bill = await prisma.bill.findUnique({ where: { id: billId } });
  if (!bill) throw new Error("Bill not found");
  if (bill.status === "paid") throw new Error("Bill already fully paid");

  const alreadyPaid = effectivePaid(bill);
  const balance = Math.max(0, (bill.amount || 0) - alreadyPaid);
  // Default to clearing the full balance; never accept more than what's owed.
  let pay = amount === undefined || amount === null ? balance : Number(amount);
  if (!(pay > 0)) throw new Error("Payment amount must be greater than zero");
  pay = Math.min(pay, balance);

  const newPaid = alreadyPaid + pay;
  const fullyPaid = newPaid >= (bill.amount || 0) - 0.01;

  const updated = await prisma.bill.update({
    where: { id: bill.id },
    data: {
      paidAmount: newPaid,
      status: fullyPaid ? "paid" : "partial",
      paidAt: fullyPaid ? new Date() : bill.paidAt,
      paymentMode: mode,
      paymentRef: ref || bill.paymentRef,
      collectedBy: collectedBy ?? bill.collectedBy,
      collectorPhone: collectorPhone ?? bill.collectorPhone,
      // Consume any pre-set installment target as it gets paid down.
      nextDueAmount:
        bill.nextDueAmount != null ? Math.max(0, bill.nextDueAmount - pay) : bill.nextDueAmount,
    },
    include: { flat: true },
  });

  await prisma.payment.create({
    data: { billId: bill.id, amount: pay, mode, ref, collectedBy, collectorPhone },
  });

  if (fullyPaid) onBillPaid(bill.id);
  return { bill: updated, paid: pay, fullyPaid };
}

// Full audit ledger for a single flat: EVERY bill (all periods, oldest first)
// with EVERY individual payment, plus a flattened chronological payment timeline
// carrying a running collected total. Lets an admin/superadmin trace the complete
// history from the beginning if a figure ever looks wrong. Returns null if the
// flat doesn't exist.
export async function buildFlatLedger(flatId) {
  const flat = await prisma.flat.findUnique({
    where: { id: flatId },
    include: { society: true, residents: true },
  });
  if (!flat) return null;

  const bills = await prisma.bill.findMany({
    where: { flatId },
    orderBy: [{ period: "asc" }, { createdAt: "asc" }],
    include: { payments: { orderBy: { createdAt: "asc" } } },
  });

  let totalBilled = 0;
  let totalPaid = 0;
  let paymentCount = 0;
  const serBills = bills.map((b) => {
    totalBilled += b.amount || 0;
    totalPaid += effectivePaid(b);
    paymentCount += b.payments?.length || 0;
    return serializeBill(b);
  });

  // Flattened chronological payment timeline with a running collected total.
  const timeline = [];
  for (const b of bills) {
    for (const p of b.payments || []) {
      timeline.push({
        id: p.id,
        billId: b.id,
        period: b.period,
        amount: p.amount,
        mode: p.mode,
        ref: p.ref || null,
        collectedBy: p.collectedBy || null,
        collectorPhone: p.collectorPhone || null,
        createdAt: p.createdAt,
      });
    }
  }
  timeline.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  let running = 0;
  for (const p of timeline) {
    running += p.amount || 0;
    p.runningCollected = running;
  }

  const resident = (flat.residents || []).find((u) => u.role === "resident") || null;

  return {
    flat: {
      id: flat.id,
      flatNo: flat.flatNo,
      block: flat.block || null,
      societyId: flat.societyId,
      occupancy: flat.occupancy || null,
      guardianName: flat.guardianName || resident?.name || flat.ownerName || null,
      guardianPhone: flat.guardianPhone || resident?.phone || null,
    },
    society: flat.society
      ? { id: flat.society.id, name: flat.society.name, orgType: flat.society.orgType || "society" }
      : null,
    summary: {
      totalBilled,
      totalPaid,
      totalBalance: Math.max(0, totalBilled - totalPaid),
      billCount: bills.length,
      paymentCount,
    },
    bills: serBills,
    timeline,
  };
}
