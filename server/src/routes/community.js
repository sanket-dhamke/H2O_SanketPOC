import { Router } from "express";
import { prisma } from "../prisma.js";
import { authRequired, roleRequired } from "../auth.js";
import { serializeAnnouncement, serializePost } from "../serializers.js";

// Society community features: admin announcements + a resident posts board.
// Everything is scoped to the caller's society.
export const communityRouter = Router();

const sid = (req) => req.user.societyId || "__none__";

/* --------------------------- Announcements ------------------------------- */
// Any authenticated member of the society can read announcements.
communityRouter.get("/announcements", authRequired, async (req, res) => {
  const items = await prisma.announcement.findMany({
    where: { societyId: sid(req) },
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    take: 100,
  });
  res.json({ announcements: items.map(serializeAnnouncement) });
});

// Only admins post announcements.
communityRouter.post("/announcements", authRequired, roleRequired("admin"), async (req, res) => {
  const { title, body, pinned } = req.body || {};
  if (!title || !String(title).trim() || !body || !String(body).trim()) {
    return res.status(400).json({ message: "Title and body are required" });
  }
  const item = await prisma.announcement.create({
    data: {
      societyId: req.user.societyId,
      title: String(title).trim(),
      body: String(body).trim(),
      pinned: Boolean(pinned),
      createdBy: req.user.id,
      authorName: req.user.name || null,
    },
  });
  res.status(201).json({ announcement: serializeAnnouncement(item) });
});

communityRouter.delete("/announcements/:id", authRequired, roleRequired("admin"), async (req, res) => {
  const item = await prisma.announcement.findFirst({ where: { id: req.params.id, societyId: sid(req) } });
  if (!item) return res.status(404).json({ message: "Announcement not found" });
  await prisma.announcement.delete({ where: { id: item.id } });
  res.json({ ok: true });
});

/* ------------------------------- Posts ----------------------------------- */
const POST_CATEGORIES = ["general", "sale", "query", "lost_found", "recommend"];

communityRouter.get("/posts", authRequired, async (req, res) => {
  const posts = await prisma.post.findMany({
    where: { societyId: sid(req) },
    include: { author: { include: { flat: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  res.json({ posts: posts.map(serializePost) });
});

// Residents (and admins) can post to the community board.
communityRouter.post("/posts", authRequired, roleRequired("resident", "admin"), async (req, res) => {
  const { title, body, category, price } = req.body || {};
  if (!title || !String(title).trim() || !body || !String(body).trim()) {
    return res.status(400).json({ message: "Title and body are required" });
  }
  const cat = POST_CATEGORIES.includes(category) ? category : "general";
  const post = await prisma.post.create({
    data: {
      societyId: req.user.societyId,
      authorId: req.user.id,
      title: String(title).trim(),
      body: String(body).trim(),
      category: cat,
      price: cat === "sale" && price != null && price !== "" ? Number(price) : null,
    },
    include: { author: { include: { flat: true } } },
  });
  res.status(201).json({ post: serializePost(post) });
});

// Author can delete their own post; admins can delete any post in their society.
communityRouter.delete("/posts/:id", authRequired, async (req, res) => {
  const post = await prisma.post.findFirst({ where: { id: req.params.id, societyId: sid(req) } });
  if (!post) return res.status(404).json({ message: "Post not found" });
  if (req.user.role !== "admin" && post.authorId !== req.user.id) {
    return res.status(403).json({ message: "You can only delete your own post" });
  }
  await prisma.post.delete({ where: { id: post.id } });
  res.json({ ok: true });
});
