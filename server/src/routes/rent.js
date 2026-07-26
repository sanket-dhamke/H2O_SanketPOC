import { Router } from "express";
import { prisma } from "../prisma.js";
import { authRequired, roleRequired } from "../auth.js";
import { serializeRentAgreement } from "../serializers.js";
import { uploadDocument } from "../storage.js";
import { sendPush } from "../push.js";
import { sendEmail } from "../email.js";
import { runRentExpiryChecks } from "../rentReminders.js";

export const rentRouter = Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function residentFlatId(userId) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { flatId: true } });
  return u?.flatId || null;
}

// List agreements. Admin sees the whole society (optional ?status / ?flatId);
// a resident sees only their own flat's agreements.
rentRouter.get("/rent-agreements", authRequired, async (req, res) => {
  const societyId = req.user.societyId || "__none__";
  const where = { societyId };
  if (req.user.role === "resident") {
    const flatId = await residentFlatId(req.user.id);
    if (!flatId) return res.json({ agreements: [] });
    where.flatId = flatId;
  } else if (["admin", "superadmin"].includes(req.user.role)) {
    if (req.query.status) where.status = String(req.query.status);
    if (req.query.flatId) where.flatId = String(req.query.flatId);
  } else {
    return res.status(403).json({ message: "Not allowed for your role" });
  }
  const agreements = await prisma.rentAgreement.findMany({
    where,
    include: { flat: true },
    orderBy: { createdAt: "desc" },
  });
  res.json({ agreements: agreements.map(serializeRentAgreement) });
});

// Submit a rent agreement for a rented flat. Residents submit for their own flat;
// admins can submit for any flat (and it auto-marks the flat as rented).
rentRouter.post("/rent-agreements", authRequired, roleRequired("resident", "admin"), async (req, res) => {
  const societyId = req.user.societyId || "__none__";
  const {
    flatId: bodyFlatId,
    tenantName,
    tenantPhone,
    tenantEmail,
    ownerName,
    ownerPhone,
    startDate,
    endDate,
    rentAmount,
    documentBase64,
    documentName,
  } = req.body || {};

  let flatId = bodyFlatId;
  if (req.user.role === "resident") flatId = await residentFlatId(req.user.id);
  if (!flatId) return res.status(400).json({ message: "No flat linked to this account" });

  const flat = await prisma.flat.findFirst({ where: { id: flatId, societyId } });
  if (!flat) return res.status(404).json({ message: "Flat not found" });

  if (!tenantName || !String(tenantName).trim()) {
    return res.status(400).json({ message: "Tenant name is required" });
  }
  if (!DATE_RE.test(String(startDate || "")) || !DATE_RE.test(String(endDate || ""))) {
    return res.status(400).json({ message: "startDate and endDate must be YYYY-MM-DD" });
  }
  if (String(endDate) <= String(startDate)) {
    return res.status(400).json({ message: "End date must be after the start date" });
  }

  // Only rented flats have agreements. A resident must ask the admin to mark the
  // flat rented first; an admin submitting one implicitly marks it rented.
  if (flat.occupancy !== "rented") {
    if (req.user.role === "admin") {
      await prisma.flat.update({ where: { id: flat.id }, data: { occupancy: "rented" } });
    } else {
      return res.status(400).json({
        message: "This flat isn't marked as rented. Please ask your society admin to mark it rented first.",
      });
    }
  }

  const created = await prisma.rentAgreement.create({
    data: {
      flatId: flat.id,
      societyId,
      tenantName: String(tenantName).trim(),
      tenantPhone: tenantPhone ? String(tenantPhone).trim() : null,
      tenantEmail: tenantEmail ? String(tenantEmail).trim().toLowerCase() : null,
      ownerName: ownerName ? String(ownerName).trim() : flat.ownerName || null,
      ownerPhone: ownerPhone ? String(ownerPhone).trim() : null,
      startDate: String(startDate),
      endDate: String(endDate),
      rentAmount: rentAmount === undefined || rentAmount === null || rentAmount === "" ? null : Number(rentAmount),
      documentName: documentName ? String(documentName).slice(0, 200) : null,
      status: "pending",
      createdBy: req.user.id,
    },
  });

  // Upload the document (if provided + storage configured) keyed by the new id.
  if (documentBase64) {
    const url = await uploadDocument(documentBase64, created.id, "rent-agreements");
    if (url) await prisma.rentAgreement.update({ where: { id: created.id }, data: { documentUrl: url } });
  }

  // Nudge admins that a new agreement is awaiting verification.
  const admins = await prisma.user.findMany({
    where: { societyId, role: "admin", notifyEnabled: true, expoPushToken: { not: null } },
    select: { expoPushToken: true },
  });
  await Promise.all(
    admins.map((a) =>
      sendPush(a.expoPushToken, "Rent agreement to verify", `Flat ${flat.flatNo}: ${tenantName}`, {
        type: "rent_agreement",
      })
    )
  );

  const full = await prisma.rentAgreement.findUnique({ where: { id: created.id }, include: { flat: true } });
  res.status(201).json({ agreement: serializeRentAgreement(full) });
});

// Admin verifies (approve) or rejects a submitted agreement.
rentRouter.post("/rent-agreements/:id/verify", authRequired, roleRequired("admin"), async (req, res) => {
  const societyId = req.user.societyId || "__none__";
  const { approve, rejectionReason } = req.body || {};
  const agreement = await prisma.rentAgreement.findFirst({
    where: { id: req.params.id, societyId },
    include: { flat: { include: { residents: true } } },
  });
  if (!agreement) return res.status(404).json({ message: "Agreement not found" });

  const status = approve ? "verified" : "rejected";
  const updated = await prisma.rentAgreement.update({
    where: { id: agreement.id },
    data: {
      status,
      verifiedBy: req.user.id,
      verifiedAt: new Date(),
      rejectionReason: approve ? null : rejectionReason ? String(rejectionReason).slice(0, 300) : null,
      // Reset reminder tracking so expiry alerts start fresh once verified.
      lastNotifiedStage: approve ? null : agreement.lastNotifiedStage,
    },
    include: { flat: true },
  });

  // Tell the owner (app account) + tenant the outcome.
  const owner = (agreement.flat?.residents || []).find((u) => u.role === "resident") || null;
  const title = approve ? "Rent agreement verified" : "Rent agreement rejected";
  const body = approve
    ? `Your rent agreement for flat ${agreement.flat?.flatNo} (until ${agreement.endDate}) has been verified.`
    : `Your rent agreement for flat ${agreement.flat?.flatNo} was rejected. ${rejectionReason ? "Reason: " + rejectionReason : ""}`.trim();

  if (owner?.expoPushToken && owner.notifyEnabled) sendPush(owner.expoPushToken, title, body, { type: "rent_agreement" });
  const emails = [owner?.email, agreement.tenantEmail].filter(Boolean);
  await Promise.all(emails.map((to) => sendEmail({ to, subject: title, text: body }).catch(() => {})));

  res.json({ agreement: serializeRentAgreement(updated) });
});

// Admin deletes an agreement.
rentRouter.delete("/rent-agreements/:id", authRequired, roleRequired("admin"), async (req, res) => {
  const societyId = req.user.societyId || "__none__";
  const agreement = await prisma.rentAgreement.findFirst({ where: { id: req.params.id, societyId } });
  if (!agreement) return res.status(404).json({ message: "Agreement not found" });
  await prisma.rentAgreement.delete({ where: { id: agreement.id } });
  res.json({ ok: true });
});

// Manual trigger of the expiry sweep for this admin's society.
rentRouter.post("/rent-agreements/run-expiry-check", authRequired, roleRequired("admin"), async (req, res) => {
  const result = await runRentExpiryChecks({ societyId: req.user.societyId || "__none__" });
  res.json({ ok: true, ...result });
});
