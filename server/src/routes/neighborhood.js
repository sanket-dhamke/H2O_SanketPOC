import { Router } from "express";
import { prisma } from "../prisma.js";
import { authRequired } from "../auth.js";
import { VISIBILITIES, KINDS, acceptedPeerIds, canMessage, filterFeed } from "../neighborhoodFeed.js";

export const neighborhoodRouter = Router();

let ready = null;
export function ensureNeighborhoodTables() {
  if (!ready) {
    ready = prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Follow" (
        "id" TEXT PRIMARY KEY,
        "requesterId" TEXT NOT NULL,
        "targetId" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'pending',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "Follow_requesterId_targetId_key" ON "Follow"("requesterId", "targetId");
      CREATE TABLE IF NOT EXISTS "NeighborhoodPost" (
        "id" TEXT PRIMARY KEY,
        "authorId" TEXT NOT NULL,
        "societyId" TEXT NOT NULL,
        "societyName" TEXT,
        "body" TEXT NOT NULL,
        "imageUrl" TEXT,
        "kind" TEXT NOT NULL DEFAULT 'post',
        "visibility" TEXT NOT NULL DEFAULT 'society',
        "pollOptions" JSONB,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS "NeighborhoodVote" (
        "id" TEXT PRIMARY KEY,
        "postId" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "option" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "NeighborhoodVote_postId_userId_key" ON "NeighborhoodVote"("postId", "userId");
      CREATE TABLE IF NOT EXISTS "NeighborhoodMessage" (
        "id" TEXT PRIMARY KEY,
        "fromId" TEXT NOT NULL,
        "toId" TEXT NOT NULL,
        "body" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `).catch((err) => {
      ready = null;
      throw err;
    });
  }
  return ready;
}

async function peersOf(userId) {
  const rows = await prisma.follow.findMany({
    where: { status: "accepted", OR: [{ requesterId: userId }, { targetId: userId }] },
  });
  return acceptedPeerIds(rows, userId);
}

function serializePost(post, viewerId) {
  const options = Array.isArray(post.pollOptions) ? post.pollOptions : [];
  const counts = {};
  for (const vote of post.votes || []) counts[vote.option] = (counts[vote.option] || 0) + 1;
  const mine = (post.votes || []).find((vote) => vote.userId === viewerId);
  return {
    id: post.id,
    body: post.body,
    imageUrl: post.imageUrl || null,
    kind: post.kind,
    visibility: post.visibility,
    authorId: post.authorId,
    authorName: post.author?.name || "Resident",
    societyId: post.societyId,
    societyName: post.societyName || post.author?.society?.name || null,
    createdAt: post.createdAt,
    poll: options.map((option) => ({ option, votes: counts[option] || 0 })),
    myVote: mine?.option || null,
  };
}

neighborhoodRouter.get("/neighborhood/feed", authRequired, async (req, res) => {
  await ensureNeighborhoodTables();
  const peers = await peersOf(req.user.id);
  const posts = await prisma.neighborhoodPost.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { author: { select: { name: true, society: { select: { name: true } } } }, votes: true },
  });
  const visible = filterFeed(posts, req.user, peers);
  res.json({ posts: visible.map((post) => serializePost(post, req.user.id)) });
});

neighborhoodRouter.post("/neighborhood/posts", authRequired, async (req, res) => {
  await ensureNeighborhoodTables();
  const body = String(req.body?.body || "").trim();
  const visibility = VISIBILITIES.includes(req.body?.visibility) ? req.body.visibility : "society";
  const kind = KINDS.includes(req.body?.kind) ? req.body.kind : "post";
  if (!body) return res.status(400).json({ message: "Write something to post." });
  if (!req.user.societyId) return res.status(400).json({ message: "Join a society before posting." });
  const pollOptions = kind === "poll"
    ? String(req.body?.pollOptions || "").split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 4)
    : [];
  if (kind === "poll" && pollOptions.length < 2) {
    return res.status(400).json({ message: "A poll needs at least two choices." });
  }
  const society = await prisma.society.findUnique({ where: { id: req.user.societyId }, select: { name: true } });
  const post = await prisma.neighborhoodPost.create({
    data: {
      authorId: req.user.id,
      societyId: req.user.societyId,
      societyName: society?.name || null,
      body,
      imageUrl: req.body?.imageUrl ? String(req.body.imageUrl).slice(0, 500) : null,
      kind,
      visibility,
      pollOptions: pollOptions.length ? pollOptions : undefined,
    },
    include: { author: { select: { name: true, society: { select: { name: true } } } }, votes: true },
  });
  res.status(201).json({ post: serializePost(post, req.user.id) });
});

neighborhoodRouter.post("/neighborhood/posts/:id/vote", authRequired, async (req, res) => {
  await ensureNeighborhoodTables();
  const option = String(req.body?.option || "").trim();
  const post = await prisma.neighborhoodPost.findUnique({ where: { id: req.params.id } });
  if (!post || post.kind !== "poll") return res.status(404).json({ message: "Poll not found." });
  const options = Array.isArray(post.pollOptions) ? post.pollOptions : [];
  if (!options.includes(option)) return res.status(400).json({ message: "That choice is not on the poll." });
  const peers = await peersOf(req.user.id);
  if (!filterFeed([post], req.user, peers).length) return res.status(404).json({ message: "Poll not found." });
  await prisma.neighborhoodVote.upsert({
    where: { postId_userId: { postId: post.id, userId: req.user.id } },
    update: { option },
    create: { postId: post.id, userId: req.user.id, option },
  });
  res.json({ ok: true });
});

neighborhoodRouter.get("/neighborhood/people", authRequired, async (req, res) => {
  await ensureNeighborhoodTables();
  const q = String(req.query.q || "").trim();
  const people = await prisma.user.findMany({
    where: {
      id: { not: req.user.id },
      active: true,
      pendingApproval: false,
      role: { in: ["resident", "admin"] },
      ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
    },
    select: { id: true, name: true, society: { select: { name: true } } },
    take: 20,
    orderBy: { name: "asc" },
  });
  const follows = await prisma.follow.findMany({
    where: {
      OR: [
        { requesterId: req.user.id, targetId: { in: people.map((p) => p.id) } },
        { targetId: req.user.id, requesterId: { in: people.map((p) => p.id) } },
      ],
    },
  });
  res.json({
    people: people.map((person) => {
      const row = follows.find((f) => f.requesterId === person.id || f.targetId === person.id);
      let follow = "none";
      if (row?.status === "accepted") follow = "accepted";
      else if (row?.requesterId === req.user.id) follow = "requested";
      else if (row) follow = "incoming";
      return { id: person.id, name: person.name, societyName: person.society?.name || null, follow, followId: row?.id || null };
    }),
  });
});

neighborhoodRouter.post("/neighborhood/follow/:userId", authRequired, async (req, res) => {
  await ensureNeighborhoodTables();
  const targetId = req.params.userId;
  if (targetId === req.user.id) return res.status(400).json({ message: "You cannot follow yourself." });
  const existing = await prisma.follow.findFirst({
    where: { OR: [{ requesterId: req.user.id, targetId }, { requesterId: targetId, targetId: req.user.id }] },
  });
  if (existing?.status === "accepted") return res.json({ follow: existing });
  if (existing?.requesterId === targetId && existing.status === "pending") {
    const follow = await prisma.follow.update({ where: { id: existing.id }, data: { status: "accepted" } });
    return res.json({ follow });
  }
  if (existing) return res.json({ follow: existing });
  const follow = await prisma.follow.create({ data: { requesterId: req.user.id, targetId, status: "pending" } });
  res.status(201).json({ follow });
});

neighborhoodRouter.post("/neighborhood/follow/:id/accept", authRequired, async (req, res) => {
  await ensureNeighborhoodTables();
  const row = await prisma.follow.findUnique({ where: { id: req.params.id } });
  if (!row || row.targetId !== req.user.id) return res.status(404).json({ message: "Request not found." });
  const follow = await prisma.follow.update({ where: { id: row.id }, data: { status: "accepted" } });
  res.json({ follow });
});

neighborhoodRouter.get("/neighborhood/requests", authRequired, async (req, res) => {
  await ensureNeighborhoodTables();
  const rows = await prisma.follow.findMany({
    where: { targetId: req.user.id, status: "pending" },
    include: { requester: { select: { id: true, name: true, society: { select: { name: true } } } } },
    orderBy: { createdAt: "desc" },
  });
  res.json({
    requests: rows.map((row) => ({
      id: row.id,
      userId: row.requester.id,
      name: row.requester.name,
      societyName: row.requester.society?.name || null,
    })),
  });
});

neighborhoodRouter.get("/neighborhood/messages/:userId", authRequired, async (req, res) => {
  await ensureNeighborhoodTables();
  const peers = await peersOf(req.user.id);
  if (!canMessage(req.user.id, req.params.userId, peers)) {
    return res.status(403).json({ message: "You can message after the follow is accepted." });
  }
  const messages = await prisma.neighborhoodMessage.findMany({
    where: {
      OR: [
        { fromId: req.user.id, toId: req.params.userId },
        { fromId: req.params.userId, toId: req.user.id },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: 100,
  });
  res.json({ messages });
});

neighborhoodRouter.post("/neighborhood/messages/:userId", authRequired, async (req, res) => {
  await ensureNeighborhoodTables();
  const peers = await peersOf(req.user.id);
  if (!canMessage(req.user.id, req.params.userId, peers)) {
    return res.status(403).json({ message: "You can message after the follow is accepted." });
  }
  const body = String(req.body?.body || "").trim();
  if (!body) return res.status(400).json({ message: "Write a message." });
  const message = await prisma.neighborhoodMessage.create({
    data: { fromId: req.user.id, toId: req.params.userId, body: body.slice(0, 1000) },
  });
  res.status(201).json({ message });
});
