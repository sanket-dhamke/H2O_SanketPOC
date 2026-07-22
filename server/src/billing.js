import { prisma } from "./prisma.js";
import { onBillPaid } from "./paymentNotify.js";

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
