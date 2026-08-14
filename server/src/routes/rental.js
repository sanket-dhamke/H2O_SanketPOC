import { Router } from "express";
import { prisma } from "../prisma.js";
import { authRequired, roleRequired } from "../auth.js";

// Rental compliance loop: pairs with the rent-agreement feature. Tracks police
// verification, a move-in / move-out checklist and the security deposit for each
// rented flat, so committees stay compliant (esp. Maharashtra tenant verification).
export const rentalRouter = Router();

export const DEFAULT_MOVE_IN = [
  "Police tenant verification submitted",
  "Registered rent agreement uploaded",
  "Tenant KYC (ID + photo) collected",
  "Move-in inspection done",
  "Security deposit received",
  "Access cards / keys issued",
];
export const DEFAULT_MOVE_OUT = [
  "Move-out inspection done",
  "Dues cleared",
  "Access cards / keys returned",
  "Deposit settlement agreed",
];

const asChecks = (arr, fallback) =>
  Array.isArray(arr) && arr.length ? arr.map((c) => ({ label: String(c.label || c), done: !!c.done })) : fallback.map((l) => ({ label: l, done: false }));

function serialize(r) {
  return {
    id: r.id,
    flatId: r.flatId,
    agreementId: r.agreementId || null,
    policeVerified: r.policeVerified,
    policeRef: r.policeRef || null,
    moveInAt: r.moveInAt || null,
    moveOutAt: r.moveOutAt || null,
    moveInChecks: asChecks(r.moveInChecks, DEFAULT_MOVE_IN),
    moveOutChecks: asChecks(r.moveOutChecks, DEFAULT_MOVE_OUT),
    depositAmount: r.depositAmount ?? null,
    depositStatus: r.depositStatus,
    depositNote: r.depositNote || null,
    updatedAt: r.updatedAt,
  };
}

// List all rented flats + their compliance record (creating a blank one on the
// fly for any rented flat that doesn't have one yet).
rentalRouter.get("/rental", authRequired, roleRequired("admin"), async (req, res) => {
  const societyId = req.user.societyId || "__none__";
  const flats = await prisma.flat.findMany({ where: { societyId, occupancy: "rented" }, orderBy: { flatNo: "asc" } }).catch(() => []);
  const records = await prisma.rentalCompliance.findMany({ where: { societyId } });
  const byFlat = new Map(records.map((r) => [r.flatId, r]));
  const out = flats.map((f) => ({
    flatId: f.id,
    flatNo: f.flatNo,
    ownerName: f.ownerName || null,
    compliance: byFlat.has(f.id) ? serialize(byFlat.get(f.id)) : null,
  }));
  res.json({ flats: out });
});

rentalRouter.get("/rental/:flatId", authRequired, roleRequired("admin"), async (req, res) => {
  const r = await prisma.rentalCompliance.findFirst({ where: { flatId: req.params.flatId, societyId: req.user.societyId || "__none__" } });
  res.json({ compliance: r ? serialize(r) : { flatId: req.params.flatId, moveInChecks: asChecks(null, DEFAULT_MOVE_IN), moveOutChecks: asChecks(null, DEFAULT_MOVE_OUT), depositStatus: "held", policeVerified: false } });
});

// Upsert the compliance record for a flat.
rentalRouter.post("/rental/:flatId", authRequired, roleRequired("admin"), async (req, res) => {
  const societyId = req.user.societyId;
  const flat = await prisma.flat.findFirst({ where: { id: req.params.flatId, societyId } });
  if (!flat) return res.status(404).json({ message: "Flat not found" });
  const b = req.body || {};
  const data = {
    societyId,
    flatId: flat.id,
    agreementId: b.agreementId || null,
    policeVerified: !!b.policeVerified,
    policeRef: b.policeRef || null,
    moveInAt: b.moveInAt ? new Date(b.moveInAt) : null,
    moveOutAt: b.moveOutAt ? new Date(b.moveOutAt) : null,
    moveInChecks: asChecks(b.moveInChecks, DEFAULT_MOVE_IN),
    moveOutChecks: asChecks(b.moveOutChecks, DEFAULT_MOVE_OUT),
    depositAmount: b.depositAmount != null && b.depositAmount !== "" ? Number(b.depositAmount) : null,
    depositStatus: ["held", "partially_returned", "returned", "forfeited"].includes(b.depositStatus) ? b.depositStatus : "held",
    depositNote: b.depositNote || null,
  };
  const existing = await prisma.rentalCompliance.findFirst({ where: { flatId: flat.id, societyId } });
  const saved = existing
    ? await prisma.rentalCompliance.update({ where: { id: existing.id }, data })
    : await prisma.rentalCompliance.create({ data: { ...data, createdById: req.user.id } });
  res.json({ compliance: serialize(saved) });
});
