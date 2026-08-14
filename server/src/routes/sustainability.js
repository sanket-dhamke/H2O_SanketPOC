import { Router } from "express";
import { prisma } from "../prisma.js";
import { authRequired, roleRequired } from "../auth.js";

// Sustainability dashboard: per-flat water metering (manual or CSV) + a gamified
// "green score" that rewards flats using less than the society median.
export const sustainabilityRouter = Router();

const thisPeriod = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

async function myFlatId(userId) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { flatId: true } });
  return u?.flatId || null;
}

function median(nums) {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Green score: 100 at zero usage, 50 at the society median, scaling down as a
// flat exceeds the median. Simple, explainable and comparable month to month.
function greenScore(litres, med) {
  if (!med) return litres > 0 ? 70 : 100;
  const ratio = litres / med;
  return Math.max(0, Math.min(100, Math.round(100 - ratio * 50)));
}

sustainabilityRouter.get("/sustainability", authRequired, async (req, res) => {
  const societyId = req.user.societyId || "__none__";
  const period = String(req.query.period || thisPeriod());
  const readings = await prisma.waterReading.findMany({ where: { societyId, period } });
  const values = readings.map((r) => r.litres).filter((n) => n > 0);
  const med = median(values);
  const total = values.reduce((a, b) => a + b, 0);
  const flatCount = await prisma.flat.count({ where: { societyId } });

  const rows = readings.map((r) => ({ flatId: r.flatId, litres: r.litres, score: greenScore(r.litres, med) }));
  const societyScore = rows.length ? Math.round(rows.reduce((a, r) => a + r.score, 0) / rows.length) : 100;

  let mine = null;
  if (req.user.role === "resident") {
    const flatId = await myFlatId(req.user.id);
    const r = readings.find((x) => x.flatId === flatId);
    mine = { flatId, litres: r?.litres ?? null, score: r ? greenScore(r.litres, med) : null };
  }

  // Leaderboard (top savers) — join flat numbers.
  const flats = await prisma.flat.findMany({ where: { societyId }, select: { id: true, flatNo: true } });
  const flatNo = new Map(flats.map((f) => [f.id, f.flatNo]));
  const leaderboard = [...rows]
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((r) => ({ flatNo: flatNo.get(r.flatId) || "—", litres: r.litres, score: r.score }));

  res.json({ period, societyScore, median: med, totalLitres: total, reportedFlats: readings.length, flatCount, leaderboard, mine });
});

// Admin records/updates a flat's reading for a period (manual entry).
sustainabilityRouter.post("/sustainability/readings", authRequired, roleRequired("admin"), async (req, res) => {
  const b = req.body || {};
  if (!b.flatId) return res.status(400).json({ message: "flatId is required" });
  const flat = await prisma.flat.findFirst({ where: { id: b.flatId, societyId: req.user.societyId } });
  if (!flat) return res.status(404).json({ message: "Flat not found" });
  const period = String(b.period || thisPeriod());
  const litres = Number(b.litres) || 0;
  const saved = await prisma.waterReading.upsert({
    where: { flatId_period: { flatId: flat.id, period } },
    update: { litres, byId: req.user.id },
    create: { societyId: req.user.societyId, flatId: flat.id, period, litres, byId: req.user.id },
  });
  res.json({ reading: { flatId: saved.flatId, period: saved.period, litres: saved.litres } });
});

// Bulk CSV-style import: [{flatNo, litres}] for a period. Matches by flat number.
sustainabilityRouter.post("/sustainability/import", authRequired, roleRequired("admin"), async (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  const period = String(req.body?.period || thisPeriod());
  const flats = await prisma.flat.findMany({ where: { societyId: req.user.societyId }, select: { id: true, flatNo: true } });
  const byNo = new Map(flats.map((f) => [String(f.flatNo).toUpperCase(), f.id]));
  let saved = 0;
  for (const r of rows) {
    const flatId = byNo.get(String(r.flatNo || "").toUpperCase());
    if (!flatId) continue;
    const litres = Number(r.litres) || 0;
    await prisma.waterReading.upsert({
      where: { flatId_period: { flatId, period } },
      update: { litres, byId: req.user.id },
      create: { societyId: req.user.societyId, flatId, period, litres, byId: req.user.id },
    });
    saved++;
  }
  res.json({ ok: true, saved, received: rows.length });
});
