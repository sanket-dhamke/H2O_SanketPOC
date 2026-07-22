import { Router } from "express";
import { prisma } from "../prisma.js";
import { authRequired, roleRequired } from "../auth.js";
import { serializeStaffAttendance } from "../serializers.js";

// Staff/teacher gate attendance (check-in / check-out). Guard or admin marks it.
// Scoped to the caller's society. Primarily used by preschool tenants.
export const staffRouter = Router();

const sid = (req) => req.user.societyId || "__none__";
const today = () => new Date().toISOString().slice(0, 10);

// List attendance. ?date=YYYY-MM-DD (defaults to today).
staffRouter.get("/staff-attendance", authRequired, roleRequired("guard", "admin"), async (req, res) => {
  const date = String(req.query.date || today());
  const records = await prisma.staffAttendance.findMany({
    where: { societyId: sid(req), date },
    orderBy: { inAt: "desc" },
  });
  res.json({
    date,
    records: records.map(serializeStaffAttendance),
    onPremise: records.filter((r) => !r.outAt).length,
    total: records.length,
  });
});

// Check a staff member IN.
staffRouter.post("/staff-attendance", authRequired, roleRequired("guard", "admin"), async (req, res) => {
  const { name, role, phone } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ message: "name is required" });
  const record = await prisma.staffAttendance.create({
    data: {
      societyId: req.user.societyId,
      name: String(name).trim(),
      role: role ? String(role).trim() : null,
      phone: phone ? String(phone).trim() : null,
      date: today(),
      markedBy: req.user.id,
    },
  });
  res.status(201).json({ record: serializeStaffAttendance(record) });
});

// Check a staff member OUT.
staffRouter.post("/staff-attendance/:id/checkout", authRequired, roleRequired("guard", "admin"), async (req, res) => {
  const record = await prisma.staffAttendance.findFirst({ where: { id: req.params.id, societyId: sid(req) } });
  if (!record) return res.status(404).json({ message: "Record not found" });
  if (record.outAt) return res.status(400).json({ message: "Already checked out" });
  const updated = await prisma.staffAttendance.update({ where: { id: record.id }, data: { outAt: new Date() } });
  res.json({ record: serializeStaffAttendance(updated) });
});