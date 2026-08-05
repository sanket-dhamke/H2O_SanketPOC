import { Router } from "express";
import crypto from "crypto";
import { prisma } from "../prisma.js";
import { authRequired, roleRequired } from "../auth.js";
import { sendPush } from "../push.js";

// Platinum vehicle-gate module. Residents/admins register vehicles (each gets a
// printable QR carrying an opaque, revocable `code`). A gate scanner at the
// entry lane calls /gate/verify (or syncs the whitelist via /gate/whitelist)
// using its device key, then fires its own relay to lift the boom barrier.
export const gateRouter = Router();

const VEHICLE_TYPES = ["car", "bike", "other"];

// ---- Anti-passback / anomaly thresholds (software-only, no hardware) ----
// A genuine double-read (barrier reclosed before the car drove through) within
// this window simply re-opens without re-notifying.
const REOPEN_GRACE_SEC = 30;
// The same code seen at a DIFFERENT lane sooner than this is physically
// impossible for one vehicle → treated as a cloned/copied QR and denied.
const IMPOSSIBLE_TRAVEL_SEC = 120;
// The same code used in the SAME direction again (no exit in between) within
// this window is treated as anti-passback (someone reusing a photo) and denied.
const SAME_DIR_WINDOW_SEC = 900;

const genCode = () => "gm_" + crypto.randomBytes(10).toString("hex");
const genDeviceKey = () => "gd_" + crypto.randomBytes(24).toString("hex");
// Normalise a plate for matching (uppercase, strip spaces/hyphens).
const normPlate = (p) => String(p || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

async function loadSociety(societyId) {
  if (!societyId) return null;
  return prisma.society.findUnique({ where: { id: societyId } });
}
const isPlatinum = (society) => (society?.tier || "platinum") === "platinum";

function serializeVehicle(v) {
  return {
    id: v.id,
    type: v.type,
    plate: v.plate,
    ownerName: v.ownerName || null,
    code: v.code,
    active: v.active,
    flatId: v.flatId || null,
    flatNo: v.flat?.flatNo || null,
    block: v.flat?.block || null,
    createdAt: v.createdAt,
  };
}

// ---------- Resident / admin: vehicle registry (Platinum only) ----------

gateRouter.get("/vehicles", authRequired, roleRequired("resident", "admin", "guard"), async (req, res) => {
  const society = await loadSociety(req.user.societyId);
  if (!isPlatinum(society)) return res.json({ vehicles: [], tier: society?.tier || null });

  let where = { societyId: req.user.societyId };
  if (req.user.role === "resident") {
    const me = await prisma.user.findUnique({ where: { id: req.user.id }, select: { flatId: true } });
    if (!me?.flatId) return res.json({ vehicles: [] });
    where.flatId = me.flatId;
  }
  const vehicles = await prisma.vehicle.findMany({
    where,
    include: { flat: true },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  res.json({ vehicles: vehicles.map(serializeVehicle) });
});

gateRouter.post("/vehicles", authRequired, roleRequired("resident", "admin"), async (req, res) => {
  const society = await loadSociety(req.user.societyId);
  if (!isPlatinum(society)) return res.status(403).json({ message: "Vehicle gate is a Platinum feature" });

  const { type, plate, ownerName } = req.body || {};
  let { flatId } = req.body || {};
  if (!plate || !normPlate(plate)) return res.status(400).json({ message: "Vehicle number is required" });

  // Residents can only register to their own flat.
  if (req.user.role === "resident") {
    const me = await prisma.user.findUnique({ where: { id: req.user.id }, select: { flatId: true } });
    if (!me?.flatId) return res.status(400).json({ message: "Your account isn't linked to a flat yet" });
    flatId = me.flatId;
  }
  if (flatId) {
    const flat = await prisma.flat.findFirst({ where: { id: flatId, societyId: req.user.societyId } });
    if (!flat) return res.status(400).json({ message: "Flat not found in your society" });
  }

  const vehicle = await prisma.vehicle.create({
    data: {
      societyId: req.user.societyId,
      flatId: flatId || null,
      type: VEHICLE_TYPES.includes(type) ? type : "car",
      plate: normPlate(plate),
      ownerName: ownerName ? String(ownerName).trim() : null,
      code: genCode(),
      active: true,
    },
    include: { flat: true },
  });
  res.status(201).json({ vehicle: serializeVehicle(vehicle) });
});

async function findOwnVehicle(req) {
  const vehicle = await prisma.vehicle.findUnique({ where: { id: req.params.id }, include: { flat: true } });
  if (!vehicle || vehicle.societyId !== req.user.societyId) return null;
  if (req.user.role === "resident") {
    const me = await prisma.user.findUnique({ where: { id: req.user.id }, select: { flatId: true } });
    if (vehicle.flatId !== me?.flatId) return null;
  }
  return vehicle;
}

gateRouter.patch("/vehicles/:id", authRequired, roleRequired("resident", "admin"), async (req, res) => {
  const vehicle = await findOwnVehicle(req);
  if (!vehicle) return res.status(404).json({ message: "Vehicle not found" });
  const { type, plate, ownerName, active } = req.body || {};
  const data = {};
  if (type && VEHICLE_TYPES.includes(type)) data.type = type;
  if (plate !== undefined) {
    if (!normPlate(plate)) return res.status(400).json({ message: "Vehicle number is required" });
    data.plate = normPlate(plate);
  }
  if (ownerName !== undefined) data.ownerName = ownerName ? String(ownerName).trim() : null;
  if (active !== undefined) data.active = Boolean(active);
  const updated = await prisma.vehicle.update({ where: { id: vehicle.id }, data, include: { flat: true } });
  res.json({ vehicle: serializeVehicle(updated) });
});

// Revoke the current QR and issue a fresh code (e.g. if a sticker was copied).
gateRouter.post("/vehicles/:id/rotate", authRequired, roleRequired("resident", "admin"), async (req, res) => {
  const vehicle = await findOwnVehicle(req);
  if (!vehicle) return res.status(404).json({ message: "Vehicle not found" });
  const updated = await prisma.vehicle.update({
    where: { id: vehicle.id },
    data: { code: genCode() },
    include: { flat: true },
  });
  res.json({ vehicle: serializeVehicle(updated) });
});

gateRouter.delete("/vehicles/:id", authRequired, roleRequired("resident", "admin"), async (req, res) => {
  const vehicle = await findOwnVehicle(req);
  if (!vehicle) return res.status(404).json({ message: "Vehicle not found" });
  await prisma.vehicle.delete({ where: { id: vehicle.id } });
  res.json({ ok: true });
});

// ---------- Admin: gate devices (scanners) ----------

function serializeDevice(d, baseUrl) {
  return {
    id: d.id,
    name: d.name,
    location: d.location || null,
    active: d.active,
    deviceKey: d.deviceKey,
    lastSeenAt: d.lastSeenAt || null,
    createdAt: d.createdAt,
    verifyUrl: `${baseUrl}/api/gate/verify`,
    whitelistUrl: `${baseUrl}/api/gate/whitelist`,
  };
}
function baseUrlOf(req) {
  const envUrl = process.env.PUBLIC_API_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");
  return `${req.protocol}://${req.get("host")}`;
}

gateRouter.get("/gate/devices", authRequired, roleRequired("admin"), async (req, res) => {
  const society = await loadSociety(req.user.societyId);
  if (!isPlatinum(society)) return res.status(403).json({ message: "Vehicle gate is a Platinum feature" });
  const devices = await prisma.gateDevice.findMany({
    where: { societyId: req.user.societyId },
    orderBy: { createdAt: "desc" },
  });
  res.json({ devices: devices.map((d) => serializeDevice(d, baseUrlOf(req))) });
});

gateRouter.post("/gate/devices", authRequired, roleRequired("admin"), async (req, res) => {
  const society = await loadSociety(req.user.societyId);
  if (!isPlatinum(society)) return res.status(403).json({ message: "Vehicle gate is a Platinum feature" });
  const { name, location } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ message: "Device name is required" });
  const device = await prisma.gateDevice.create({
    data: {
      societyId: req.user.societyId,
      name: String(name).trim(),
      location: location ? String(location).trim() : null,
      deviceKey: genDeviceKey(),
      active: true,
    },
  });
  res.status(201).json({ device: serializeDevice(device, baseUrlOf(req)) });
});

gateRouter.patch("/gate/devices/:id", authRequired, roleRequired("admin"), async (req, res) => {
  const device = await prisma.gateDevice.findUnique({ where: { id: req.params.id } });
  if (!device || device.societyId !== req.user.societyId) return res.status(404).json({ message: "Device not found" });
  const { name, location, active } = req.body || {};
  const data = {};
  if (name !== undefined) data.name = String(name).trim();
  if (location !== undefined) data.location = location ? String(location).trim() : null;
  if (active !== undefined) data.active = Boolean(active);
  const updated = await prisma.gateDevice.update({ where: { id: device.id }, data });
  res.json({ device: serializeDevice(updated, baseUrlOf(req)) });
});

gateRouter.delete("/gate/devices/:id", authRequired, roleRequired("admin"), async (req, res) => {
  const device = await prisma.gateDevice.findUnique({ where: { id: req.params.id } });
  if (!device || device.societyId !== req.user.societyId) return res.status(404).json({ message: "Device not found" });
  await prisma.gateDevice.delete({ where: { id: device.id } });
  res.json({ ok: true });
});

// Recent gate reads for the admin log view.
gateRouter.get("/gate/entries", authRequired, roleRequired("admin"), async (req, res) => {
  const entries = await prisma.vehicleEntry.findMany({
    where: { societyId: req.user.societyId },
    include: { vehicle: { include: { flat: true } }, device: true },
    orderBy: { at: "desc" },
    take: 100,
  });
  res.json({
    entries: entries.map((e) => ({
      id: e.id,
      plate: e.plate || e.vehicle?.plate || null,
      flatNo: e.vehicle?.flat?.flatNo || null,
      device: e.device?.name || null,
      direction: e.direction || null,
      decision: e.decision,
      reason: e.reason || null,
      at: e.at,
    })),
  });
});

// ---------- Device-facing (authenticated by deviceKey, NOT a JWT) ----------

async function authDevice(req) {
  const deviceKey = req.body?.deviceKey || req.query?.deviceKey || req.headers["x-device-key"];
  if (!deviceKey) return null;
  const device = await prisma.gateDevice.findUnique({ where: { deviceKey: String(deviceKey) }, include: { society: true } });
  if (!device || !device.active) return null;
  return device;
}

// The scanner posts a scanned QR `code` (and/or read `plate`); we decide open/deny,
// log it, notify the resident, and return the decision. The device then fires its
// relay to lift the barrier when `open` is true.
gateRouter.post("/gate/verify", async (req, res) => {
  const device = await authDevice(req);
  if (!device) return res.status(401).json({ open: false, reason: "invalid_device" });
  await prisma.gateDevice.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } }).catch(() => {});

  const { code, plate, direction } = req.body || {};
  const dir = direction === "out" ? "out" : direction === "in" ? "in" : null;

  let vehicle = null;
  if (code) {
    vehicle = await prisma.vehicle.findUnique({ where: { code: String(code) }, include: { flat: true } });
  }
  if (!vehicle && plate) {
    const np = normPlate(plate);
    const candidates = await prisma.vehicle.findMany({ where: { societyId: device.societyId }, include: { flat: true } });
    vehicle = candidates.find((v) => normPlate(v.plate) === np) || null;
  }

  let open = false;
  let reason = "not_found";
  let notify = false; // send the normal "vehicle at gate" push
  let anomaly = null; // set when we deny for anti-passback/clone

  if (vehicle && vehicle.societyId !== device.societyId) {
    reason = "wrong_society";
  } else if (vehicle && !vehicle.active) {
    reason = "revoked";
  } else if (vehicle && !isPlatinum(device.society)) {
    reason = "plan_inactive";
  } else if (vehicle) {
    open = true;
    reason = "ok";
    notify = true;

    // ---- Anti-passback / anomaly detection (free, software-only) ----
    // Compare against this vehicle's most recent successful read.
    const last = await prisma.vehicleEntry.findFirst({
      where: { vehicleId: vehicle.id, decision: "open" },
      orderBy: { at: "desc" },
    });
    if (last) {
      const dtSec = (Date.now() - new Date(last.at).getTime()) / 1000;
      if (last.deviceId && last.deviceId !== device.id && dtSec < IMPOSSIBLE_TRAVEL_SEC) {
        // Same QR at two different lanes almost simultaneously → cloned sticker.
        open = false;
        reason = "anti_passback_location";
        anomaly = reason;
        notify = false;
      } else if (dtSec <= REOPEN_GRACE_SEC) {
        // Barrier reclosed before the car passed — just re-open, don't spam.
        reason = "ok_reopen";
        notify = false;
      } else if (dir && last.direction && dir === last.direction && dtSec < SAME_DIR_WINDOW_SEC) {
        // Re-entering (or re-exiting) without the opposite movement in between.
        open = false;
        reason = "anti_passback_direction";
        anomaly = reason;
        notify = false;
      }
    }
  }

  await prisma.vehicleEntry.create({
    data: {
      societyId: device.societyId,
      vehicleId: vehicle?.id || null,
      deviceId: device.id,
      plate: plate ? normPlate(plate) : vehicle?.plate || null,
      code: code ? String(code) : null,
      direction: dir,
      decision: open ? "open" : "deny",
      reason,
    },
  });

  // Normal admit notification to the flat's residents.
  if (open && notify && vehicle?.flatId) {
    const residents = await prisma.user.findMany({
      where: { flatId: vehicle.flatId, role: "resident", notifyEnabled: true },
      select: { expoPushToken: true },
    });
    const title = "Vehicle at the gate";
    const body = `${vehicle.plate} ${dir === "out" ? "exited" : "entered"}${device.name ? ` · ${device.name}` : ""}`;
    for (const r of residents) {
      if (r.expoPushToken) sendPush(r.expoPushToken, title, body, { type: "gate", vehicleId: vehicle.id });
    }
  }

  // Security alert: a possible cloned/copied QR was blocked. Warn the resident
  // (so they can regenerate the QR) and the society admins.
  if (anomaly && vehicle) {
    const recipients = await prisma.user.findMany({
      where: {
        societyId: device.societyId,
        notifyEnabled: true,
        OR: [{ flatId: vehicle.flatId || "__none__", role: "resident" }, { role: "admin" }],
      },
      select: { expoPushToken: true },
    });
    const title = "⚠️ Vehicle QR blocked";
    const body =
      `${vehicle.plate}'s gate QR was blocked at ${device.name || "the gate"} — it looks like it was reused/copied. ` +
      `If this wasn't you, open GateMate and regenerate the QR.`;
    for (const r of recipients) {
      if (r.expoPushToken) sendPush(r.expoPushToken, title, body, { type: "gate_alert", vehicleId: vehicle.id });
    }
  }

  res.json({
    open,
    reason,
    name: vehicle?.ownerName || null,
    flatNo: vehicle?.flat?.flatNo || null,
    type: vehicle?.type || null,
  });
});

// The device pulls the society's active whitelist to match locally (works even
// if the internet drops at the moment of entry).
gateRouter.get("/gate/whitelist", async (req, res) => {
  const device = await authDevice(req);
  if (!device) return res.status(401).json({ message: "invalid_device" });
  await prisma.gateDevice.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } }).catch(() => {});

  if (!isPlatinum(device.society)) return res.json({ vehicles: [], codes: [], plates: [] });
  const vehicles = await prisma.vehicle.findMany({
    where: { societyId: device.societyId, active: true },
    include: { flat: true },
  });
  res.json({
    updatedAt: new Date().toISOString(),
    vehicles: vehicles.map((v) => ({ code: v.code, plate: v.plate, flatNo: v.flat?.flatNo || null })),
    codes: vehicles.map((v) => v.code),
    plates: vehicles.map((v) => normPlate(v.plate)),
  });
});
