import { Router } from "express";
import { prisma } from "../prisma.js";
import { authRequired, roleRequired } from "../auth.js";
import { enqueuePush } from "../queue.js";
import { HOME_SERVICES, HOME_SERVICE_SLOTS, findHomeService, findPackage } from "../homeServicesCatalog.js";
import { offerBooking, slotAvailability, slotIsOpen, tickOffers, ACCEPT_WINDOW_MS } from "../providerDispatch.js";

export const homeServicesRouter = Router();

const sid = (req) => req.user.societyId || "__none__";

function serialize(row, extra = {}) {
  return {
    id: row.id,
    serviceSlug: row.serviceSlug,
    serviceName: row.serviceName,
    packageId: row.packageId,
    packageName: row.packageName,
    amount: row.amount,
    scheduledDate: row.scheduledDate,
    slot: row.slot,
    notes: row.notes || "",
    partnerName: row.partnerName || null,
    providerId: row.providerId || null,
    status: row.status,
    startOtp: extra.includeOtp ? row.startOtp || null : null,
    rating: row.rating ?? null,
    ratingNote: row.ratingNote || "",
    offerExpiresAt: row.offerExpiresAt || null,
    flatId: row.flatId || null,
    residentId: row.residentId,
    residentName: row.resident?.name || extra.residentName || null,
    flatNo: row.resident?.flat?.flatNo || extra.flatNo || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function notifyAdmins(societyId, title, body, data = {}) {
  if (!societyId) return;
  const admins = await prisma.user.findMany({
    where: { societyId, role: "admin", active: true, notifyEnabled: true, expoPushToken: { not: null } },
    select: { expoPushToken: true },
  });
  admins.forEach((u) => enqueuePush(u.expoPushToken, title, body, data));
}

homeServicesRouter.get("/home-services", authRequired, (_req, res) => {
  res.json({ services: HOME_SERVICES, slots: HOME_SERVICE_SLOTS, acceptWindowSeconds: ACCEPT_WINDOW_MS / 1000 });
});

homeServicesRouter.get("/home-services/availability", authRequired, async (req, res) => {
  const slug = String(req.query.serviceSlug || "");
  const date = String(req.query.date || "");
  if (!findHomeService(slug)) return res.status(404).json({ message: "Unknown service" });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ message: "date must be YYYY-MM-DD" });
  await tickOffers().catch(() => {});
  const slots = await slotAvailability(slug, date);
  res.json({ slots, acceptWindowSeconds: ACCEPT_WINDOW_MS / 1000 });
});

homeServicesRouter.get("/home-service-bookings", authRequired, async (req, res) => {
  await tickOffers().catch(() => {});
  const societyId = sid(req);
  const where =
    req.user.role === "admin" || req.user.role === "superadmin"
      ? req.user.role === "superadmin"
        ? {}
        : { societyId }
      : { residentId: req.user.id };
  try {
    const rows = await prisma.serviceBooking.findMany({
      where,
      include: { resident: { include: { flat: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    const includeOtp = req.user.role === "resident" || req.user.role === "superadmin";
    res.json({ bookings: rows.map((r) => serialize(r, { includeOtp })) });
  } catch (e) {
    console.error("[home-services] list failed:", e.message);
    res.status(503).json({ message: "Home services bookings are not available yet." });
  }
});

homeServicesRouter.post("/home-service-bookings", authRequired, roleRequired("resident", "admin"), async (req, res) => {
  if (!req.user.societyId) return res.status(400).json({ message: "No society on this account" });
  const b = req.body || {};
  const service = findHomeService(String(b.serviceSlug || ""));
  if (!service) return res.status(404).json({ message: "Unknown service" });
  const pack = findPackage(service, String(b.packageId || ""));
  if (!pack) return res.status(400).json({ message: "Pick a package" });
  const date = String(b.scheduledDate || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ message: "scheduledDate must be YYYY-MM-DD" });
  }
  const slot = String(b.slot || "").trim();
  if (!HOME_SERVICE_SLOTS.includes(slot)) {
    return res.status(400).json({ message: "Pick a valid time slot" });
  }
  await tickOffers().catch(() => {});
  if (!(await slotIsOpen(service.slug, date, slot))) {
    return res.status(409).json({ message: "That slot is full. Pick a time when a professional is free." });
  }

  const me = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: { flat: true },
  });
  try {
    const row = await prisma.serviceBooking.create({
      data: {
        societyId: req.user.societyId,
        residentId: req.user.id,
        flatId: me?.flatId || null,
        serviceSlug: service.slug,
        serviceName: service.name,
        packageId: pack.id,
        packageName: pack.name,
        amount: pack.price,
        scheduledDate: date,
        slot,
        notes: String(b.notes || "").trim().slice(0, 500) || null,
        status: "finding",
      },
    });
    await offerBooking(row.id);
    const fresh = await prisma.serviceBooking.findUnique({
      where: { id: row.id },
      include: { resident: { include: { flat: true } } },
    });
    const booking = serialize(fresh, { residentName: me?.name, flatNo: me?.flat?.flatNo, includeOtp: true });
    notifyAdmins(
      req.user.societyId,
      "New home-service request",
      `${me?.name || "A resident"} · ${service.name} · ${pack.name}`,
      { type: "home_service", id: row.id }
    ).catch(() => {});
    res.status(201).json({ booking, acceptWindowSeconds: ACCEPT_WINDOW_MS / 1000 });
  } catch (e) {
    console.error("[home-services] create failed:", e.message);
    res.status(503).json({ message: "Could not save this booking. Try again." });
  }
});

homeServicesRouter.patch("/home-service-bookings/:id", authRequired, async (req, res) => {
  const status = String(req.body?.status || "").trim();
  const allowed = {
    resident: ["cancelled"],
    admin: ["cancelled"],
    superadmin: ["cancelled"],
  };
  const ok = (allowed[req.user.role] || []).includes(status);
  if (!ok) return res.status(400).json({ message: "Cannot set that status" });

  const where =
    req.user.role === "admin"
      ? { id: req.params.id, societyId: sid(req) }
      : req.user.role === "superadmin"
        ? { id: req.params.id }
        : { id: req.params.id, residentId: req.user.id };

  try {
    const existing = await prisma.serviceBooking.findFirst({ where });
    if (!existing) return res.status(404).json({ message: "Booking not found" });
    const cancellable = ["requested", "finding", "offered", "accepted", "confirmed", "assigned"];
    if (req.user.role === "resident" && !cancellable.includes(existing.status)) {
      return res.status(409).json({ message: "This booking can no longer be cancelled" });
    }
    const row = await prisma.serviceBooking.update({
      where: { id: existing.id },
      data: { status, partnerName: req.body?.partnerName || existing.partnerName },
      include: { resident: { include: { flat: true } } },
    });
    res.json({ booking: serialize(row, { includeOtp: req.user.role === "resident" }) });
  } catch (e) {
    console.error("[home-services] patch failed:", e.message);
    res.status(503).json({ message: "Could not update this booking." });
  }
});

homeServicesRouter.post("/home-service-bookings/:id/rate", authRequired, roleRequired("resident"), async (req, res) => {
  const rating = Number(req.body?.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ message: "Rating must be a whole number from 1 to 5." });
  }
  const existing = await prisma.serviceBooking.findFirst({
    where: { id: req.params.id, residentId: req.user.id },
  });
  if (!existing) return res.status(404).json({ message: "Booking not found" });
  if (existing.status !== "completed") return res.status(409).json({ message: "Rate the visit after the work is completed." });
  if (existing.rating) return res.status(409).json({ message: "This visit is already rated." });
  const note = String(req.body?.note || "").trim().slice(0, 300);
  const row = await prisma.serviceBooking.update({
    where: { id: existing.id },
    data: { rating, ratingNote: note || null },
    include: { resident: { include: { flat: true } } },
  });
  if (existing.providerId) {
    const prev = await prisma.serviceProvider.findUnique({ where: { id: existing.providerId } });
    if (prev) {
      const count = (prev.ratingCount || 0) + 1;
      const avg = ((prev.ratingAvg || 0) * (prev.ratingCount || 0) + rating) / count;
      await prisma.serviceProvider.update({
        where: { id: prev.id },
        data: { ratingCount: count, ratingAvg: Math.round(avg * 10) / 10 },
      });
    }
  }
  res.json({ booking: serialize(row, { includeOtp: true }) });
});
