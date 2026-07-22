import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../prisma.js";
import { authRequired, roleRequired } from "../auth.js";
import { publicUser } from "../serializers.js";
import { validatePassword } from "../passwordPolicy.js";
import { isPremium } from "../plan.js";
import { emailPremiumInvoice } from "../invoice.js";
import { sendEmail, emailConfigured } from "../email.js";
import { ensureUniqueSlug } from "../slug.js";

// Platform-owner ("superadmin") routes. The superadmin belongs to no society and
// can see a cross-society summary and manage (create / activate) societies and
// their admins. Every route here requires the superadmin role.
export const superadminRouter = Router();

superadminRouter.use(authRequired, roleRequired("superadmin"));

function baseRow(s) {
  return {
    id: s.id,
    name: s.name,
    city: s.city || null,
    address: s.address || null,
    active: s.active,
    createdAt: s.createdAt,
    orgType: s.orgType || "society",
    slug: s.slug || null,
    logoUrl: s.logoUrl || null,
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
    platformFees: 0,
    vendorBookings: 0,
  };
}

// Cross-society snapshot used by both the overview totals and the societies list.
// Aggregation is pushed to the DATABASE (groupBy + one grouped raw join for
// bills) instead of loading every row into Node — so this scales to many
// societies / hundreds of thousands of bills with a tiny, constant memory cost.
async function loadSummaries() {
  const societies = await prisma.society.findMany({
    include: { _count: { select: { flats: true } } },
    orderBy: { createdAt: "asc" },
  });
  const byId = new Map(societies.map((s) => [s.id, baseRow(s)]));

  const [userGroups, adminList, billRows, expenseGroups, venueGroups] = await Promise.all([
    prisma.user.groupBy({
      by: ["societyId", "role"],
      where: { role: { in: ["resident", "guard", "admin"] } },
      _count: { _all: true },
    }),
    // Admin emails are shown in the UI; there are few admins, so fetch just those.
    prisma.user.findMany({ where: { role: "admin" }, select: { societyId: true, email: true } }),
    // Bills live under flats, so group by the flat's societyId in SQL.
    prisma.$queryRaw`
      SELECT f."societyId" AS "societyId", b.status AS status,
             COALESCE(SUM(b.amount), 0) AS amount,
             COALESCE(SUM(b."paidAmount"), 0) AS paid
      FROM "Bill" b JOIN "Flat" f ON f.id = b."flatId"
      GROUP BY f."societyId", b.status`,
    prisma.expense.groupBy({ by: ["societyId"], _sum: { amount: true } }),
    prisma.venueBooking.groupBy({ by: ["societyId", "status"], _sum: { platformFee: true }, _count: { _all: true } }),
  ]);

  for (const g of userGroups) {
    const row = byId.get(g.societyId);
    if (!row) continue;
    if (g.role === "resident") row.residents = g._count._all;
    else if (g.role === "guard") row.guards = g._count._all;
    else if (g.role === "admin") row.admins = g._count._all;
  }
  for (const a of adminList) {
    const row = byId.get(a.societyId);
    if (row) row.adminEmails.push(a.email);
  }
  for (const r of billRows) {
    const row = byId.get(r.societyId);
    if (!row) continue;
    const amount = Number(r.amount) || 0;
    // Partial-payment aware: fully-paid rows count their full amount as paid.
    const paid = r.status === "paid" ? amount : Number(r.paid) || 0;
    row.collected += paid;
    row.pending += Math.max(0, amount - paid);
  }
  for (const g of expenseGroups) {
    const row = byId.get(g.societyId);
    if (row) row.expenses = g._sum.amount || 0;
  }
  for (const g of venueGroups) {
    const row = byId.get(g.societyId);
    if (!row) continue;
    row.vendorBookings += g._count._all;
    if (["paid", "completed"].includes(g.status)) row.platformFees += g._sum.platformFee || 0;
  }
  for (const row of byId.values()) row.balance = row.collected - row.expenses;
  return [...byId.values()];
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
  const { name, city, address, adminName, adminEmail, adminPassword, orgType, logoUrl } = req.body || {};
  if (!name || !String(name).trim()) {
    return res.status(400).json({ message: "Society name is required" });
  }
  if (orgType !== undefined && !["society", "preschool"].includes(orgType)) {
    return res.status(400).json({ message: "orgType must be 'society' or 'preschool'" });
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

  const slug = await ensureUniqueSlug(name);
  const society = await prisma.society.create({
    data: {
      name: String(name).trim(),
      city: city ? String(city).trim() : null,
      address: address ? String(address).trim() : null,
      orgType: orgType || "society",
      logoUrl: logoUrl ? String(logoUrl).trim() : null,
      slug,
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
  const { name, city, address, active, plan, planExpiresAt, planAmount, planNote, orgType, logoUrl } = req.body || {};
  const society = await prisma.society.findUnique({ where: { id: req.params.id } });
  if (!society) return res.status(404).json({ message: "Society not found" });

  const data = {};
  if (name !== undefined) data.name = String(name).trim();
  if (city !== undefined) data.city = city ? String(city).trim() : null;
  if (address !== undefined) data.address = address ? String(address).trim() : null;
  if (logoUrl !== undefined) data.logoUrl = logoUrl ? String(logoUrl).trim() : null;
  if (active !== undefined) data.active = Boolean(active);
  if (orgType !== undefined) {
    if (!["society", "preschool"].includes(orgType)) return res.status(400).json({ message: "orgType must be 'society' or 'preschool'" });
    data.orgType = orgType;
  }
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
