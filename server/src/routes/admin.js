import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../prisma.js";
import { authRequired, roleRequired } from "../auth.js";
import { publicUser, serializeBill, serializeVenueBooking, serializeVisitor, serializeStaffAttendance } from "../serializers.js";
import { validatePassword } from "../passwordPolicy.js";
import { sendPush } from "../push.js";
import { buildSocietyBackup, emailSocietyBackup, buildWingReport, listBlocks } from "../backup.js";
import { parseCsv } from "../csv.js";
import { isPremium } from "../plan.js";
import { razorpay, razorpayEnabled } from "../razorpay.js";
import { onBillPaid } from "../paymentNotify.js";

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
  // Email the resident a receipt PDF + notify admins.
  onBillPaid(updated.id);
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

// Preschool-flavored report: visitor entries/exits + staff attendance history.
// Used by preschool tenants instead of the wing-wise financial report.
adminRouter.get("/school-report", async (req, res) => {
  const societyId = sid(req);
  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 180);
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceDate = since.toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);

  const society = await prisma.society.findUnique({ where: { id: societyId }, select: { name: true } });
  const [visitors, staff] = await Promise.all([
    prisma.visitor.findMany({
      where: { flat: { societyId } },
      include: { flat: true },
      orderBy: { createdAt: "desc" },
      take: 300,
    }),
    prisma.staffAttendance.findMany({
      where: { societyId, date: { gte: sinceDate } },
      orderBy: { inAt: "desc" },
    }),
  ]);

  const visitorRows = visitors.map((v) => ({ ...serializeVisitor(v), flatNo: v.flat?.flatNo || null }));
  const staffRows = staff.map(serializeStaffAttendance);
  res.json({
    report: {
      societyName: society?.name || "",
      generatedAt: new Date().toISOString(),
      days,
      visitors: visitorRows,
      staff: staffRows,
      totals: {
        visitorsTotal: visitorRows.length,
        visitorsToday: visitorRows.filter((v) => String(v.createdAt).slice(0, 10) === today).length,
        insideNow: visitorRows.filter((v) => !v.exitAt && v.status !== "rejected").length,
        staffRecords: staffRows.length,
        staffOnPremise: staffRows.filter((s) => s.date === today && !s.outAt).length,
      },
    },
  });
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

/* ------------------------- Onboarding / bulk setup ----------------------- */
// Compliant temporary password for bulk-created residents.
function tempPassword() {
  return "H2o" + Math.floor(1000 + Math.random() * 9000) + "x!";
}

// Generate a whole society structure at once: wings × floors × flats-per-floor.
// Flat numbers look like  A-101, A-102 ... B-201  (block = wing).
adminRouter.post("/flats/generate", async (req, res) => {
  let { wings, floors, flatsPerFloor, startFloor = 1, startUnit = 1 } = req.body || {};
  if (typeof wings === "string") wings = wings.split(",").map((w) => w.trim()).filter(Boolean);
  if (!Array.isArray(wings) || wings.length === 0) wings = [""]; // single unnamed wing
  floors = Number(floors);
  flatsPerFloor = Number(flatsPerFloor);
  startFloor = Number(startFloor);
  startUnit = Number(startUnit);
  if (!floors || !flatsPerFloor || floors < 1 || flatsPerFloor < 1) {
    return res.status(400).json({ message: "floors and flatsPerFloor must be at least 1" });
  }
  const total = wings.length * floors * flatsPerFloor;
  if (total > 3000) return res.status(400).json({ message: `That would create ${total} flats. Please keep it under 3000.` });

  const existing = new Set(
    (await prisma.flat.findMany({ where: { societyId: sid(req) }, select: { flatNo: true } })).map((f) => f.flatNo)
  );
  const toCreate = [];
  const sample = [];
  for (const w of wings) {
    for (let fl = startFloor; fl < startFloor + floors; fl++) {
      for (let u = startUnit; u < startUnit + flatsPerFloor; u++) {
        const unit = `${fl}${String(u).padStart(2, "0")}`;
        const flatNo = w ? `${w}-${unit}` : unit;
        if (existing.has(flatNo)) continue;
        existing.add(flatNo);
        toCreate.push({ flatNo, block: w || null, societyId: req.user.societyId });
        if (sample.length < 6) sample.push(flatNo);
      }
    }
  }
  if (toCreate.length) await prisma.flat.createMany({ data: toCreate, skipDuplicates: true });
  res.json({ created: toCreate.length, skipped: total - toCreate.length, sample });
});

// Bulk import flats (and optionally their owners as resident logins) from CSV.
// CSV headers (case-insensitive): flatNo, block, ownerName, ownerEmail, ownerPhone
// Optionally: password (else a temp one is generated & returned).
adminRouter.post("/flats/import", async (req, res) => {
  const { csv, rows: bodyRows, createResidents = true } = req.body || {};
  let rows = [];
  if (Array.isArray(bodyRows)) rows = bodyRows;
  else if (csv) rows = parseCsv(csv);
  else return res.status(400).json({ message: "Provide 'csv' text or a 'rows' array" });
  if (rows.length === 0) return res.status(400).json({ message: "No data rows found" });
  if (rows.length > 3000) return res.status(400).json({ message: "Please import under 3000 rows at a time" });

  const societyId = req.user.societyId;
  const summary = { flatsCreated: 0, flatsSkipped: 0, residentsCreated: 0, credentials: [], errors: [] };

  const existingFlats = new Set(
    (await prisma.flat.findMany({ where: { societyId }, select: { flatNo: true } })).map((f) => f.flatNo)
  );

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] || {};
    const flatNo = (r.flatno || r.flat || r["flatnumber"] || "").trim();
    const block = (r.block || r.wing || "").trim();
    const ownerName = (r.ownername || r.owner || r.name || "").trim();
    const ownerEmail = (r.owneremail || r.email || "").trim().toLowerCase();
    const ownerPhone = (r.ownerphone || r.phone || r.mobile || "").trim();
    const line = i + 2; // account for header row

    if (!flatNo) {
      summary.errors.push(`Row ${line}: missing flat number — skipped`);
      continue;
    }

    // Flat.
    if (existingFlats.has(flatNo)) {
      summary.flatsSkipped++;
    } else {
      await prisma.flat.create({ data: { flatNo, block: block || null, ownerName: ownerName || null, societyId } });
      existingFlats.add(flatNo);
      summary.flatsCreated++;
    }
    const flat = await prisma.flat.findFirst({ where: { flatNo, societyId } });

    // Optional resident login for the owner.
    if (createResidents && ownerEmail) {
      const dup = await prisma.user.findUnique({ where: { email: ownerEmail } });
      if (dup) {
        summary.errors.push(`Row ${line}: ${ownerEmail} already has an account — resident not created`);
      } else {
        const pwd = (r.password || "").trim() || tempPassword();
        const policyError = validatePassword(pwd);
        if (policyError) {
          summary.errors.push(`Row ${line}: ${ownerEmail} password rejected (${policyError})`);
        } else {
          await prisma.user.create({
            data: {
              name: ownerName || ownerEmail.split("@")[0],
              email: ownerEmail,
              phone: ownerPhone || null,
              role: "resident",
              societyId,
              flatId: flat?.id || null,
              passwordHash: bcrypt.hashSync(pwd, 10),
            },
          });
          summary.residentsCreated++;
          summary.credentials.push({ email: ownerEmail, tempPassword: r.password ? undefined : pwd, flatNo });
        }
      }
    }
  }
  res.json(summary);
});

/* ----------------------- Vendor venue marketplace ------------------------ */
// Premium perk: outside vendors book a society premise; H2O keeps a platform fee.
async function loadSocietyForPlan(req) {
  return prisma.society.findUnique({ where: { id: sid(req) } });
}
function computeFees(amount, pct) {
  const amt = Math.max(0, Number(amount) || 0);
  const p = pct === undefined || pct === null ? 10 : Math.max(0, Number(pct));
  const platformFee = Math.round(amt * p) / 100;
  return { amount: amt, platformFeePct: p, platformFee, societyNet: Math.round((amt - platformFee) * 100) / 100 };
}

// List vendor bookings. If society isn't premium, returns premium:false (+upsell).
adminRouter.get("/venue-bookings", async (req, res) => {
  const society = await loadSocietyForPlan(req);
  if (!isPremium(society)) {
    return res.json({ premium: false, bookings: [], summary: null });
  }
  const bookings = await prisma.venueBooking.findMany({ where: { societyId: sid(req) }, orderBy: { date: "desc" } });
  const paid = bookings.filter((b) => ["paid", "completed"].includes(b.status));
  const summary = {
    total: bookings.length,
    societyEarnings: paid.reduce((s, b) => s + b.societyNet, 0),
    platformFees: paid.reduce((s, b) => s + b.platformFee, 0),
  };
  res.json({ premium: true, bookings: bookings.map(serializeVenueBooking), summary });
});

adminRouter.post("/venue-bookings", async (req, res) => {
  const society = await loadSocietyForPlan(req);
  if (!isPremium(society)) {
    return res.status(402).json({ premium: false, message: "The vendor marketplace is a premium feature. Ask H2O to enable premium for your society." });
  }
  const { venueName, vendorName, vendorPhone, vendorEmail, purpose, date, slot, amount, platformFeePct, notes } = req.body || {};
  if (!venueName || !vendorName || !date) {
    return res.status(400).json({ message: "venueName, vendorName and date are required" });
  }
  const fees = computeFees(amount, platformFeePct);
  const booking = await prisma.venueBooking.create({
    data: {
      societyId: req.user.societyId,
      venueName: String(venueName).trim(),
      vendorName: String(vendorName).trim(),
      vendorPhone: vendorPhone || null,
      vendorEmail: vendorEmail ? String(vendorEmail).trim().toLowerCase() : null,
      purpose: purpose || null,
      date: String(date).trim(),
      slot: slot || "full_day",
      ...fees,
      notes: notes || null,
      status: "requested",
      createdBy: req.user.id,
    },
  });
  res.status(201).json({ booking: serializeVenueBooking(booking) });
});

adminRouter.patch("/venue-bookings/:id", async (req, res) => {
  const society = await loadSocietyForPlan(req);
  if (!isPremium(society)) return res.status(402).json({ premium: false, message: "Premium feature" });
  const existing = await prisma.venueBooking.findFirst({ where: { id: req.params.id, societyId: sid(req) } });
  if (!existing) return res.status(404).json({ message: "Booking not found" });

  const { status, amount, platformFeePct, paymentRef, notes } = req.body || {};
  const data = {};
  if (amount !== undefined || platformFeePct !== undefined) {
    Object.assign(data, computeFees(amount ?? existing.amount, platformFeePct ?? existing.platformFeePct));
  }
  if (notes !== undefined) data.notes = notes || null;
  if (paymentRef !== undefined) data.paymentRef = paymentRef || null;
  if (status !== undefined) {
    const allowed = ["requested", "approved", "rejected", "paid", "completed", "cancelled"];
    if (!allowed.includes(status)) return res.status(400).json({ message: "Invalid status" });
    data.status = status;
    if (status === "paid") data.paidAt = new Date();
  }
  const booking = await prisma.venueBooking.update({ where: { id: existing.id }, data });
  res.json({ booking: serializeVenueBooking(booking) });
});

adminRouter.delete("/venue-bookings/:id", async (req, res) => {
  const existing = await prisma.venueBooking.findFirst({ where: { id: req.params.id, societyId: sid(req) } });
  if (!existing) return res.status(404).json({ message: "Booking not found" });
  await prisma.venueBooking.delete({ where: { id: existing.id } });
  res.json({ ok: true });
});

// Create a Razorpay Payment Link the vendor can pay. When the society has a
// Razorpay Route linked account, the society's 90% (societyNet) is transferred
// to it and H2O keeps the 10% platform fee on the primary account.
adminRouter.post("/venue-bookings/:id/payment-link", async (req, res) => {
  const society = await loadSocietyForPlan(req);
  if (!isPremium(society)) return res.status(402).json({ premium: false, message: "Premium feature" });
  const booking = await prisma.venueBooking.findFirst({ where: { id: req.params.id, societyId: sid(req) } });
  if (!booking) return res.status(404).json({ message: "Booking not found" });
  if (["paid", "completed"].includes(booking.status)) {
    return res.status(400).json({ message: "This booking is already paid" });
  }
  if (booking.amount <= 0) return res.status(400).json({ message: "Set an amount before creating a payment link" });
  if (!razorpayEnabled) {
    return res.json({ enabled: false, message: "Razorpay isn't configured. Record the payment manually with 'Mark paid'." });
  }

  const account = await prisma.societyAccount.findFirst({
    where: { societyId: sid(req) },
    orderBy: { createdAt: "asc" },
  });
  const amountPaise = Math.round(booking.amount * 100);
  const netPaise = Math.round(booking.societyNet * 100);

  // Route the society's share to its linked account (H2O keeps the remainder).
  const transfers =
    account?.active && account?.razorpayAccountId
      ? [{ account: account.razorpayAccountId, amount: netPaise, currency: "INR", notes: { venueBookingId: booking.id } }]
      : undefined;

  try {
    const link = await razorpay.paymentLink.create({
      amount: amountPaise,
      currency: "INR",
      description: `${booking.venueName} · ${booking.date} (${booking.slot})`,
      customer: {
        name: booking.vendorName,
        contact: booking.vendorPhone || undefined,
        email: booking.vendorEmail || undefined,
      },
      notify: { sms: !!booking.vendorPhone, email: !!booking.vendorEmail },
      reminder_enable: true,
      notes: { venueBookingId: booking.id, societyId: sid(req) },
      ...(transfers ? { options: { order: { transfers } } } : {}),
    });
    const updated = await prisma.venueBooking.update({
      where: { id: booking.id },
      data: {
        paymentLinkId: link.id,
        paymentLinkUrl: link.short_url,
        status: booking.status === "requested" ? "approved" : booking.status,
      },
    });
    res.json({ enabled: true, routed: !!transfers, url: link.short_url, booking: serializeVenueBooking(updated) });
  } catch (err) {
    const msg = err?.error?.description || err?.message || "Payment link failed";
    console.error("Razorpay payment link failed:", err?.error || err?.message);
    const routeIssue = transfers && /route|transfer|linked account/i.test(msg);
    res.status(502).json({
      message: routeIssue
        ? "Payment link failed: ensure Razorpay Route is enabled and the society's linked account id is valid."
        : `Could not create payment link (${msg})`,
    });
  }
});

// Poll Razorpay for the payment link status and mark the booking paid if settled.
adminRouter.post("/venue-bookings/:id/sync", async (req, res) => {
  const booking = await prisma.venueBooking.findFirst({ where: { id: req.params.id, societyId: sid(req) } });
  if (!booking) return res.status(404).json({ message: "Booking not found" });
  if (!booking.paymentLinkId) return res.status(400).json({ message: "No payment link to check" });
  if (!razorpayEnabled) return res.json({ enabled: false });

  try {
    const link = await razorpay.paymentLink.fetch(booking.paymentLinkId);
    if (link.status === "paid") {
      const paymentRef = link.payments?.[0]?.payment_id || link.id;
      const updated = await prisma.venueBooking.update({
        where: { id: booking.id },
        data: { status: "paid", paidAt: new Date(), paymentRef },
      });
      return res.json({ paid: true, booking: serializeVenueBooking(updated) });
    }
    res.json({ paid: false, status: link.status });
  } catch (err) {
    res.status(502).json({ message: err?.error?.description || err?.message || "Could not check payment status" });
  }
});
