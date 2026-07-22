import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../prisma.js";
import { authRequired, roleRequired } from "../auth.js";
import { publicUser } from "../serializers.js";
import { validatePassword } from "../passwordPolicy.js";
import { isPremium } from "../plan.js";
import { emailPremiumInvoice } from "../invoice.js";
import { sendEmail, emailConfigured } from "../email.js";

// Platform-owner ("superadmin") routes. The superadmin belongs to no society and
// can see a cross-society summary and manage (create / activate) societies and
// their admins. Every route here requires the superadmin role.
export const superadminRouter = Router();

superadminRouter.use(authRequired, roleRequired("superadmin"));

// Builds per-society financial + membership aggregates from already-fetched rows.
function summarize(societies, users, bills, expenses, venueBookings) {
  const byId = new Map(
    societies.map((s) => [
      s.id,
      {
        id: s.id,
        name: s.name,
        city: s.city || null,
        address: s.address || null,
        active: s.active,
        createdAt: s.createdAt,
        // Subscription plan info.
        plan: s.plan || "free",
        premium: isPremium(s),
        planExpiresAt: s.planExpiresAt || null,
        planAmount: s.planAmount ?? null,
        flats: s._count?.flats ?? 0,
        residents: 0,
        guards: 0,
        admins: 0,
        adminEmails: [],
        collected: 0,
        pending: 0,
        expenses: 0,
        balance: 0,
        // H2O platform earnings from this society's vendor bookings.
        platformFees: 0,
        vendorBookings: 0,
      },
    ])
  );

  for (const v of venueBookings || []) {
    const row = byId.get(v.societyId);
    if (!row) continue;
    row.vendorBookings++;
    if (["paid", "completed"].includes(v.status)) row.platformFees += v.platformFee;
  }

  for (const u of users) {
    const row = byId.get(u.societyId);
    if (!row) continue;
    if (u.role === "resident") row.residents++;
    else if (u.role === "guard") row.guards++;
    else if (u.role === "admin") {
      row.admins++;
      row.adminEmails.push(u.email);
    }
  }
  for (const b of bills) {
    const row = byId.get(b.flat?.societyId);
    if (!row) continue;
    if (b.status === "paid") row.collected += b.amount;
    else row.pending += b.amount;
  }
  for (const e of expenses) {
    const row = byId.get(e.societyId);
    if (!row) continue;
    row.expenses += e.amount;
  }
  for (const row of byId.values()) row.balance = row.collected - row.expenses;
  return [...byId.values()];
}

// Cross-society snapshot used by both the overview totals and the societies list.
async function loadSummaries() {
  const [societies, users, bills, expenses, venueBookings] = await Promise.all([
    prisma.society.findMany({
      include: { _count: { select: { flats: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.user.findMany({
      where: { role: { in: ["resident", "guard", "admin"] } },
      select: { societyId: true, role: true, email: true },
    }),
    prisma.bill.findMany({ include: { flat: { select: { societyId: true } } } }),
    prisma.expense.findMany({ select: { societyId: true, amount: true } }),
    prisma.venueBooking.findMany({ select: { societyId: true, status: true, platformFee: true } }),
  ]);
  return summarize(societies, users, bills, expenses, venueBookings);
}

// GET /api/superadmin/overview — platform-wide totals for the owner dashboard.
superadminRouter.get("/overview", async (_req, res) => {
  const rows = await loadSummaries();
  const totals = rows.reduce(
    (t, s) => {
      t.flats += s.flats;
      t.residents += s.residents;
      t.guards += s.guards;
      t.admins += s.admins;
      t.collected += s.collected;
      t.pending += s.pending;
      t.expenses += s.expenses;
      t.platformFees += s.platformFees;
      return t;
    },
    { flats: 0, residents: 0, guards: 0, admins: 0, collected: 0, pending: 0, expenses: 0, platformFees: 0 }
  );

  // H2O's own revenue: yearly subscriptions from premium societies + platform
  // fees earned from vendor venue bookings.
  const premiumSocieties = rows.filter((s) => s.premium);
  const subscriptionRevenue = premiumSocieties.reduce((s, r) => s + (r.planAmount || 0), 0);

  res.json({
    societies: rows.length,
    activeSocieties: rows.filter((s) => s.active).length,
    premiumSocieties: premiumSocieties.length,
    ...totals,
    balance: totals.collected - totals.expenses,
    revenue: {
      subscriptions: subscriptionRevenue,
      platformFees: totals.platformFees,
      total: subscriptionRevenue + totals.platformFees,
    },
    // Top societies by outstanding dues, handy for the owner to act on.
    topPending: [...rows].sort((a, b) => b.pending - a.pending).slice(0, 5),
  });
});

// GET /api/superadmin/societies — full per-society list with summaries.
superadminRouter.get("/societies", async (_req, res) => {
  const rows = await loadSummaries();
  res.json({ societies: rows });
});

// POST /api/superadmin/societies — create a society and (optionally) its first admin.
superadminRouter.post("/societies", async (req, res) => {
  const { name, city, address, adminName, adminEmail, adminPassword } = req.body || {};
  if (!name || !String(name).trim()) {
    return res.status(400).json({ message: "Society name is required" });
  }

  // If admin details are provided, validate them before creating anything.
  let adminData = null;
  if (adminEmail || adminName || adminPassword) {
    if (!adminName || !adminEmail || !adminPassword) {
      return res
        .status(400)
        .json({ message: "adminName, adminEmail and adminPassword are all required to create an admin" });
    }
    const policyError = validatePassword(adminPassword);
    if (policyError) return res.status(400).json({ message: policyError });
    const normalizedEmail = String(adminEmail).trim().toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) return res.status(409).json({ message: "A user with this email already exists" });
    adminData = { name: adminName, email: normalizedEmail, passwordHash: bcrypt.hashSync(adminPassword, 10) };
  }

  const society = await prisma.society.create({
    data: {
      name: String(name).trim(),
      city: city ? String(city).trim() : null,
      address: address ? String(address).trim() : null,
    },
  });

  let admin = null;
  if (adminData) {
    admin = await prisma.user.create({
      data: { ...adminData, role: "admin", societyId: society.id },
    });
  }

  res.status(201).json({ society, admin: admin ? publicUser(admin) : null });
});

// PATCH /api/superadmin/societies/:id — edit details, activate, or set plan.
superadminRouter.patch("/societies/:id", async (req, res) => {
  const { name, city, address, active, plan, planExpiresAt, planAmount, planNote } = req.body || {};
  const society = await prisma.society.findUnique({ where: { id: req.params.id } });
  if (!society) return res.status(404).json({ message: "Society not found" });

  const data = {};
  if (name !== undefined) data.name = String(name).trim();
  if (city !== undefined) data.city = city ? String(city).trim() : null;
  if (address !== undefined) data.address = address ? String(address).trim() : null;
  if (active !== undefined) data.active = Boolean(active);
  if (plan !== undefined) {
    if (!["free", "premium"].includes(plan)) return res.status(400).json({ message: "plan must be 'free' or 'premium'" });
    data.plan = plan;
    // Default a 1-year term when upgrading to premium without an explicit date.
    if (plan === "premium" && planExpiresAt === undefined && !society.planExpiresAt) {
      const d = new Date();
      d.setFullYear(d.getFullYear() + 1);
      data.planExpiresAt = d;
    }
    if (plan === "free") data.planExpiresAt = null;
  }
  if (planExpiresAt !== undefined) data.planExpiresAt = planExpiresAt ? new Date(planExpiresAt) : null;
  if (planAmount !== undefined) data.planAmount = planAmount === null || planAmount === "" ? null : Number(planAmount);
  if (planNote !== undefined) data.planNote = planNote || null;

  const updated = await prisma.society.update({ where: { id: society.id }, data });

  // Optionally email the premium invoice to the society's admins right away.
  let invoice = null;
  if (req.body?.sendInvoice && updated.plan === "premium") {
    try {
      invoice = await emailPremiumInvoice(updated.id, { amount: updated.planAmount, expiresAt: updated.planExpiresAt, note: updated.planNote });
    } catch (e) {
      invoice = { error: e.message };
    }
  }
  res.json({ society: updated, invoice });
});

// POST /api/superadmin/societies/:id/invoice — (re)send the premium invoice email.
superadminRouter.post("/societies/:id/invoice", async (req, res) => {
  const society = await prisma.society.findUnique({ where: { id: req.params.id } });
  if (!society) return res.status(404).json({ message: "Society not found" });
  try {
    const result = await emailPremiumInvoice(society.id, req.body || {});
    res.json(result);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

// POST /api/superadmin/test-email — verify email delivery is configured.
superadminRouter.post("/test-email", async (req, res) => {
  let to = String(req.body?.to || req.user.email || "").trim();
  if (!to) {
    const me = await prisma.user.findUnique({ where: { id: req.user.id }, select: { email: true } });
    to = me?.email || "";
  }
  if (!to) return res.status(400).json({ message: "Provide a 'to' address" });
  const r = await sendEmail({
    to,
    subject: "H2O test email",
    text: "This is a test email from H2O. If you received this, email delivery is working.",
    html: "<p>This is a <b>test email</b> from H2O. If you received this, email delivery is working. ✅</p>",
  });
  res.json({ configured: emailConfigured, to, ...r });
});

// GET /api/superadmin/users?query= — search users across ALL societies (for
// password resets when someone — even a society admin — forgets their password).
superadminRouter.get("/users", async (req, res) => {
  const q = String(req.query.query || "").trim();
  const where = q
    ? {
        OR: [
          { email: { contains: q.toLowerCase() } },
          { name: { contains: q, mode: "insensitive" } },
        ],
      }
    : {};
  const users = await prisma.user.findMany({
    where,
    include: { society: true, flat: true },
    orderBy: { email: "asc" },
    take: 30,
  });
  res.json({ users: users.map(publicUser) });
});

// POST /api/superadmin/users/:id/reset-password — set a new password for any user.
superadminRouter.post("/users/:id/reset-password", async (req, res) => {
  const { newPassword } = req.body || {};
  const policyError = validatePassword(newPassword);
  if (policyError) return res.status(400).json({ message: policyError });
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) return res.status(404).json({ message: "User not found" });
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: bcrypt.hashSync(newPassword, 10) },
  });
  res.json({ ok: true, user: publicUser(user) });
});

// POST /api/superadmin/societies/:id/admins — add an admin to an existing society.
superadminRouter.post("/societies/:id/admins", async (req, res) => {
  const { name, email, password, phone } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ message: "name, email and password are required" });
  }
  const society = await prisma.society.findUnique({ where: { id: req.params.id } });
  if (!society) return res.status(404).json({ message: "Society not found" });

  const policyError = validatePassword(password);
  if (policyError) return res.status(400).json({ message: policyError });

  const normalizedEmail = String(email).trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) return res.status(409).json({ message: "A user with this email already exists" });

  const admin = await prisma.user.create({
    data: {
      name,
      email: normalizedEmail,
      phone: phone || null,
      role: "admin",
      societyId: society.id,
      passwordHash: bcrypt.hashSync(password, 10),
    },
  });
  res.status(201).json({ admin: publicUser(admin) });
});
