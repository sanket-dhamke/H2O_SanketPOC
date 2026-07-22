import { Router } from "express";
import { randomUUID, createHmac } from "crypto";
import { prisma } from "../prisma.js";
import { authRequired } from "../auth.js";
import { serializeBill } from "../serializers.js";
import { razorpay, razorpayEnabled, RZP_KEY_ID, RZP_KEY_SECRET } from "../razorpay.js";
import { recordPayment, effectivePaid, billBalance } from "../billing.js";

export const maintenanceRouter = Router();

// Resolves the flatId for the current resident (null for guard/admin).
async function currentFlatId(userId) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { flatId: true } });
  return u?.flatId || null;
}

// A resident sees their flat's bills; admin/guard can view all.
maintenanceRouter.get("/maintenance", authRequired, async (req, res) => {
  const where = {};
  if (req.user.role === "resident") {
    where.flatId = await currentFlatId(req.user.id);
  } else {
    // admin/guard see their whole society's bills.
    where.flat = { societyId: req.user.societyId || "__none__" };
  }
  const bills = await prisma.bill.findMany({
    where,
    include: { flat: true },
    orderBy: { period: "desc" },
  });
  const totalDue = bills.reduce((sum, b) => sum + billBalance(b), 0);
  res.json({ bills: bills.map(serializeBill), totalDue });
});

// Fetch a bill the current user is allowed to pay, or send an error response.
async function getPayableBill(req, res) {
  const bill = await prisma.bill.findUnique({
    where: { id: req.params.id },
    include: { flat: true },
  });
  if (!bill) {
    res.status(404).json({ message: "Bill not found" });
    return null;
  }
  if (req.user.role === "resident") {
    const flatId = await currentFlatId(req.user.id);
    if (bill.flatId !== flatId) {
      res.status(403).json({ message: "Not your bill" });
      return null;
    }
  }
  if (bill.status === "paid") {
    res.status(400).json({ message: "Bill already paid" });
    return null;
  }
  return bill;
}

// The amount to charge now: an explicit body.amount (installment), else the
// pre-set nextDueAmount, else the full outstanding balance. Clamped to balance.
function amountToCharge(bill, body) {
  const balance = billBalance(bill);
  let amt = body && body.amount != null ? Number(body.amount) : bill.nextDueAmount || balance;
  if (!(amt > 0)) amt = balance;
  return Math.min(amt, balance);
}

// Fallback "mock" payment (used only when Razorpay keys are not configured).
// Supports partial/installment payments via body.amount.
maintenanceRouter.post("/maintenance/:id/pay", authRequired, async (req, res) => {
  const bill = await getPayableBill(req, res);
  if (!bill) return;
  const amount = amountToCharge(bill, req.body);
  const { bill: updated } = await recordPayment(bill.id, {
    amount,
    mode: "online",
    ref: "PAY-" + randomUUID().slice(0, 8).toUpperCase(),
  });
  res.json({ bill: serializeBill(updated) });
});

// Step 1: create a Razorpay order; the app opens checkout with this.
maintenanceRouter.post("/maintenance/:id/create-order", authRequired, async (req, res) => {
  const bill = await getPayableBill(req, res);
  if (!bill) return;
  if (!razorpayEnabled) return res.json({ enabled: false });

  const payer = await prisma.user.findFirst({
    where: { flatId: bill.flatId, role: "resident" },
  });

  const chargeAmount = amountToCharge(bill, req.body);
  const amountPaise = Math.round(chargeAmount * 100);
  // If a society Razorpay linked account is configured, route (Razorpay Route)
  // the full amount to it so collections settle into the society's account.
  const society = await prisma.societyAccount.findFirst({
    where: { societyId: bill.flat?.societyId || "__none__" },
    orderBy: { createdAt: "asc" },
  });
  const transfers =
    society?.active && society?.razorpayAccountId
      ? [
          {
            account: society.razorpayAccountId,
            amount: amountPaise,
            currency: "INR",
            notes: { billId: bill.id, period: bill.period, flatNo: bill.flat?.flatNo || "" },
            on_hold: false,
          },
        ]
      : undefined;

  try {
    const order = await razorpay.orders.create({
      amount: amountPaise, // paise
      currency: "INR",
      receipt: bill.id,
      notes: { billId: bill.id, period: bill.period, flatNo: bill.flat?.flatNo },
      ...(transfers ? { transfers } : {}),
    });
    await prisma.bill.update({ where: { id: bill.id }, data: { orderId: order.id } });
    res.json({
      enabled: true,
      keyId: RZP_KEY_ID,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      name: "H2O Society",
      description: `Maintenance ${bill.period} (Flat ${bill.flat?.flatNo})`,
      prefill: { name: payer?.name || "", email: payer?.email || "" },
    });
  } catch (err) {
    const rzpMsg = err?.error?.description || err?.message;
    console.error("Razorpay order failed:", err?.error || err.message);
    // Give a clear hint when the failure is caused by Route not being active.
    const routeIssue =
      transfers && /route|transfer|linked account/i.test(rzpMsg || "");
    res.status(502).json({
      message: routeIssue
        ? "Payment routing failed. Ensure Razorpay Route is enabled and the linked account id is valid."
        : "Could not create payment order",
    });
  }
});

// Step 2: verify the payment signature returned by checkout, then mark paid.
maintenanceRouter.post("/maintenance/:id/verify", authRequired, async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ message: "Missing payment verification fields" });
  }
  const bill = await prisma.bill.findUnique({ where: { id: req.params.id } });
  if (!bill) return res.status(404).json({ message: "Bill not found" });
  if (req.user.role === "resident") {
    const flatId = await currentFlatId(req.user.id);
    if (bill.flatId !== flatId) return res.status(403).json({ message: "Not your bill" });
  }
  const expected = createHmac("sha256", RZP_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");
  if (expected !== razorpay_signature) {
    return res.status(400).json({ message: "Payment verification failed" });
  }
  if (bill.status === "paid") return res.status(400).json({ message: "Bill already paid" });
  const amount = amountToCharge(bill, req.body);
  const { bill: updated } = await recordPayment(bill.id, {
    amount,
    mode: "online",
    ref: razorpay_payment_id,
  });
  res.json({ bill: serializeBill(updated) });
});
