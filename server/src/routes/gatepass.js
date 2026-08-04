import { Router } from "express";
import { prisma } from "../prisma.js";
import { authRequired, roleRequired } from "../auth.js";
import { sendPush } from "../push.js";

// MyGate-style pre-approval: a resident creates a gate pass for an expected
// guest / delivery / cab with a short code and a validity window. The guard
// admits them by entering the code within the window, without disturbing the
// resident. Admitting also drops an (approved) entry into the visitor gate log.
export const gatePassRouter = Router();

const sid = (req) => req.user.societyId || "__none__";
const PASS_TYPES = ["guest", "delivery", "cab", "service", "other"];

function serializeGatePass(p) {
  return {
    id: p.id,
    guestName: p.guestName,
    guestPhone: p.guestPhone || null,
    vehicleNo: p.vehicleNo || null,
    type: p.type,
    purpose: p.purpose || null,
    code: p.code,
    validFrom: p.validFrom,
    validUntil: p.validUntil,
    status: p.status,
    usedAt: p.usedAt || null,
    flatId: p.flatId || null,
    flatNo: p.flat?.flatNo || null,
    createdById: p.createdById,
    createdByName: p.createdBy?.name || null,
    createdAt: p.createdAt,
  };
}

async function makeCode(societyId) {
  for (let i = 0; i < 8; i++) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const clash = await prisma.gatePass.findFirst({ where: { societyId, code, status: "active" } });
    if (!clash) return code;
  }
  return String(Date.now()).slice(-6);
}

// Lazily flip active passes whose window has ended to "expired".
async function expirePasses(societyId) {
  await prisma.gatePass.updateMany({
    where: { societyId, status: "active", validUntil: { lt: new Date() } },
    data: { status: "expired" },
  });
}

// Create a pass. Residents create for their own flat; admins may create too.
gatePassRouter.post("/gate-passes", authRequired, roleRequired("resident", "admin"), async (req, res) => {
  const { guestName, guestPhone, vehicleNo, type, purpose, validFrom, validUntil } = req.body || {};
  if (!guestName || !String(guestName).trim()) {
    return res.status(400).json({ message: "Guest name is required" });
  }
  const t = PASS_TYPES.includes(type) ? type : "guest";
  const from = validFrom ? new Date(validFrom) : new Date();
  // Default window: deliveries/cabs 2h, guests to end of the day.
  let until;
  if (validUntil) until = new Date(validUntil);
  else if (t === "delivery" || t === "cab") until = new Date(from.getTime() + 2 * 3600000);
  else {
    until = new Date(from);
    until.setHours(23, 59, 59, 0);
  }
  if (isNaN(from.getTime()) || isNaN(until.getTime()) || until <= from) {
    return res.status(400).json({ message: "Invalid validity window" });
  }
  const me = await prisma.user.findUnique({ where: { id: req.user.id }, select: { flatId: true } });
  const code = await makeCode(req.user.societyId);
  const pass = await prisma.gatePass.create({
    data: {
      societyId: req.user.societyId,
      flatId: me?.flatId || null,
      createdById: req.user.id,
      guestName: String(guestName).trim(),
      guestPhone: guestPhone ? String(guestPhone).trim() : null,
      vehicleNo: vehicleNo ? String(vehicleNo).trim() : null,
      type: t,
      purpose: purpose ? String(purpose).trim() : null,
      code,
      validFrom: from,
      validUntil: until,
      status: "active",
    },
    include: { flat: true, createdBy: true },
  });
  res.status(201).json({ pass: serializeGatePass(pass) });
});

// List passes. Residents: their own; guard: all currently-active society passes
// (to admit visitors); admin: all society passes.
gatePassRouter.get("/gate-passes", authRequired, async (req, res) => {
  await expirePasses(sid(req)).catch(() => {});
  const where = { societyId: sid(req) };
  if (req.user.role === "resident") where.createdById = req.user.id;
  if (req.user.role === "guard") where.status = "active";
  const passes = await prisma.gatePass.findMany({
    where,
    include: { flat: true, createdBy: true },
    orderBy: [{ createdAt: "desc" }],
    take: 200,
  });
  res.json({ passes: passes.map(serializeGatePass) });
});

// Cancel a pass (creator or admin).
gatePassRouter.post("/gate-passes/:id/cancel", authRequired, async (req, res) => {
  const pass = await prisma.gatePass.findFirst({ where: { id: req.params.id, societyId: sid(req) } });
  if (!pass) return res.status(404).json({ message: "Gate pass not found" });
  if (req.user.role !== "admin" && pass.createdById !== req.user.id) {
    return res.status(403).json({ message: "You can only cancel your own pass" });
  }
  const updated = await prisma.gatePass.update({
    where: { id: pass.id },
    data: { status: "cancelled" },
    include: { flat: true, createdBy: true },
  });
  res.json({ pass: serializeGatePass(updated) });
});

// Guard looks up a pass by code (does not consume it) to see who's expected.
gatePassRouter.get("/gate-passes/verify/:code", authRequired, roleRequired("guard", "admin"), async (req, res) => {
  await expirePasses(sid(req)).catch(() => {});
  const pass = await prisma.gatePass.findFirst({
    where: { societyId: sid(req), code: String(req.params.code).trim(), status: "active" },
    include: { flat: true, createdBy: true },
  });
  if (!pass) return res.status(404).json({ message: "No active pass for that code" });
  const now = new Date();
  if (now < pass.validFrom) return res.status(400).json({ message: "This pass isn't valid yet" });
  if (now > pass.validUntil) return res.status(400).json({ message: "This pass has expired" });
  res.json({ pass: serializeGatePass(pass) });
});

// Guard admits a pass: marks it used, logs an approved visitor entry, and lets
// the resident know their guest arrived.
gatePassRouter.post("/gate-passes/:id/admit", authRequired, roleRequired("guard", "admin"), async (req, res) => {
  const pass = await prisma.gatePass.findFirst({
    where: { id: req.params.id, societyId: sid(req) },
    include: { flat: true, createdBy: true },
  });
  if (!pass) return res.status(404).json({ message: "Gate pass not found" });
  if (pass.status !== "active") return res.status(400).json({ message: `Pass is ${pass.status}` });
  const now = new Date();
  if (now < pass.validFrom || now > pass.validUntil) {
    return res.status(400).json({ message: "Pass is outside its validity window" });
  }

  const updated = await prisma.gatePass.update({
    where: { id: pass.id },
    data: { status: "used", usedAt: now, usedByGuardId: req.user.id },
    include: { flat: true, createdBy: true },
  });

  // Add a gate-log entry (pre-approved => approved) so it shows in Visitors.
  if (pass.flatId) {
    await prisma.visitor.create({
      data: {
        flatId: pass.flatId,
        name: pass.guestName,
        phone: pass.guestPhone,
        vehicleNo: pass.vehicleNo,
        purpose: pass.purpose || (pass.type === "delivery" ? "Delivery" : "Guest"),
        guardId: req.user.id,
        status: "approved",
        decidedBy: "gate-pass",
        decidedAt: now,
      },
    });
  }

  // Notify the resident who created the pass.
  const creator = await prisma.user.findUnique({
    where: { id: pass.createdById },
    select: { expoPushToken: true, notifyEnabled: true },
  });
  if (creator?.expoPushToken && creator.notifyEnabled) {
    sendPush(creator.expoPushToken, "Your guest arrived", `${pass.guestName} was admitted at the gate.`, {
      type: "gate_pass",
      passId: pass.id,
    });
  }

  res.json({ pass: serializeGatePass(updated) });
});
