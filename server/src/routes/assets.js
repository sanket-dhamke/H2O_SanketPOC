import { Router } from "express";
import { prisma } from "../prisma.js";
import { authRequired, roleRequired } from "../auth.js";

// Asset & AMC tracker: lifts, pumps, DG sets, fire gear, etc. Admins register
// each asset with warranty/AMC expiry and a predictive service cadence; the app
// surfaces what's due or expiring. Residents can view (read-only) for trust.
export const assetsRouter = Router();

const CATEGORIES = ["lift", "pump", "dg", "fire", "water", "electrical", "other"];

function nextService(lastServicedAt, serviceEveryDays) {
  if (!lastServicedAt || !serviceEveryDays) return null;
  const d = new Date(lastServicedAt);
  d.setDate(d.getDate() + Number(serviceEveryDays));
  return d;
}

function serialize(a) {
  const now = Date.now();
  const days = (d) => (d ? Math.ceil((new Date(d).getTime() - now) / 86400000) : null);
  return {
    id: a.id,
    name: a.name,
    category: a.category,
    location: a.location || null,
    vendorName: a.vendorName || null,
    vendorPhone: a.vendorPhone || null,
    workerId: a.workerId || null,
    purchaseDate: a.purchaseDate || null,
    warrantyUntil: a.warrantyUntil || null,
    warrantyDays: days(a.warrantyUntil),
    amcVendor: a.amcVendor || null,
    amcUntil: a.amcUntil || null,
    amcDays: days(a.amcUntil),
    serviceEveryDays: a.serviceEveryDays || null,
    lastServicedAt: a.lastServicedAt || null,
    nextServiceAt: a.nextServiceAt || null,
    serviceDueDays: days(a.nextServiceAt),
    notes: a.notes || null,
    active: a.active,
    logs: (a.logs || []).map((l) => ({ id: l.id, kind: l.kind, cost: l.cost ?? null, note: l.note || null, byName: l.byName || null, at: l.at })),
  };
}

assetsRouter.get("/assets", authRequired, async (req, res) => {
  const assets = await prisma.asset.findMany({
    where: { societyId: req.user.societyId || "__none__", active: true },
    include: { logs: { orderBy: { at: "desc" }, take: 5 } },
    orderBy: { createdAt: "desc" },
  });
  res.json({ assets: assets.map(serialize) });
});

// A compact "attention" list for the admin manager: warranty/AMC expiring soon
// or a service overdue/due within 14 days.
assetsRouter.get("/assets/alerts", authRequired, roleRequired("admin"), async (req, res) => {
  const assets = await prisma.asset.findMany({ where: { societyId: req.user.societyId || "__none__", active: true } });
  const now = Date.now();
  const soon = (d, within = 30) => d && (new Date(d).getTime() - now) / 86400000 <= within;
  const alerts = [];
  for (const a of assets) {
    if (soon(a.warrantyUntil)) alerts.push({ id: a.id, name: a.name, kind: "warranty", at: a.warrantyUntil });
    if (soon(a.amcUntil)) alerts.push({ id: a.id, name: a.name, kind: "amc", at: a.amcUntil });
    if (soon(a.nextServiceAt, 14)) alerts.push({ id: a.id, name: a.name, kind: "service", at: a.nextServiceAt });
  }
  res.json({ alerts });
});

assetsRouter.post("/assets", authRequired, roleRequired("admin"), async (req, res) => {
  const b = req.body || {};
  if (!b.name || !String(b.name).trim()) return res.status(400).json({ message: "Name is required" });
  const category = CATEGORIES.includes(b.category) ? b.category : "other";
  const lastServicedAt = b.lastServicedAt ? new Date(b.lastServicedAt) : null;
  const asset = await prisma.asset.create({
    data: {
      societyId: req.user.societyId,
      name: String(b.name).trim(),
      category,
      location: b.location || null,
      vendorName: b.vendorName || null,
      vendorPhone: b.vendorPhone || null,
      workerId: b.workerId || null,
      purchaseDate: b.purchaseDate ? new Date(b.purchaseDate) : null,
      warrantyUntil: b.warrantyUntil ? new Date(b.warrantyUntil) : null,
      amcVendor: b.amcVendor || null,
      amcUntil: b.amcUntil ? new Date(b.amcUntil) : null,
      serviceEveryDays: b.serviceEveryDays ? parseInt(b.serviceEveryDays, 10) : null,
      lastServicedAt,
      nextServiceAt: nextService(lastServicedAt, b.serviceEveryDays),
      notes: b.notes || null,
    },
    include: { logs: true },
  });
  res.status(201).json({ asset: serialize(asset) });
});

assetsRouter.patch("/assets/:id", authRequired, roleRequired("admin"), async (req, res) => {
  const asset = await prisma.asset.findFirst({ where: { id: req.params.id, societyId: req.user.societyId || "__none__" } });
  if (!asset) return res.status(404).json({ message: "Asset not found" });
  const b = req.body || {};
  const data = {};
  for (const f of ["name", "location", "vendorName", "vendorPhone", "amcVendor", "notes", "workerId"]) if (b[f] !== undefined) data[f] = b[f] || null;
  if (b.category && CATEGORIES.includes(b.category)) data.category = b.category;
  for (const f of ["purchaseDate", "warrantyUntil", "amcUntil", "lastServicedAt"]) if (b[f] !== undefined) data[f] = b[f] ? new Date(b[f]) : null;
  if (b.serviceEveryDays !== undefined) data.serviceEveryDays = b.serviceEveryDays ? parseInt(b.serviceEveryDays, 10) : null;
  if (b.active !== undefined) data.active = !!b.active;
  const eff = { ...asset, ...data };
  data.nextServiceAt = nextService(eff.lastServicedAt, eff.serviceEveryDays);
  const updated = await prisma.asset.update({ where: { id: asset.id }, data, include: { logs: { orderBy: { at: "desc" }, take: 5 } } });
  res.json({ asset: serialize(updated) });
});

assetsRouter.delete("/assets/:id", authRequired, roleRequired("admin"), async (req, res) => {
  const asset = await prisma.asset.findFirst({ where: { id: req.params.id, societyId: req.user.societyId || "__none__" } });
  if (!asset) return res.status(404).json({ message: "Asset not found" });
  await prisma.asset.delete({ where: { id: asset.id } });
  res.json({ ok: true });
});

// Log a service/repair; if it's a service, roll the "next service" forward.
assetsRouter.post("/assets/:id/logs", authRequired, roleRequired("admin"), async (req, res) => {
  const asset = await prisma.asset.findFirst({ where: { id: req.params.id, societyId: req.user.societyId || "__none__" } });
  if (!asset) return res.status(404).json({ message: "Asset not found" });
  const b = req.body || {};
  const kind = ["service", "repair", "inspection", "note"].includes(b.kind) ? b.kind : "service";
  const at = b.at ? new Date(b.at) : new Date();
  await prisma.assetLog.create({
    data: { assetId: asset.id, kind, cost: b.cost != null && b.cost !== "" ? Number(b.cost) : null, note: b.note || null, byId: req.user.id, byName: req.user.name || null, at },
  });
  if (kind === "service") {
    await prisma.asset.update({ where: { id: asset.id }, data: { lastServicedAt: at, nextServiceAt: nextService(at, asset.serviceEveryDays) } });
  }
  const updated = await prisma.asset.findUnique({ where: { id: asset.id }, include: { logs: { orderBy: { at: "desc" }, take: 5 } } });
  res.status(201).json({ asset: serialize(updated) });
});
