import { Router } from "express";
import { prisma } from "../prisma.js";
import { authRequired, roleRequired } from "../auth.js";
import { sendPush } from "../push.js";

// SOS "neighbour mesh": a resident's panic button alerts guards, admins and
// opted-in responders (e.g. doctors flagged in the society). Responders can
// acknowledge; one-tap ambulance uses the emergency helplines catalog.
export const sosRouter = Router();

const sid = (req) => req.user.societyId || "__none__";

const TYPE_LABEL = { medical: "Medical", security: "Security", fire: "Fire", other: "Emergency" };

async function alertWithResponses(id) {
  return prisma.sosAlert.findUnique({ where: { id }, include: { responses: { orderBy: { createdAt: "asc" } } } });
}

// Raise an alert. Notifies guards + admins + opted-in responders in the society.
sosRouter.post("/sos", authRequired, async (req, res) => {
  const { type, note, lat, lng } = req.body || {};
  const societyId = sid(req);
  const me = await prisma.user.findUnique({ where: { id: req.user.id }, include: { flat: true } });
  const alert = await prisma.sosAlert.create({
    data: {
      societyId,
      raisedById: req.user.id,
      raiserName: me?.name || null,
      raiserFlatNo: me?.flat?.flatNo || null,
      type: ["medical", "security", "fire", "other"].includes(type) ? type : "medical",
      note: note ? String(note).trim() : null,
      lat: lat != null ? Number(lat) : null,
      lng: lng != null ? Number(lng) : null,
    },
  });
  // Target audience: guards + admins always; responders always; for a SECURITY
  // alert, notify every active resident too (safety in numbers).
  try {
    const audience = await prisma.user.findMany({
      where: {
        societyId,
        active: true,
        notifyEnabled: true,
        expoPushToken: { not: null },
        id: { not: req.user.id },
        OR: [
          { role: { in: ["guard", "admin"] } },
          { isResponder: true },
          ...(alert.type === "security" ? [{ role: "resident" }] : []),
        ],
      },
      select: { expoPushToken: true },
    });
    const title = `🚨 ${TYPE_LABEL[alert.type]} SOS`;
    const body = `${alert.raiserName || "A resident"}${alert.raiserFlatNo ? ` (${alert.raiserFlatNo})` : ""} needs help${alert.note ? `: ${alert.note}` : ""}`;
    for (const u of audience) sendPush(u.expoPushToken, title, body, { type: "sos", alertId: alert.id });
  } catch (e) {
    console.error("[sos] notify failed:", e.message);
  }
  res.status(201).json({ alert: await alertWithResponses(alert.id) });
});

// Active alerts for the society (everyone can see them).
sosRouter.get("/sos/active", authRequired, async (req, res) => {
  const alerts = await prisma.sosAlert.findMany({
    where: { societyId: sid(req), status: "active" },
    include: { responses: { orderBy: { createdAt: "asc" } } },
    orderBy: { createdAt: "desc" },
  });
  res.json({ alerts });
});

sosRouter.get("/sos/:id", authRequired, async (req, res) => {
  const alert = await prisma.sosAlert.findFirst({ where: { id: req.params.id, societyId: sid(req) }, include: { responses: { orderBy: { createdAt: "asc" } } } });
  if (!alert) return res.status(404).json({ message: "Alert not found" });
  res.json({ alert });
});

// A responder acknowledges ("I'm coming"). Notifies the person who raised it.
sosRouter.post("/sos/:id/respond", authRequired, async (req, res) => {
  const alert = await prisma.sosAlert.findFirst({ where: { id: req.params.id, societyId: sid(req) } });
  if (!alert) return res.status(404).json({ message: "Alert not found" });
  if (alert.status !== "active") return res.status(400).json({ message: "This alert is already closed" });
  const me = await prisma.user.findUnique({ where: { id: req.user.id }, select: { name: true, responderSkill: true } });
  const existing = await prisma.sosResponse.findFirst({ where: { alertId: alert.id, responderId: req.user.id } });
  if (!existing) {
    await prisma.sosResponse.create({
      data: { alertId: alert.id, responderId: req.user.id, responderName: me?.name || null, skill: me?.responderSkill || null, message: req.body?.message ? String(req.body.message).trim() : null },
    });
    try {
      const raiser = await prisma.user.findUnique({ where: { id: alert.raisedById }, select: { expoPushToken: true, notifyEnabled: true } });
      if (raiser?.expoPushToken && raiser.notifyEnabled) {
        sendPush(raiser.expoPushToken, "Help is coming", `${me?.name || "A neighbour"} is responding to your SOS`, { type: "sos_response", alertId: alert.id });
      }
    } catch {}
  }
  res.json({ alert: await alertWithResponses(alert.id) });
});

// Raiser or an admin resolves/cancels the alert.
sosRouter.post("/sos/:id/resolve", authRequired, async (req, res) => {
  const alert = await prisma.sosAlert.findFirst({ where: { id: req.params.id, societyId: sid(req) } });
  if (!alert) return res.status(404).json({ message: "Alert not found" });
  if (req.user.role !== "admin" && alert.raisedById !== req.user.id) {
    return res.status(403).json({ message: "Only the person who raised it (or an admin) can close it" });
  }
  const status = req.body?.cancel ? "cancelled" : "resolved";
  const updated = await prisma.sosAlert.update({ where: { id: alert.id }, data: { status, resolvedById: req.user.id, resolvedAt: new Date() } });
  res.json({ alert: { ...updated, responses: [] } });
});

// Emergency numbers (ambulance etc.) from the helplines catalog — one-tap dial.
sosRouter.get("/sos/config/helpline", authRequired, async (req, res) => {
  const numbers = await prisma.serviceContact.findMany({
    where: { category: "emergency", status: "published", OR: [{ scope: "platform" }, { societyId: sid(req) }] },
    orderBy: [{ featured: "desc" }, { createdAt: "asc" }],
    take: 20,
    select: { name: true, phone: true, subtype: true },
  });
  res.json({ numbers });
});

// Opt in/out as an emergency responder (+ skill / location sharing).
sosRouter.post("/sos/responder", authRequired, async (req, res) => {
  const { isResponder, responderSkill, shareLocation } = req.body || {};
  const updated = await prisma.user.update({
    where: { id: req.user.id },
    data: {
      isResponder: Boolean(isResponder),
      responderSkill: responderSkill ? String(responderSkill) : null,
      ...(shareLocation != null ? { shareLocation: Boolean(shareLocation) } : {}),
    },
    select: { isResponder: true, responderSkill: true, shareLocation: true },
  });
  res.json(updated);
});

sosRouter.get("/sos/config/me", authRequired, async (req, res) => {
  const u = await prisma.user.findUnique({ where: { id: req.user.id }, select: { isResponder: true, responderSkill: true, shareLocation: true } });
  res.json(u || { isResponder: false, responderSkill: null, shareLocation: false });
});
