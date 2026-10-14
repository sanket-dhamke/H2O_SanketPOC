import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../prisma.js";
import { authRequired, roleRequired } from "../auth.js";
import { validatePassword } from "../passwordPolicy.js";
import { HOME_SERVICES } from "../homeServicesCatalog.js";
import { acceptOffer, declineOffer, tickOffers } from "../providerDispatch.js";
import { approveProviderAccount, ensureProviderJoinCode, rejectProviderAccount, rotateProviderJoinCode } from "../providerJoin.js";

export const providersRouter = Router();

const SLUGS = new Set(HOME_SERVICES.map((s) => s.slug));

function ymd(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function cleanSlugs(value) {
  const list = Array.isArray(value) ? value : String(value || "").split(",");
  const slugs = [...new Set(list.map((s) => String(s).trim()).filter((s) => SLUGS.has(s)))];
  return slugs;
}

function serializeProvider(row) {
  const paidUntil = row.packPaidUntil ? row.packPaidUntil.toISOString() : null;
  const packActive = row.fallback || (row.active && row.packPaidUntil && row.packPaidUntil.getTime() >= Date.now());
  return {
    id: row.id,
    userId: row.userId,
    name: row.user?.name || "",
    email: row.user?.email || "",
    phone: row.phone,
    serviceSlugs: String(row.serviceSlugs || "").split(",").filter(Boolean),
    active: row.active && row.user?.active !== false,
    fallback: row.fallback,
    packAmount: row.packAmount,
    packPaidUntil: paidUntil,
    packActive,
    ratingAvg: row.ratingAvg,
    ratingCount: row.ratingCount,
    pendingApproval: !!row.user?.pendingApproval,
    createdAt: row.createdAt,
  };
}

function jobView(row) {
  const left = row.offerExpiresAt ? Math.max(0, Math.ceil((row.offerExpiresAt.getTime() - Date.now()) / 1000)) : 0;
  return {
    id: row.id,
    serviceSlug: row.serviceSlug,
    serviceName: row.serviceName,
    packageName: row.packageName,
    amount: row.amount,
    scheduledDate: row.scheduledDate,
    slot: row.slot,
    notes: row.notes || "",
    status: row.status,
    residentName: row.resident?.name || null,
    flatNo: row.resident?.flat?.flatNo || null,
    societyName: row.society?.name || null,
    offerExpiresAt: row.offerExpiresAt,
    secondsLeft: row.status === "offered" ? left : 0,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    rating: row.rating,
  };
}

providersRouter.get("/owner/providers", authRequired, roleRequired("superadmin"), async (_req, res) => {
  await tickOffers().catch(() => {});
  const providerJoinCode = await ensureProviderJoinCode();
  const rows = await prisma.serviceProvider.findMany({
    include: { user: true, packPayments: true },
    orderBy: { createdAt: "desc" },
  });
  const revenue = rows.reduce(
    (sum, row) => sum + row.packPayments.reduce((s, p) => s + (p.amount || 0), 0),
    0
  );
  res.json({
    providers: rows.map(serializeProvider),
    services: HOME_SERVICES.map((s) => ({ slug: s.slug, name: s.name })),
    annualPackDefault: 4999,
    acceptWindowSeconds: 60,
    providerJoinCode,
    revenue,
  });
});

providersRouter.post("/owner/provider-join-code/rotate", authRequired, roleRequired("superadmin"), async (_req, res) => {
  const providerJoinCode = await rotateProviderJoinCode();
  res.json({ providerJoinCode });
});

providersRouter.post("/owner/providers", authRequired, roleRequired("superadmin"), async (req, res) => {
  const b = req.body || {};
  const name = String(b.name || "").trim();
  const email = String(b.email || "").trim().toLowerCase();
  const phone = String(b.phone || "").trim();
  const password = String(b.password || "");
  const slugs = cleanSlugs(b.serviceSlugs);
  if (!name || !email || !phone) return res.status(400).json({ message: "Name, email and phone are required." });
  if (!slugs.length) return res.status(400).json({ message: "Pick at least one service this professional can do." });
  const policyError = validatePassword(password);
  if (policyError) return res.status(400).json({ message: policyError });
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return res.status(409).json({ message: "An account with this email already exists." });
  const packAmount = Number(b.packAmount);
  const user = await prisma.user.create({
    data: {
      name,
      email,
      phone,
      role: "provider",
      passwordHash: bcrypt.hashSync(password, 10),
      active: true,
    },
  });
  const row = await prisma.serviceProvider.create({
    data: {
      userId: user.id,
      phone,
      serviceSlugs: slugs.join(","),
      fallback: !!b.fallback,
      packAmount: Number.isFinite(packAmount) && packAmount >= 0 ? packAmount : 4999,
    },
    include: { user: true, packPayments: true },
  });
  res.status(201).json({ provider: serializeProvider(row) });
});

providersRouter.patch("/owner/providers/:id", authRequired, roleRequired("superadmin"), async (req, res) => {
  const row = await prisma.serviceProvider.findUnique({ where: { id: req.params.id }, include: { user: true } });
  if (!row) return res.status(404).json({ message: "Professional not found" });
  const b = req.body || {};
  const data = {};
  if (b.phone !== undefined) {
    const phone = String(b.phone || "").trim();
    if (!phone) return res.status(400).json({ message: "Phone is required" });
    data.phone = phone;
    await prisma.user.update({ where: { id: row.userId }, data: { phone } });
  }
  if (b.name !== undefined) {
    const name = String(b.name || "").trim();
    if (!name) return res.status(400).json({ message: "Name is required" });
    await prisma.user.update({ where: { id: row.userId }, data: { name } });
  }
  if (b.serviceSlugs !== undefined) {
    const slugs = cleanSlugs(b.serviceSlugs);
    if (!slugs.length) return res.status(400).json({ message: "Pick at least one service." });
    data.serviceSlugs = slugs.join(",");
  }
  if (b.fallback !== undefined) data.fallback = !!b.fallback;
  if (b.packAmount !== undefined) {
    const amount = Number(b.packAmount);
    if (!Number.isFinite(amount) || amount < 0) return res.status(400).json({ message: "Pack amount is invalid" });
    data.packAmount = amount;
  }
  if (b.active !== undefined) {
    data.active = !!b.active;
    await prisma.user.update({ where: { id: row.userId }, data: { active: !!b.active } });
  }
  const updated = await prisma.serviceProvider.update({
    where: { id: row.id },
    data,
    include: { user: true, packPayments: true },
  });
  res.json({ provider: serializeProvider(updated) });
});

providersRouter.post("/owner/providers/:id/pack-payment", authRequired, roleRequired("superadmin"), async (req, res) => {
  const row = await prisma.serviceProvider.findUnique({ where: { id: req.params.id } });
  if (!row) return res.status(404).json({ message: "Professional not found" });
  const amount = Number(req.body?.amount ?? row.packAmount);
  if (!Number.isFinite(amount) || amount < 0) return res.status(400).json({ message: "Amount is invalid" });
  const until = new Date();
  until.setFullYear(until.getFullYear() + 1);
  await prisma.providerPackPayment.create({
    data: {
      providerId: row.id,
      amount,
      paidOn: ymd(),
      note: String(req.body?.note || "Annual pack").slice(0, 200),
      recordedById: req.user.id,
    },
  });
  const updated = await prisma.serviceProvider.update({
    where: { id: row.id },
    data: { packPaidUntil: until, packAmount: amount },
    include: { user: true, packPayments: true },
  });
  res.json({ provider: serializeProvider(updated) });
});

providersRouter.post("/owner/providers/:id/approve", authRequired, roleRequired("superadmin"), async (req, res) => {
  const result = await approveProviderAccount(req.params.id);
  if (result.status !== 200) return res.status(result.status).json(result.body);
  res.json({ provider: serializeProvider(result.row) });
});

providersRouter.post("/owner/providers/:id/reject", authRequired, roleRequired("superadmin"), async (req, res) => {
  const result = await rejectProviderAccount(req.params.id);
  res.status(result.status).json(result.body);
});

providersRouter.post("/owner/providers/:id/remove", authRequired, roleRequired("superadmin"), async (req, res) => {
  const row = await prisma.serviceProvider.findUnique({ where: { id: req.params.id } });
  if (!row) return res.status(404).json({ message: "Professional not found" });
  await prisma.user.update({ where: { id: row.userId }, data: { active: false } });
  await prisma.serviceProvider.update({ where: { id: row.id }, data: { active: false } });
  res.json({ ok: true });
});

async function providerFor(req) {
  return prisma.serviceProvider.findUnique({ where: { userId: req.user.id }, include: { user: true } });
}

providersRouter.get("/provider/jobs", authRequired, roleRequired("provider"), async (req, res) => {
  await tickOffers().catch(() => {});
  const me = await providerFor(req);
  if (!me || !me.active) return res.status(403).json({ message: "This professional account is not active." });
  const rows = await prisma.serviceBooking.findMany({
    where: {
      OR: [{ offerProviderId: me.id, status: "offered" }, { providerId: me.id }],
    },
    include: { resident: { include: { flat: true } }, society: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  res.json({
    provider: serializeProvider({ ...me, packPayments: [] }),
    jobs: rows.map(jobView),
    acceptWindowSeconds: 60,
  });
});

providersRouter.post("/provider/jobs/:id/accept", authRequired, roleRequired("provider"), async (req, res) => {
  await tickOffers().catch(() => {});
  const me = await providerFor(req);
  const booking = await prisma.serviceBooking.findUnique({ where: { id: req.params.id } });
  if (!me || !booking || booking.offerProviderId !== me.id || booking.status !== "offered") {
    return res.status(409).json({ message: "This job is no longer offered to you." });
  }
  if (booking.offerExpiresAt && booking.offerExpiresAt.getTime() < Date.now()) {
    return res.status(409).json({ message: "The 60-second accept window has closed." });
  }
  await acceptOffer(booking, me);
  res.json({ ok: true });
});

providersRouter.post("/provider/jobs/:id/decline", authRequired, roleRequired("provider"), async (req, res) => {
  const me = await providerFor(req);
  const booking = await prisma.serviceBooking.findUnique({ where: { id: req.params.id } });
  if (!me || !booking || booking.offerProviderId !== me.id || booking.status !== "offered") {
    return res.status(409).json({ message: "This job is no longer offered to you." });
  }
  await declineOffer(booking, me.id);
  res.json({ ok: true });
});

providersRouter.post("/provider/jobs/:id/start", authRequired, roleRequired("provider"), async (req, res) => {
  const me = await providerFor(req);
  const booking = await prisma.serviceBooking.findUnique({ where: { id: req.params.id } });
  if (!me || !booking || booking.providerId !== me.id || booking.status !== "accepted") {
    return res.status(409).json({ message: "Start the job only after you have accepted it." });
  }
  const code = String(req.body?.otp || "").trim();
  if (!/^\d{4}$/.test(code) || code !== booking.startOtp) {
    return res.status(400).json({ message: "That OTP does not match. Ask the resident for the 4-digit start code." });
  }
  await prisma.serviceBooking.update({
    where: { id: booking.id },
    data: { status: "started", startedAt: new Date() },
  });
  res.json({ ok: true });
});

providersRouter.post("/provider/jobs/:id/complete", authRequired, roleRequired("provider"), async (req, res) => {
  const me = await providerFor(req);
  const booking = await prisma.serviceBooking.findUnique({ where: { id: req.params.id } });
  if (!me || !booking || booking.providerId !== me.id || booking.status !== "started") {
    return res.status(409).json({ message: "Mark the job complete only after the resident OTP has started it." });
  }
  await prisma.serviceBooking.update({
    where: { id: booking.id },
    data: { status: "completed", completedAt: new Date() },
  });
  res.json({ ok: true });
});
