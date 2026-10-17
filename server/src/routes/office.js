import { Router } from "express";
import { prisma } from "../prisma.js";
import { authRequired, roleRequired } from "../auth.js";
import { billBalance, refreshLateFees } from "../billing.js";
import { moneySplits, collectionMonths, serializeMove, serializeVendorBill, vendorImageList } from "../office.js";
import { uploadDocument } from "../storage.js";

export const officeRouter = Router();
officeRouter.use(authRequired, roleRequired("admin"));

const sid = (req) => req.user.societyId || "__none__";
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const MOVE_KINDS = ["move_in", "move_out"];
const VENDOR_CATS = ["security", "housekeeping", "maintenance", "utilities", "other"];

function clip(v, max) {
  return String(v || "").trim().slice(0, max);
}

const MAX_VENDOR_PHOTOS = 30;
const MAX_IMG_CHARS = 4_000_000;

async function storeVendorImages(images) {
  const incoming = vendorImageList(images).slice(0, MAX_VENDOR_PHOTOS);
  const stamp = Date.now();
  const uploaded = await Promise.all(
    incoming.map(async (img, i) => {
      if (img.startsWith("http")) return img;
      if (img.length > MAX_IMG_CHARS) return null;
      const url = await uploadDocument(img, `vendor-${stamp}-${i}`, "vendor-bills");
      return url || (img.startsWith("data:") ? img : null);
    })
  );
  return uploaded.filter(Boolean);
}

officeRouter.get("/office", async (req, res) => {
  const societyId = sid(req);
  await refreshLateFees(societyId).catch(() => {});
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  const [society, bills, expenses, flats, pendingUsers, openTickets, escalated, moves, vendors, deposits] =
    await Promise.all([
      prisma.society.findUnique({ where: { id: societyId }, select: { visitorRetentionDays: true, name: true } }),
      prisma.bill.findMany({ where: { flat: { societyId } } }),
      prisma.expense.findMany({ where: { societyId } }),
      prisma.flat.findMany({ where: { societyId }, select: { id: true, flatNo: true, block: true } }),
      prisma.user.count({ where: { societyId, pendingApproval: true, active: true } }),
      prisma.ticket.count({ where: { societyId, status: { in: ["open", "in_progress"] } } }),
      prisma.ticket.count({ where: { societyId, status: "escalated" } }),
      prisma.occupancyMove.findMany({ where: { societyId, date: { gte: monthStart } }, orderBy: { date: "desc" }, take: 50 }),
      prisma.vendorBill.findMany({ where: { societyId, status: "unpaid" } }),
      prisma.rentalCompliance.aggregate({
        where: { societyId, depositStatus: { in: ["held", "partially_returned"] } },
        _sum: { depositAmount: true },
      }),
    ]);

  const splits = moneySplits(bills);
  const totalExpenses = expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const vendorUnpaid = vendors.reduce((s, v) => s + (v.amount || 0), 0);
  const flatNo = new Map(flats.map((f) => [f.id, f.flatNo]));
  const dueByFlat = new Map();
  for (const b of bills) {
    const bal = billBalance(b);
    if (bal <= 0) continue;
    dueByFlat.set(b.flatId, (dueByFlat.get(b.flatId) || 0) + bal);
  }
  const defaulters = flats
    .map((f) => ({ flatId: f.id, flatNo: f.flatNo, block: f.block || null, pending: Math.round(dueByFlat.get(f.id) || 0) }))
    .filter((f) => f.pending > 0)
    .sort((a, b) => b.pending - a.pending);

  res.json({
    societyName: society?.name || null,
    visitorRetentionDays: society?.visitorRetentionDays || null,
    totalCollected: splits.collected,
    totalPending: splits.pending,
    overdue: splits.overdue,
    advance: splits.advance,
    totalExpenses: Math.round(totalExpenses),
    balance: Math.round(splits.collected - totalExpenses),
    securityDeposit: Math.round(deposits._sum.depositAmount || 0),
    vendorUnpaid: Math.round(vendorUnpaid),
    collectionByMonth: collectionMonths(bills),
    defaulters: defaulters.slice(0, 40),
    pending: {
      newUsers: pendingUsers,
      moves: moves.length,
      tickets: openTickets,
      escalated,
      paymentIntimations: defaulters.length,
      vendorBills: vendors.length,
    },
    recentMoves: moves.slice(0, 8).map((m) => serializeMove(m, flatNo.get(m.flatId))),
  });
});

officeRouter.get("/settings", async (req, res) => {
  const society = await prisma.society.findUnique({
    where: { id: sid(req) },
    select: { visitorRetentionDays: true },
  });
  res.json({ visitorRetentionDays: society?.visitorRetentionDays || null });
});

officeRouter.patch("/settings", async (req, res) => {
  let days = req.body?.visitorRetentionDays;
  if (days === "" || days == null) days = null;
  else {
    days = parseInt(days, 10);
    if (!Number.isFinite(days) || days < 0 || days > 3650) {
      return res.status(400).json({ message: "visitorRetentionDays must be 0–3650, or empty to keep forever" });
    }
    if (days === 0) days = null;
  }
  const society = await prisma.society.update({
    where: { id: sid(req) },
    data: { visitorRetentionDays: days },
    select: { visitorRetentionDays: true },
  });
  res.json({ visitorRetentionDays: society.visitorRetentionDays });
});

officeRouter.get("/moves", async (req, res) => {
  const flats = await prisma.flat.findMany({ where: { societyId: sid(req) }, select: { id: true, flatNo: true } });
  const names = new Map(flats.map((f) => [f.id, f.flatNo]));
  const moves = await prisma.occupancyMove.findMany({
    where: { societyId: sid(req) },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 200,
  });
  res.json({ moves: moves.map((m) => serializeMove(m, names.get(m.flatId))) });
});

officeRouter.post("/moves", async (req, res) => {
  const kind = MOVE_KINDS.includes(req.body?.kind) ? req.body.kind : null;
  const flatId = clip(req.body?.flatId, 80);
  const residentName = clip(req.body?.residentName, 80);
  const date = clip(req.body?.date, 10);
  if (!kind || !flatId || !residentName || !YMD.test(date)) {
    return res.status(400).json({ message: "kind, flatId, residentName and date (YYYY-MM-DD) are required" });
  }
  const flat = await prisma.flat.findFirst({ where: { id: flatId, societyId: sid(req) } });
  if (!flat) return res.status(404).json({ message: "Flat not found in your society" });
  const depositAmount =
    req.body?.depositAmount != null && req.body.depositAmount !== "" ? Number(req.body.depositAmount) : null;
  if (depositAmount != null && (!Number.isFinite(depositAmount) || depositAmount < 0)) {
    return res.status(400).json({ message: "depositAmount must be a positive number" });
  }
  const move = await prisma.occupancyMove.create({
    data: {
      societyId: sid(req),
      flatId: flat.id,
      kind,
      residentName,
      phone: clip(req.body?.phone, 20) || null,
      email: clip(req.body?.email, 120) || null,
      date,
      notes: clip(req.body?.notes, 500) || null,
      depositAmount,
      createdById: req.user.id,
    },
  });
  if (kind === "move_in" && depositAmount > 0) {
    const existing = await prisma.rentalCompliance.findFirst({ where: { societyId: sid(req), flatId: flat.id } });
    if (existing) {
      await prisma.rentalCompliance.update({
        where: { id: existing.id },
        data: { depositAmount, depositStatus: "held", moveInAt: new Date(`${date}T00:00:00`) },
      });
    } else {
      await prisma.rentalCompliance.create({
        data: {
          societyId: sid(req),
          flatId: flat.id,
          depositAmount,
          depositStatus: "held",
          moveInAt: new Date(`${date}T00:00:00`),
          createdById: req.user.id,
        },
      });
    }
  }
  if (kind === "move_out") {
    await prisma.rentalCompliance.updateMany({
      where: { societyId: sid(req), flatId: flat.id, moveOutAt: null },
      data: { moveOutAt: new Date(`${date}T00:00:00`) },
    });
  }
  res.status(201).json({ move: serializeMove(move, flat.flatNo) });
});

officeRouter.get("/vendors", async (req, res) => {
  const rows = await prisma.vendorBill.findMany({
    where: { societyId: sid(req) },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 300,
  });
  res.json({ vendors: rows.map(serializeVendorBill) });
});

officeRouter.post("/vendors", async (req, res) => {
  const vendorName = clip(req.body?.vendorName, 80);
  const amount = Number(req.body?.amount);
  if (!vendorName || !Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ message: "vendorName and a positive amount are required" });
  }
  const dueDate = clip(req.body?.dueDate, 10);
  if (dueDate && !YMD.test(dueDate)) return res.status(400).json({ message: "dueDate must be YYYY-MM-DD" });
  const images = await storeVendorImages(req.body?.images);
  const row = await prisma.vendorBill.create({
    data: {
      societyId: sid(req),
      vendorName,
      category: VENDOR_CATS.includes(req.body?.category) ? req.body.category : "other",
      description: clip(req.body?.description, 240) || null,
      images: images.length ? images : undefined,
      amount,
      dueDate: dueDate || null,
      createdById: req.user.id,
    },
  });
  res.status(201).json({ vendor: serializeVendorBill(row) });
});

officeRouter.post("/vendors/:id/pay", async (req, res) => {
  const row = await prisma.vendorBill.findFirst({ where: { id: req.params.id, societyId: sid(req) } });
  if (!row) return res.status(404).json({ message: "Vendor bill not found" });
  if (row.status === "paid") return res.status(400).json({ message: "Already paid" });
  const updated = await prisma.vendorBill.update({
    where: { id: row.id },
    data: {
      status: "paid",
      paidAt: new Date(),
      paymentRef: clip(req.body?.paymentRef, 60) || `CASH-${row.id.slice(0, 8)}`,
    },
  });
  await prisma.expense.create({
    data: {
      societyId: sid(req),
      label: `Vendor · ${updated.vendorName}`,
      amount: updated.amount,
      createdBy: req.user.id,
    },
  });
  res.json({ vendor: serializeVendorBill(updated) });
});

officeRouter.get("/entry-exit", async (req, res) => {
  const from = YMD.test(req.query.from) ? req.query.from : ymdDaysAgo(30);
  const to = YMD.test(req.query.to) ? req.query.to : ymdDaysAgo(0);
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T23:59:59`);
  const visitors = await prisma.visitor.findMany({
    where: {
      flat: { societyId: sid(req) },
      createdAt: { gte: start, lte: end },
    },
    include: { flat: true },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  const rows = visitors.map((v) => {
    const mins = v.exitAt && v.createdAt ? Math.max(0, Math.round((new Date(v.exitAt) - new Date(v.createdAt)) / 60000)) : null;
    return {
      id: v.id,
      name: v.name,
      flatNo: v.flat?.flatNo || null,
      purpose: v.purpose || null,
      status: v.status,
      inAt: v.createdAt,
      outAt: v.exitAt || null,
      minutes: mins,
    };
  });
  res.json({
    from,
    to,
    total: rows.length,
    stillInside: rows.filter((r) => !r.outAt && r.status === "approved").length,
    visitors: rows,
  });
});

function ymdDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
