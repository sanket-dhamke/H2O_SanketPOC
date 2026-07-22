import { Router } from "express";
import { randomUUID } from "crypto";
import { prisma } from "../prisma.js";
import { authRequired, roleRequired } from "../auth.js";
import { serializeVisitor } from "../serializers.js";
import { sendPush } from "../push.js";
import { uploadVisitorPhoto, placeholderPhoto } from "../storage.js";

export const visitorsRouter = Router();

// Guard logs a visitor at the gate for a flat -> all residents get a push.
visitorsRouter.post("/visitors", authRequired, roleRequired("guard", "admin"), async (req, res) => {
  const { name, phone, purpose, vehicleNo, flatNo, flatId, photoBase64 } = req.body || {};
  if (!name || (!flatNo && !flatId)) {
    return res.status(400).json({ message: "name and flat are required" });
  }

  const societyId = req.user.societyId || "__none__";
  const flat = flatId
    ? await prisma.flat.findFirst({ where: { id: flatId, societyId } })
    : await prisma.flat.findFirst({ where: { flatNo, societyId } });
  if (!flat) {
    return res.status(404).json({ message: `Flat not found: ${flatNo || flatId}` });
  }

  const residents = await prisma.user.findMany({
    where: { flatId: flat.id, role: "resident", active: true },
  });
  if (residents.length === 0) {
    return res.status(404).json({ message: `No resident found for flat ${flat.flatNo}` });
  }

  const visitorId = randomUUID();
  const photoUrl =
    (await uploadVisitorPhoto(photoBase64, visitorId)) || placeholderPhoto(visitorId);

  const visitor = await prisma.visitor.create({
    data: {
      id: visitorId,
      flatId: flat.id,
      name,
      phone: phone || "",
      vehicleNo: vehicleNo || null,
      purpose: purpose || "Visitor",
      photoUrl,
      guardId: req.user.id,
      status: "pending",
    },
    include: { flat: true },
  });

  // Notify every resident of the flat that has a registered device.
  await Promise.all(
    residents
      .filter((r) => r.expoPushToken)
      .map((r) =>
        sendPush(
          r.expoPushToken,
          "Visitor at the gate",
          `${name} (${visitor.purpose}) is waiting. Tap to approve, reject or leave at gate.`,
          { type: "visitor", visitorId: visitor.id }
        )
      )
  );

  res.status(201).json({ visitor: serializeVisitor(visitor) });
});

// Resident sees their flat's visitors; guard/admin see the full gate log.
visitorsRouter.get("/visitors", authRequired, async (req, res) => {
  const where = {};
  if (req.user.role === "resident") {
    const u = await prisma.user.findUnique({ where: { id: req.user.id }, select: { flatId: true } });
    where.flatId = u?.flatId || "__none__";
  } else {
    // guard/admin see the whole gate log for their society.
    where.flat = { societyId: req.user.societyId || "__none__" };
  }
  const visitors = await prisma.visitor.findMany({
    where,
    include: { flat: true },
    orderBy: { createdAt: "desc" },
  });
  res.json({ visitors: visitors.map(serializeVisitor) });
});

// Resident decides: approved | rejected | leave_at_gate -> guard gets a push.
visitorsRouter.post("/visitors/:id/decision", authRequired, async (req, res) => {
  const { status } = req.body || {};
  const allowed = ["approved", "rejected", "leave_at_gate"];
  if (!allowed.includes(status)) {
    return res.status(400).json({ message: `status must be one of ${allowed.join(", ")}` });
  }
  const visitor = await prisma.visitor.findUnique({ where: { id: req.params.id } });
  if (!visitor) return res.status(404).json({ message: "Visitor not found" });

  if (req.user.role === "resident") {
    const u = await prisma.user.findUnique({ where: { id: req.user.id }, select: { flatId: true } });
    if (visitor.flatId !== u?.flatId) {
      return res.status(403).json({ message: "Not your visitor" });
    }
  }

  const updated = await prisma.visitor.update({
    where: { id: visitor.id },
    data: { status, decidedAt: new Date(), decidedBy: req.user.id },
    include: { flat: true },
  });

  const guard = updated.guardId
    ? await prisma.user.findUnique({ where: { id: updated.guardId } })
    : null;
  const label = {
    approved: "APPROVED - let them in",
    rejected: "REJECTED - do not allow",
    leave_at_gate: "LEAVE AT GATE",
  }[status];
  if (guard?.expoPushToken) {
    await sendPush(
      guard.expoPushToken,
      `Flat ${updated.flat?.flatNo}: ${label}`,
      `${updated.name} was ${status.replace(/_/g, " ")} by the resident.`,
      { type: "decision", visitorId: updated.id }
    );
  }
  res.json({ visitor: serializeVisitor(updated) });
});
