import { Router } from "express";
import { prisma } from "../prisma.js";
import { authRequired, roleRequired } from "../auth.js";
import { enqueuePush } from "../queue.js";
import { HOME_SERVICES, HOME_SERVICE_SLOTS, findHomeService, findPackage } from "../homeServicesCatalog.js";

export const homeServicesRouter = Router();

const sid = (req) => req.user.societyId || "__none__";
const OPEN = ["requested", "confirmed", "assigned"];

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
    status: row.status,
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
  res.json({ services: HOME_SERVICES, slots: HOME_SERVICE_SLOTS });
});

homeServicesRouter.get("/home-service-bookings", authRequired, async (req, res) => {
  const societyId = sid(req);
  const where =
    req.user.role === "admin"
      ? { societyId }
      : { societyId, residentId: req.user.id };
  try {
    const rows = await prisma.serviceBooking.findMany({
      where,
      include: { resident: { include: { flat: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    res.json({ bookings: rows.map((r) => serialize(r)) });
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

  const me = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: { flat: true },
  });
  const instant = (service.etaMinutes || 999) <= 15;
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
        partnerName: service.partnerName || null,
        status: instant ? "confirmed" : "requested",
      },
      include: { resident: { include: { flat: true } } },
    });
    const booking = serialize(row, { residentName: me?.name, flatNo: me?.flat?.flatNo });
    notifyAdmins(
      req.user.societyId,
      instant ? "Instant service booked" : "New home-service request",
      `${me?.name || "A resident"} · ${service.name} · ${pack.name}`,
      { type: "home_service", id: row.id }
    ).catch(() => {});
    res.status(201).json({ booking });
  } catch (e) {
    console.error("[home-services] create failed:", e.message);
    res.status(503).json({ message: "Could not save this booking. Try again." });
  }
});

homeServicesRouter.patch("/home-service-bookings/:id", authRequired, async (req, res) => {
  const status = String(req.body?.status || "").trim();
  const allowed = {
    resident: ["cancelled"],
    admin: ["confirmed", "assigned", "completed", "cancelled"],
  };
  const ok = (allowed[req.user.role] || []).includes(status);
  if (!ok) return res.status(400).json({ message: "Cannot set that status" });

  const where =
    req.user.role === "admin"
      ? { id: req.params.id, societyId: sid(req) }
      : { id: req.params.id, societyId: sid(req), residentId: req.user.id };

  try {
    const existing = await prisma.serviceBooking.findFirst({ where });
    if (!existing) return res.status(404).json({ message: "Booking not found" });
    if (req.user.role === "resident" && !OPEN.includes(existing.status)) {
      return res.status(409).json({ message: "This booking can no longer be cancelled" });
    }
    const row = await prisma.serviceBooking.update({
      where: { id: existing.id },
      data: { status, partnerName: req.body?.partnerName || existing.partnerName },
      include: { resident: { include: { flat: true } } },
    });
    res.json({ booking: serialize(row) });
  } catch (e) {
    console.error("[home-services] patch failed:", e.message);
    res.status(503).json({ message: "Could not update this booking." });
  }
});
