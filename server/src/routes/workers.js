import { Router } from "express";
import { randomBytes } from "crypto";
import { prisma } from "../prisma.js";
import { authRequired, roleRequired } from "../auth.js";

// Portable Helper & Vendor "Trust Passport". Workers are network-wide (not
// scoped to a society) so their rating & attendance travel across every
// GATEZO society — something a single-society app structurally can't do.
export const workersRouter = Router();

const cleanPhone = (p) => String(p || "").replace(/[^\d]/g, "").slice(-10);

// Society gates run on India time. UTC midnight would mark a 1 AM arrival as yesterday.
function indiaDate(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

async function uniqueWorkerCode() {
  for (let i = 0; i < 6; i++) {
    const code = "GW" + randomBytes(4).toString("hex").toUpperCase();
    const clash = await prisma.worker.findUnique({ where: { code } });
    if (!clash) return code;
  }
  return "GW" + Date.now().toString(36).toUpperCase();
}

// Aggregate star rating + review count for a set of worker ids (single query).
async function ratingMap(workerIds) {
  if (!workerIds.length) return new Map();
  const rows = await prisma.workerRating.groupBy({
    by: ["workerId"],
    where: { workerId: { in: workerIds } },
    _avg: { stars: true },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.workerId, { avg: r._avg.stars || 0, count: r._count._all }]));
}

// Full passport for one worker: identity + portable aggregate + recent reviews
// + how many distinct societies they've served + the caller's own rating.
async function buildPassport(worker, userId) {
  const [agg, reviews, ratingSocieties, attendanceSocieties, mine] = await Promise.all([
    prisma.workerRating.aggregate({ where: { workerId: worker.id }, _avg: { stars: true }, _count: { _all: true } }),
    prisma.workerRating.findMany({ where: { workerId: worker.id }, orderBy: { updatedAt: "desc" }, take: 15, select: { stars: true, comment: true, byName: true, updatedAt: true } }),
    prisma.workerRating.findMany({ where: { workerId: worker.id, societyId: { not: null } }, distinct: ["societyId"], select: { societyId: true } }),
    prisma.workerAttendance.findMany({ where: { workerId: worker.id }, distinct: ["societyId"], select: { societyId: true } }),
    userId ? prisma.workerRating.findUnique({ where: { workerId_byUserId: { workerId: worker.id, byUserId: userId } }, select: { stars: true, comment: true } }) : null,
  ]);
  const served = new Set([...ratingSocieties.map((r) => r.societyId), ...attendanceSocieties.map((r) => r.societyId)]);
  return {
    id: worker.id,
    name: worker.name,
    phone: worker.phone,
    category: worker.category,
    subtype: worker.subtype,
    photoUrl: worker.photoUrl,
    idProof: worker.idProof,
    code: worker.code,
    rating: Math.round((agg._avg.stars || 0) * 10) / 10,
    reviewCount: agg._count._all,
    societiesServed: served.size,
    reviews: reviews.map((r) => ({ stars: r.stars, comment: r.comment, by: r.byName, at: r.updatedAt })),
    myRating: mine || null,
  };
}

// Directory: search workers network-wide with their portable rating.
workersRouter.get("/workers", authRequired, async (req, res) => {
  const { query, category } = req.query;
  const q = String(query || "").trim();
  const where = {
    active: true,
    ...(category ? { category: String(category) } : {}),
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { subtype: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] } : {}),
  };
  const workers = await prisma.worker.findMany({ where, orderBy: { createdAt: "desc" }, take: 60 });
  const ratings = await ratingMap(workers.map((w) => w.id));
  let openByWorker = new Map();
  if (req.user.role === "guard" || req.user.role === "admin") {
    const open = await prisma.workerAttendance.findMany({
      where: { societyId: req.user.societyId || "__none__", date: indiaDate(), outAt: null },
    });
    openByWorker = new Map(open.map((row) => [row.workerId, row]));
  }
  const list = workers
    .map((w) => {
      const r = ratings.get(w.id) || { avg: 0, count: 0 };
      const visit = openByWorker.get(w.id) || null;
      return {
        id: w.id,
        name: w.name,
        phone: w.phone,
        category: w.category,
        subtype: w.subtype,
        photoUrl: w.photoUrl,
        rating: Math.round(r.avg * 10) / 10,
        reviewCount: r.count,
        inside: !!visit,
        attendanceId: visit?.id || null,
        inAt: visit?.inAt || null,
      };
    })
    .sort((a, b) => b.reviewCount - a.reviewCount || b.rating - a.rating || a.name.localeCompare(b.name));
  res.json({ workers: list });
});

// Register a worker (any member). De-duplicates by phone so the same maid keeps
// ONE portable identity no matter which society/resident adds her.
workersRouter.post("/workers", authRequired, async (req, res) => {
  const { name, phone, category, subtype, photoUrl, idProof } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ message: "Name is required" });
  const p = cleanPhone(phone);
  if (p.length !== 10) return res.status(400).json({ message: "A valid 10-digit phone is required (it's the worker's portable identity)." });
  const existing = await prisma.worker.findUnique({ where: { phone: p } });
  if (existing) {
    // Backfill any missing details, but never overwrite an existing photo/subtype.
    const data = {};
    if (!existing.subtype && subtype) data.subtype = String(subtype).trim();
    if (!existing.photoUrl && photoUrl) data.photoUrl = photoUrl;
    if (!existing.idProof && idProof) data.idProof = String(idProof).trim();
    const updated = Object.keys(data).length ? await prisma.worker.update({ where: { id: existing.id }, data }) : existing;
    return res.json({ worker: await buildPassport(updated, req.user.id), existed: true });
  }
  const worker = await prisma.worker.create({
    data: {
      name: String(name).trim(),
      phone: p,
      category: String(category || "helpers"),
      subtype: subtype ? String(subtype).trim() : null,
      photoUrl: photoUrl || null,
      idProof: idProof ? String(idProof).trim() : null,
      code: await uniqueWorkerCode(),
      createdById: req.user.id,
    },
  });
  res.status(201).json({ worker: await buildPassport(worker, req.user.id), existed: false });
});

workersRouter.get("/workers/code/:code", authRequired, async (req, res) => {
  const worker = await prisma.worker.findUnique({ where: { code: String(req.params.code) } });
  if (!worker) return res.status(404).json({ message: "No worker matches this pass" });
  res.json({ worker: await buildPassport(worker, req.user.id) });
});

workersRouter.get("/workers/:id", authRequired, async (req, res) => {
  const worker = await prisma.worker.findUnique({ where: { id: req.params.id } });
  if (!worker) return res.status(404).json({ message: "Worker not found" });
  res.json({ worker: await buildPassport(worker, req.user.id) });
});

// Add / update the caller's rating for a worker (portable across societies).
workersRouter.post("/workers/:id/ratings", authRequired, async (req, res) => {
  const worker = await prisma.worker.findUnique({ where: { id: req.params.id } });
  if (!worker) return res.status(404).json({ message: "Worker not found" });
  let { stars, comment } = req.body || {};
  stars = Math.max(1, Math.min(5, Math.round(Number(stars) || 0)));
  if (!stars) return res.status(400).json({ message: "Please give 1–5 stars" });
  await prisma.workerRating.upsert({
    where: { workerId_byUserId: { workerId: worker.id, byUserId: req.user.id } },
    update: { stars, comment: comment ? String(comment).trim() : null, societyId: req.user.societyId || null, byName: req.user.name || null },
    create: { workerId: worker.id, byUserId: req.user.id, stars, comment: comment ? String(comment).trim() : null, societyId: req.user.societyId || null, byName: req.user.name || null },
  });
  res.json({ worker: await buildPassport(worker, req.user.id) });
});

// Today's helper movement at this society: who is inside now, who has left.
// The gate screen needs one list; per-worker history is the route below.
workersRouter.get("/workers/attendance/today", authRequired, roleRequired("guard", "admin"), async (req, res) => {
  const societyId = req.user.societyId || "__none__";
  const date = String(req.query.date || indiaDate());
  const rows = await prisma.workerAttendance.findMany({
    where: { societyId, date },
    orderBy: { inAt: "desc" },
    take: 200,
  });
  const workers = rows.length
    ? await prisma.worker.findMany({
        where: { id: { in: [...new Set(rows.map((r) => r.workerId))] } },
        select: { id: true, name: true, phone: true, category: true, subtype: true, photoUrl: true, code: true },
      })
    : [];
  const byId = new Map(workers.map((w) => [w.id, w]));
  const flatIds = [...new Set(rows.map((r) => r.flatId).filter(Boolean))];
  const flats = flatIds.length
    ? await prisma.flat.findMany({ where: { id: { in: flatIds } }, select: { id: true, flatNo: true } })
    : [];
  const flatById = new Map(flats.map((f) => [f.id, f.flatNo]));

  const records = rows.map((r) => {
    const w = byId.get(r.workerId) || null;
    return {
      id: r.id,
      workerId: r.workerId,
      name: w?.name || "Helper",
      phone: w?.phone || null,
      category: w?.category || null,
      subtype: w?.subtype || null,
      photoUrl: w?.photoUrl || null,
      code: w?.code || null,
      flatNo: r.flatId ? flatById.get(r.flatId) || null : null,
      inAt: r.inAt,
      outAt: r.outAt,
    };
  });

  res.json({
    date,
    records,
    onPremise: records.filter((r) => !r.outAt).length,
    total: records.length,
  });
});

// Guard/admin: log a worker's gate entry/exit at THIS society (portable attendance).
workersRouter.get("/workers/:id/attendance", authRequired, async (req, res) => {
  const societyId = req.user.societyId || "__none__";
  const rows = await prisma.workerAttendance.findMany({
    where: { workerId: req.params.id, societyId },
    orderBy: { inAt: "desc" },
    take: 30,
  });
  res.json({ attendance: rows });
});

workersRouter.post("/workers/:id/attendance/checkin", authRequired, roleRequired("guard", "admin"), async (req, res) => {
  const worker = await prisma.worker.findUnique({ where: { id: req.params.id } });
  if (!worker) return res.status(404).json({ message: "Worker not found" });
  const societyId = req.user.societyId;
  const date = indiaDate();
  // Re-use an open (not checked-out) row for today if one exists.
  const open = await prisma.workerAttendance.findFirst({ where: { workerId: worker.id, societyId, date, outAt: null } });
  if (open) return res.json({ attendance: open, alreadyIn: true });
  const row = await prisma.workerAttendance.create({
    data: { workerId: worker.id, societyId, date, flatId: req.body?.flatId || null, markedBy: req.user.id },
  });
  res.status(201).json({ attendance: row });
});

workersRouter.post("/workers/attendance/:id/checkout", authRequired, roleRequired("guard", "admin"), async (req, res) => {
  const row = await prisma.workerAttendance.findFirst({ where: { id: req.params.id, societyId: req.user.societyId } });
  if (!row) return res.status(404).json({ message: "Attendance record not found" });
  if (row.outAt) return res.json({ attendance: row });
  const updated = await prisma.workerAttendance.update({ where: { id: row.id }, data: { outAt: new Date() } });
  res.json({ attendance: updated });
});
