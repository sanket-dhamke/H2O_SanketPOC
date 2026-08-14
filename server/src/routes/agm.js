import { Router } from "express";
import { prisma } from "../prisma.js";
import { authRequired, roleRequired } from "../auth.js";
import { enqueuePush } from "../queue.js";
import { aiEnabled, summarizeMinutes } from "../ai.js";

// Digital AGM: admins create a meeting with motions, open e-voting (one vote per
// flat), quorum is tracked against the society's flat count, and closing the
// meeting tallies each motion and generates AI-summarised minutes (audit trail).
export const agmRouter = Router();

async function myFlatId(userId) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { flatId: true } });
  return u?.flatId || null;
}

async function serializeMeeting(m, userId, role) {
  const flatCount = await prisma.flat.count({ where: { societyId: m.societyId } });
  const attendCount = await prisma.meetingAttendance.count({ where: { meetingId: m.id } });
  const flatId = role === "resident" ? await myFlatId(userId) : null;
  const motions = [];
  for (const mo of m.motions || []) {
    const votes = mo.votes || [];
    const tally = { yes: 0, no: 0, abstain: 0 };
    let mine = null;
    for (const v of votes) {
      if (tally[v.choice] != null) tally[v.choice]++;
      if (flatId && v.flatId === flatId) mine = v.choice;
    }
    motions.push({ id: mo.id, title: mo.title, detail: mo.detail || null, order: mo.order, result: mo.result || null, tally, total: votes.length, myVote: mine });
  }
  const quorumMet = flatCount ? attendCount / flatCount >= (m.quorumPct || 50) / 100 : false;
  return {
    id: m.id,
    title: m.title,
    agenda: m.agenda || null,
    scheduledAt: m.scheduledAt || null,
    quorumPct: m.quorumPct,
    status: m.status,
    minutes: m.minutes || null,
    flatCount,
    attendCount,
    quorumMet,
    createdAt: m.createdAt,
    closedAt: m.closedAt || null,
    motions,
  };
}

const withMotions = { motions: { orderBy: { order: "asc" }, include: { votes: true } } };

agmRouter.get("/meetings", authRequired, async (req, res) => {
  const meetings = await prisma.meeting.findMany({
    where: { societyId: req.user.societyId || "__none__" },
    include: withMotions,
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const out = [];
  for (const m of meetings) out.push(await serializeMeeting(m, req.user.id, req.user.role));
  res.json({ meetings: out });
});

agmRouter.get("/meetings/:id", authRequired, async (req, res) => {
  const m = await prisma.meeting.findFirst({ where: { id: req.params.id, societyId: req.user.societyId || "__none__" }, include: withMotions });
  if (!m) return res.status(404).json({ message: "Meeting not found" });
  res.json({ meeting: await serializeMeeting(m, req.user.id, req.user.role) });
});

agmRouter.post("/meetings", authRequired, roleRequired("admin"), async (req, res) => {
  const b = req.body || {};
  if (!b.title || !String(b.title).trim()) return res.status(400).json({ message: "Title is required" });
  const motions = Array.isArray(b.motions) ? b.motions.filter((x) => x && String(x.title || "").trim()) : [];
  const m = await prisma.meeting.create({
    data: {
      societyId: req.user.societyId,
      title: String(b.title).trim(),
      agenda: b.agenda || null,
      scheduledAt: b.scheduledAt ? new Date(b.scheduledAt) : null,
      quorumPct: b.quorumPct ? Math.min(100, Math.max(1, parseInt(b.quorumPct, 10))) : 50,
      createdById: req.user.id,
      motions: { create: motions.map((x, i) => ({ title: String(x.title).trim(), detail: x.detail || null, order: i })) },
    },
    include: withMotions,
  });
  res.status(201).json({ meeting: await serializeMeeting(m, req.user.id, req.user.role) });
});

// Open or close voting. Closing tallies each motion and drafts the minutes.
agmRouter.post("/meetings/:id/status", authRequired, roleRequired("admin"), async (req, res) => {
  const status = req.body?.status;
  if (!["open", "closed", "draft"].includes(status)) return res.status(400).json({ message: "Invalid status" });
  const m = await prisma.meeting.findFirst({ where: { id: req.params.id, societyId: req.user.societyId || "__none__" }, include: withMotions });
  if (!m) return res.status(404).json({ message: "Meeting not found" });

  if (status === "open") {
    await prisma.meeting.update({ where: { id: m.id }, data: { status: "open" } });
    const residents = await prisma.user.findMany({ where: { societyId: m.societyId, role: "resident", active: true }, select: { expoPushToken: true, notifyEnabled: true } });
    residents.filter((r) => r.expoPushToken && r.notifyEnabled).forEach((r) =>
      enqueuePush(r.expoPushToken, `Voting open: ${m.title}`, "Cast your vote in the society AGM.", { type: "meeting", meetingId: m.id })
    );
  } else if (status === "closed") {
    // Tally each motion.
    const lines = [`AGM: ${m.title}`, m.agenda ? `Agenda: ${m.agenda}` : ""].filter(Boolean);
    for (const mo of m.motions) {
      const t = { yes: 0, no: 0, abstain: 0 };
      for (const v of mo.votes) if (t[v.choice] != null) t[v.choice]++;
      const result = t.yes > t.no ? "passed" : t.no > t.yes ? "rejected" : "tie";
      await prisma.motion.update({ where: { id: mo.id }, data: { result } });
      lines.push(`Motion: ${mo.title} — ${result.toUpperCase()} (yes ${t.yes}, no ${t.no}, abstain ${t.abstain})`);
    }
    const attendCount = await prisma.meetingAttendance.count({ where: { meetingId: m.id } });
    lines.push(`Attendance: ${attendCount} flats.`);
    const minutes = await summarizeMinutes(lines.join("\n"));
    await prisma.meeting.update({ where: { id: m.id }, data: { status: "closed", closedAt: new Date(), minutes } });
  } else {
    await prisma.meeting.update({ where: { id: m.id }, data: { status: "draft" } });
  }
  const fresh = await prisma.meeting.findUnique({ where: { id: m.id }, include: withMotions });
  res.json({ meeting: await serializeMeeting(fresh, req.user.id, req.user.role), aiMinutes: aiEnabled });
});

// Resident casts (or changes) their flat's vote on a motion. One vote per flat.
agmRouter.post("/motions/:id/vote", authRequired, roleRequired("resident"), async (req, res) => {
  const choice = req.body?.choice;
  if (!["yes", "no", "abstain"].includes(choice)) return res.status(400).json({ message: "choice must be yes/no/abstain" });
  const motion = await prisma.motion.findUnique({ where: { id: req.params.id }, include: { meeting: true } });
  if (!motion || motion.meeting.societyId !== req.user.societyId) return res.status(404).json({ message: "Motion not found" });
  if (motion.meeting.status !== "open") return res.status(400).json({ message: "Voting is not open" });
  const flatId = await myFlatId(req.user.id);
  if (!flatId) return res.status(400).json({ message: "No flat linked to your account" });

  await prisma.$transaction([
    prisma.vote.upsert({
      where: { motionId_flatId: { motionId: motion.id, flatId } },
      update: { choice, userId: req.user.id },
      create: { motionId: motion.id, flatId, userId: req.user.id, choice },
    }),
    prisma.meetingAttendance.upsert({
      where: { meetingId_flatId: { meetingId: motion.meetingId, flatId } },
      update: {},
      create: { meetingId: motion.meetingId, flatId, userId: req.user.id },
    }),
  ]);
  res.json({ ok: true });
});
