import { Router } from "express";
import { randomBytes } from "crypto";
import { prisma } from "../prisma.js";
import { authRequired, roleRequired } from "../auth.js";
import { sendPush } from "../push.js";

// Preschool pickup-safety (authorized pickup + QR gate log) and live child
// updates. All scoped to the caller's society. A parent (resident) manages only
// their own child; admins manage any student; guards scan & log at the gate.
export const preschoolRouter = Router();

const sid = (req) => req.user.societyId || "__none__";

async function myFlatId(userId) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { flatId: true } });
  return u?.flatId || null;
}

async function uniquePickupCode() {
  for (let i = 0; i < 6; i++) {
    const code = "PU" + randomBytes(4).toString("hex").toUpperCase();
    const clash = await prisma.pickupAuthorization.findUnique({ where: { code } });
    if (!clash) return code;
  }
  return "PU" + Date.now().toString(36).toUpperCase();
}

// Resolves which flat (student) the caller may act on, enforcing resident scope.
async function resolveFlat(req, requestedFlatId) {
  if (req.user.role === "resident") {
    const mine = await myFlatId(req.user.id);
    return mine;
  }
  return requestedFlatId || null;
}

/* ----------------------------- Pickup authorizations --------------------- */
preschoolRouter.get("/pickup/authorizations", authRequired, async (req, res) => {
  const where = { societyId: sid(req), active: true };
  if (req.user.role === "resident") where.flatId = await myFlatId(req.user.id);
  else if (req.query.flatId) where.flatId = String(req.query.flatId);
  const items = await prisma.pickupAuthorization.findMany({ where, orderBy: { createdAt: "desc" }, take: 200 });
  res.json({ authorizations: items });
});

preschoolRouter.post("/pickup/authorizations", authRequired, roleRequired("resident", "admin"), async (req, res) => {
  const { name, phone, relation, photoUrl, flatId, validUntil } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ message: "Name is required" });
  const targetFlat = await resolveFlat(req, flatId);
  if (!targetFlat) return res.status(400).json({ message: "No student is linked to your account. Ask the school office." });
  const item = await prisma.pickupAuthorization.create({
    data: {
      societyId: sid(req),
      flatId: targetFlat,
      name: String(name).trim(),
      phone: phone ? String(phone).trim() : null,
      relation: relation ? String(relation).trim() : null,
      photoUrl: photoUrl || null,
      validUntil: validUntil ? new Date(validUntil) : null,
      code: await uniquePickupCode(),
      createdById: req.user.id,
    },
  });
  res.status(201).json({ authorization: item });
});

preschoolRouter.delete("/pickup/authorizations/:id", authRequired, roleRequired("resident", "admin"), async (req, res) => {
  const item = await prisma.pickupAuthorization.findFirst({ where: { id: req.params.id, societyId: sid(req) } });
  if (!item) return res.status(404).json({ message: "Not found" });
  if (req.user.role === "resident" && item.flatId !== (await myFlatId(req.user.id))) {
    return res.status(403).json({ message: "You can only remove your own child's pickup persons" });
  }
  await prisma.pickupAuthorization.update({ where: { id: item.id }, data: { active: false } });
  res.json({ ok: true });
});

// Guard/admin scans a pickup QR → resolves the student + authorized person, and
// whether the pass is currently valid.
preschoolRouter.get("/pickup/verify/:code", authRequired, roleRequired("guard", "admin"), async (req, res) => {
  const auth = await prisma.pickupAuthorization.findUnique({ where: { code: String(req.params.code) } });
  if (!auth || auth.societyId !== sid(req)) return res.status(404).json({ message: "No pickup pass matches this code in your school" });
  const now = new Date();
  const valid = auth.active && (!auth.validFrom || now >= auth.validFrom) && (!auth.validUntil || now <= auth.validUntil);
  const flat = await prisma.flat.findUnique({ where: { id: auth.flatId }, select: { flatNo: true, block: true, guardianName: true } });
  res.json({ authorization: auth, valid, student: flat });
});

// Guard/admin logs an actual pickup/drop. Notifies the child's parent(s).
preschoolRouter.post("/pickup/events", authRequired, roleRequired("guard", "admin"), async (req, res) => {
  const { flatId, authorizationId, personName, personPhone, relation, kind, photoUrl } = req.body || {};
  if (!flatId) return res.status(400).json({ message: "flatId is required" });
  if (!personName || !String(personName).trim()) return res.status(400).json({ message: "personName is required" });
  const flat = await prisma.flat.findFirst({ where: { id: flatId, societyId: sid(req) }, select: { id: true, flatNo: true } });
  if (!flat) return res.status(404).json({ message: "Student not found in your school" });
  const event = await prisma.pickupEvent.create({
    data: {
      societyId: sid(req),
      flatId: flat.id,
      authorizationId: authorizationId || null,
      personName: String(personName).trim(),
      personPhone: personPhone ? String(personPhone).trim() : null,
      relation: relation ? String(relation).trim() : null,
      kind: kind === "drop" ? "drop" : "pickup",
      photoUrl: photoUrl || null,
      byGuardId: req.user.id,
      byGuardName: req.user.name || null,
    },
  });
  // Notify the parent(s) of this student.
  try {
    const parents = await prisma.user.findMany({ where: { flatId: flat.id, role: "resident", active: true, notifyEnabled: true, expoPushToken: { not: null } }, select: { expoPushToken: true } });
    const verb = event.kind === "drop" ? "dropped off" : "picked up";
    for (const p of parents) {
      sendPush(p.expoPushToken, `Your child was ${verb}`, `${event.personName}${event.relation ? ` (${event.relation})` : ""} at ${new Date(event.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`, { type: "pickup" });
    }
  } catch (e) {
    console.error("pickup notify failed:", e.message);
  }
  res.status(201).json({ event });
});

preschoolRouter.get("/pickup/events", authRequired, async (req, res) => {
  const where = { societyId: sid(req) };
  if (req.user.role === "resident") where.flatId = await myFlatId(req.user.id);
  else if (req.query.flatId) where.flatId = String(req.query.flatId);
  const events = await prisma.pickupEvent.findMany({ where, orderBy: { at: "desc" }, take: 50 });
  res.json({ events });
});

/* ------------------------------- Child updates --------------------------- */
preschoolRouter.get("/child-updates", authRequired, async (req, res) => {
  const where = { societyId: sid(req) };
  if (req.user.role === "resident") where.flatId = await myFlatId(req.user.id);
  else if (req.query.flatId) where.flatId = String(req.query.flatId);
  const updates = await prisma.childUpdate.findMany({ where, orderBy: { at: "desc" }, take: 60 });
  res.json({ updates });
});

preschoolRouter.post("/child-updates", authRequired, roleRequired("admin"), async (req, res) => {
  const { flatId, type, mood, text } = req.body || {};
  if (!flatId) return res.status(400).json({ message: "flatId is required" });
  if (!text || !String(text).trim()) return res.status(400).json({ message: "Update text is required" });
  const flat = await prisma.flat.findFirst({ where: { id: flatId, societyId: sid(req) }, select: { id: true } });
  if (!flat) return res.status(404).json({ message: "Student not found in your school" });
  const update = await prisma.childUpdate.create({
    data: {
      societyId: sid(req),
      flatId: flat.id,
      type: ["meal", "nap", "mood", "activity", "note", "health"].includes(type) ? type : "note",
      mood: mood || null,
      text: String(text).trim(),
      byId: req.user.id,
      byName: req.user.name || null,
    },
  });
  try {
    const parents = await prisma.user.findMany({ where: { flatId: flat.id, role: "resident", active: true, notifyEnabled: true, expoPushToken: { not: null } }, select: { expoPushToken: true } });
    for (const p of parents) sendPush(p.expoPushToken, "New update from school", String(text).trim().slice(0, 120), { type: "child_update" });
  } catch (e) {
    console.error("child update notify failed:", e.message);
  }
  res.status(201).json({ update });
});

preschoolRouter.delete("/child-updates/:id", authRequired, roleRequired("admin"), async (req, res) => {
  const item = await prisma.childUpdate.findFirst({ where: { id: req.params.id, societyId: sid(req) } });
  if (!item) return res.status(404).json({ message: "Not found" });
  await prisma.childUpdate.delete({ where: { id: item.id } });
  res.json({ ok: true });
});
