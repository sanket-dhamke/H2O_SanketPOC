import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../prisma.js";
import { authRequired, roleRequired } from "../auth.js";
import { publicUser, serializeBill } from "../serializers.js";
import { validatePassword } from "../passwordPolicy.js";
import { sendPush } from "../push.js";
import { buildSocietyBackup, emailSocietyBackup, buildWingReport, listBlocks } from "../backup.js";

export const adminRouter = Router();

// Every route here is admin-only, and every query is scoped to the admin's society.
adminRouter.use(authRequired, roleRequired("admin"));

// Convenience: the society the current admin manages.
function sid(req) {
  return req.user.societyId || "__none__";
}

/* ------------------------------- Users ----------------------------------- */
adminRouter.get("/users", async (req, res) => {
  const { role } = req.query;
  const users = await prisma.user.findMany({
    where: { societyId: sid(req), ...(role ? { role } : {}) },
    include: { flat: true },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });
  res.json({ users: users.map(publicUser) });
});

adminRouter.post("/users", async (req, res) => {
  const { name, email, phone, password, role, flatNo, flatId } = req.body || {};
  if (!name || !email || !password || !role) {
    return res.status(400).json({ message: "name, email, password and role are required" });
  }
  if (!["resident", "guard", "admin"].includes(role)) {
    return res.status(400).json({ message: "role must be resident, guard or admin" });
  }

  const policyError = validatePassword(password);
  if (policyError) return res.status(400).json({ message: policyError });

  // Store emails lowercased so logins are effectively case-insensitive on SQLite.
  const normalizedEmail = String(email).trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) return res.status(409).json({ message: "A user with this email already exists" });

  // Residents must be attached to a flat in this society.
  let resolvedFlatId = null;
  if (role === "resident") {
    const flat = flatId
      ? await prisma.flat.findFirst({ where: { id: flatId, societyId: sid(req) } })
      : flatNo
        ? await prisma.flat.findFirst({ where: { flatNo, societyId: sid(req) } })
        : null;
    if (!flat) return res.status(400).json({ message: "A valid flat is required for a resident" });
    resolvedFlatId = flat.id;
  }

  const user = await prisma.user.create({
    data: {
      name,
      email: normalizedEmail,
      phone: phone || null,
      role,
      societyId: req.user.societyId,
      flatId: resolvedFlatId,
      passwordHash: bcrypt.hashSync(password, 10),
    },
    include: { flat: true },
  });
  res.status(201).json({ user: publicUser(user) });
});

adminRouter.patch("/users/:id", async (req, res) => {
  const { name, phone, active, password, flatNo, flatId } = req.body || {};
  const target = await prisma.user.findFirst({ where: { id: req.params.id, societyId: sid(req) } });
  if (!target) return res.status(404).json({ message: "User not found" });

  const data = {};
  if (name !== undefined) data.name = name;
  if (phone !== undefined) data.phone = phone || null;
  if (active !== undefined) data.active = Boolean(active);
  if (password) {
    const policyError = validatePassword(password);
    if (policyError) return res.status(400).json({ message: policyError });
    data.passwordHash = bcrypt.hashSync(password, 10);
  }
  if (target.role === "resident" && (flatNo || flatId)) {
    const flat = flatId
      ? await prisma.flat.findFirst({ where: { id: flatId, societyId: sid(req) } })
      : await prisma.flat.findFirst({ where: { flatNo, societyId: sid(req) } });
    if (!flat) return res.status(400).json({ message: "Flat not found" });
    data.flatId = flat.id;
  }

  const user = await prisma.user.update({
    where: { id: target.id },
    data,
    include: { flat: true },
  });
  res.json({ user: publicUser(user) });
});

adminRouter.delete("/users/:id", async (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ message: "You cannot delete your own account" });
  }
  const target = await prisma.user.findFirst({ where: { id: req.params.id, societyId: sid(req) } });
  if (!target) return res.status(404).json({ message: "User not found" });
  await prisma.user.delete({ where: { id: target.id } });
  res.json({ ok: true });
});

/* ------------------------------- Flats ----------------------------------- */
adminRouter.get("/flats", async (req, res) => {
  const flats = await prisma.flat.findMany({
    where: { societyId: sid(req) },
    include: { _count: { select: { residents: true } } },
    orderBy: { flatNo: "asc" },
  });
  res.json({
    flats: flats.map((f) => ({
      id: f.id,
      flatNo: f.flatNo,
      block: f.block,
      ownerName: f.ownerName,
      residentCount: f._count.residents,
    })),
  });
});

adminRouter.post("/flats", async (req, res) => {
  const { flatNo, block, ownerName } = req.body || {};
  if (!flatNo) return res.status(400).json({ message: "flatNo is required" });
  const existing = await prisma.flat.findFirst({ where: { flatNo, societyId: sid(req) } });
  if (existing) return res.status(409).json({ message: "Flat already exists" });
  const flat = await prisma.flat.create({
    data: { flatNo, block: block || null, ownerName: ownerName || null, societyId: req.user.societyId },
  });
  res.status(201).json({ flat });
});

/* --------------------------- Bank account -------------------------------- */
// The society bank account maintenance is collected into. razorpayAccountId is
// a Razorpay Route "Linked Account" id (acc_XXXX) created/KYC'd in the Razorpay
// dashboard; when present, payments are routed there automatically.
adminRouter.get("/bank-account", async (req, res) => {
  const account = await prisma.societyAccount.findFirst({
    where: { societyId: sid(req) },
    orderBy: { createdAt: "asc" },
  });
  res.json({ account: account || null });
});

adminRouter.put("/bank-account", async (req, res) => {
  const { accountHolderName, bankName, accountNumber, ifsc, upiId, razorpayAccountId, active } =
    req.body || {};

  if (!accountHolderName || !String(accountHolderName).trim()) {
    return res.status(400).json({ message: "Account holder name is required" });
  }
  const cleanIfsc = ifsc ? String(ifsc).trim().toUpperCase() : "";
  if (cleanIfsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(cleanIfsc)) {
    return res.status(400).json({ message: "IFSC must be 11 characters, e.g. HDFC0001234" });
  }
  const cleanAccountNumber = accountNumber ? String(accountNumber).replace(/\s+/g, "") : "";
  if (cleanAccountNumber && !/^\d{6,20}$/.test(cleanAccountNumber)) {
    return res.status(400).json({ message: "Account number must be 6-20 digits" });
  }
  const cleanRzpId = razorpayAccountId ? String(razorpayAccountId).trim() : "";
  if (cleanRzpId && !/^acc_[A-Za-z0-9]+$/.test(cleanRzpId)) {
    return res.status(400).json({ message: "Razorpay linked account id must look like acc_XXXXXXXX" });
  }

  const data = {
    accountHolderName: String(accountHolderName).trim(),
    bankName: bankName ? String(bankName).trim() : null,
    accountNumber: cleanAccountNumber || null,
    ifsc: cleanIfsc || null,
    upiId: upiId ? String(upiId).trim() : null,
    razorpayAccountId: cleanRzpId || null,
    active: active === undefined ? true : Boolean(active),
    updatedBy: req.user.id,
  };

  const existing = await prisma.societyAccount.findFirst({
    where: { societyId: sid(req) },
    orderBy: { createdAt: "asc" },
  });
  const account = existing
    ? await prisma.societyAccount.update({ where: { id: existing.id }, data })
    : await prisma.societyAccount.create({ data: { ...data, societyId: req.user.societyId } });
  res.json({ account });
});

/* ------------------------------ Finance ---------------------------------- */
adminRouter.get("/finance", async (req, res) => {
  const [flats, bills, expenses] = await Promise.all([
    prisma.flat.findMany({ where: { societyId: sid(req) }, orderBy: { flatNo: "asc" } }),
    prisma.bill.findMany({ where: { flat: { societyId: sid(req) } } }),
    prisma.expense.findMany({ where: { societyId: sid(req) } }),
  ]);

  const totalCollected = bills.filter((b) => b.status === "paid").reduce((s, b) => s + b.amount, 0);
  const totalPending = bills.filter((b) => b.status === "pending").reduce((s, b) => s + b.amount, 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const balance = totalCollected - totalExpenses;

  const perFlat = flats.map((f) => {
    const flatBills = bills.filter((b) => b.flatId === f.id);
    const paid = flatBills.filter((b) => b.status === "paid").reduce((s, b) => s + b.amount, 0);
    const pending = flatBills.filter((b) => b.status === "pending").reduce((s, b) => s + b.amount, 0);
    return { flatId: f.id, flatNo: f.flatNo, paid, pending };
  });

  const dueList = perFlat.filter((f) => f.pending > 0);

  res.json({
    totalCollected,
    totalPending,
    totalExpenses,
    balance,
    perFlat,
    dueList,
  });
});

// Generate a monthly bill for every flat (skips flats that already have it).
adminRouter.post("/bills", async (req, res) => {
  const { period, amount, dueDate } = req.body || {};
  if (!period || amount === undefined) {
    return res.status(400).json({ message: "period and amount are required" });
  }
  const flats = await prisma.flat.findMany({ where: { societyId: sid(req) } });
  let created = 0;
  for (const flat of flats) {
    const existing = await prisma.bill.findFirst({ where: { flatId: flat.id, period } });
    if (existing) continue;
    await prisma.bill.create({
      data: {
        flatId: flat.id,
        period,
        amount: Number(amount),
        dueDate: dueDate || `${period}-10`,
        status: "pending",
      },
    });
    created++;
  }
  res.json({ ok: true, created });
});

// Record a CASH payment for a bill (collected offline by a society member).
// Captures who collected it + their phone so there's an audit trail.
adminRouter.post("/bills/:id/cash", async (req, res) => {
  const { collectedBy, collectorPhone } = req.body || {};
  if (!collectedBy || !String(collectedBy).trim()) {
    return res.status(400).json({ message: "collectedBy (who collected the cash) is required" });
  }
  const bill = await prisma.bill.findFirst({
    where: { id: req.params.id, flat: { societyId: sid(req) } },
    include: { flat: true },
  });
  if (!bill) return res.status(404).json({ message: "Bill not found" });
  if (bill.status === "paid") return res.status(400).json({ message: "Bill already paid" });

  const updated = await prisma.bill.update({
    where: { id: bill.id },
    data: {
      status: "paid",
      paidAt: new Date(),
      paymentMode: "cash",
      paymentRef: "CASH-" + bill.id.slice(0, 8).toUpperCase(),
      collectedBy: String(collectedBy).trim(),
      collectorPhone: collectorPhone ? String(collectorPhone).trim() : null,
    },
    include: { flat: true },
  });
  res.json({ bill: serializeBill(updated) });
});

// Push a reminder to every resident who still has a pending bill.
adminRouter.post("/reminders", async (req, res) => {
  const pendingBills = await prisma.bill.findMany({
    where: { status: "pending", flat: { societyId: sid(req) } },
    include: { flat: { include: { residents: true } } },
  });
  const notified = new Set();
  for (const bill of pendingBills) {
    for (const resident of bill.flat.residents) {
      if (resident.role !== "resident" || !resident.expoPushToken) continue;
      if (notified.has(resident.id)) continue;
      notified.add(resident.id);
      await sendPush(
        resident.expoPushToken,
        "Maintenance payment reminder",
        `Flat ${bill.flat.flatNo} has pending society maintenance. Please pay at the earliest.`,
        { type: "reminder" }
      );
    }
  }
  res.json({ ok: true, notified: notified.size });
});

/* ------------------------------ Expenses --------------------------------- */
adminRouter.get("/expenses", async (req, res) => {
  const expenses = await prisma.expense.findMany({
    where: { societyId: sid(req) },
    orderBy: { date: "desc" },
  });
  res.json({ expenses });
});

adminRouter.post("/expenses", async (req, res) => {
  const { label, amount, date } = req.body || {};
  if (!label || amount === undefined) {
    return res.status(400).json({ message: "label and amount are required" });
  }
  const expense = await prisma.expense.create({
    data: {
      label,
      amount: Number(amount),
      date: date ? new Date(date) : new Date(),
      createdBy: req.user.id,
      societyId: req.user.societyId,
    },
  });
  res.status(201).json({ expense });
});

/* --------------------------- Reports & backup ---------------------------- */
// Distinct wings/blocks for the admin's society (for the report picker).
adminRouter.get("/blocks", async (req, res) => {
  res.json({ blocks: await listBlocks(sid(req)) });
});

// Wing-wise (block) report data. ?block=B  (omit or __all__ for whole society)
adminRouter.get("/report", async (req, res) => {
  try {
    const report = await buildWingReport(sid(req), { block: req.query.block });
    res.json({ report });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

// Full society backup as JSON (for download in the app / on web).
adminRouter.get("/backup", async (req, res) => {
  try {
    const backup = await buildSocietyBackup(sid(req), { period: req.query.period });
    res.json({ backup: backup.json, stats: backup.stats });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

// Email the full backup to all admins of this society right now.
adminRouter.post("/backup/email", async (req, res) => {
  try {
    const result = await emailSocietyBackup(sid(req), { period: req.body?.period });
    res.json(result);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});
