import { Router } from "express";
import { prisma } from "../prisma.js";
import { authRequired, roleRequired } from "../auth.js";
import { enqueuePush } from "../queue.js";
import { uploadDocument } from "../storage.js";
import { parsePaging } from "../paging.js";

// Buy & Sell marketplace. Residents post items under a category. A listing is
// visible either only within the poster's society, or across ALL societies
// (poster's choice). Interested residents open the listing, read the details
// and message the owner (in-app + push), with an optional WhatsApp fallback.
export const marketplaceRouter = Router();

const CATEGORIES = [
  "furniture",
  "electronics",
  "vehicles",
  "home_decor",
  "kids",
  "food",
  "services",
  "others",
];

// The circular-economy listing types. "sale" is classic Buy & Sell; the rest
// turn the marketplace into community commerce.
const KINDS = ["sale", "borrow", "skill", "group_buy"];

function serializeListing(l, userId) {
  const joinCount = l._count?.joins ?? (Array.isArray(l.joins) ? l.joins.length : 0);
  const joinedByMe = Array.isArray(l.joins) ? l.joins.some((j) => j.userId === userId) : undefined;
  return {
    id: l.id,
    title: l.title,
    description: l.description,
    price: l.price ?? null,
    category: l.category,
    kind: l.kind || "sale",
    lendMode: l.lendMode || null,
    targetCount: l.targetCount ?? null,
    unitPrice: l.unitPrice ?? null,
    deadline: l.deadline || null,
    images: Array.isArray(l.images) ? l.images : [],
    location: l.location || l.society?.name || null,
    visibility: l.visibility,
    status: l.status,
    societyId: l.societyId,
    societyName: l.society?.name || null,
    authorId: l.authorId,
    authorName: l.author?.name || null,
    authorPhone: l.author?.phone || null,
    flatNo: l.author?.flat?.flatNo || null,
    isOwner: l.authorId === userId,
    messageCount: l._count?.messages ?? 0,
    joinCount,
    joinedByMe,
    createdAt: l.createdAt,
  };
}

// Browse listings. Shows active listings that are either global ("all") or
// scoped to the caller's own society. `mine=1` returns the caller's listings
// (any status); `category` filters.
marketplaceRouter.get("/listings", authRequired, async (req, res) => {
  const mine = req.query.mine === "1" || req.query.mine === "true";
  const category = CATEGORIES.includes(req.query.category) ? req.query.category : null;
  const kind = KINDS.includes(req.query.kind) ? req.query.kind : null;

  let where;
  if (mine) {
    where = { authorId: req.user.id };
  } else {
    where = {
      status: "active",
      OR: [{ visibility: "all" }, { visibility: "society", societyId: req.user.societyId || "__none__" }],
    };
  }
  if (category) where.category = category;
  if (kind) where.kind = kind;

  const paging = parsePaging(req, { def: 200, max: 200 });
  const listings = await prisma.listing.findMany({
    where,
    include: {
      author: { include: { flat: true } },
      society: true,
      joins: { where: { userId: req.user.id }, select: { userId: true } },
      _count: { select: { messages: true, joins: true } },
    },
    orderBy: { createdAt: "desc" },
    take: paging.take,
    skip: paging.skip,
  });
  res.json({
    listings: listings.map((l) => serializeListing(l, req.user.id)),
    hasMore: listings.length >= paging.limit,
  });
});

// Category counts for the browse screen tiles.
marketplaceRouter.get("/listings/categories", authRequired, async (req, res) => {
  const rows = await prisma.listing.groupBy({
    by: ["category"],
    where: {
      status: "active",
      OR: [{ visibility: "all" }, { visibility: "society", societyId: req.user.societyId || "__none__" }],
    },
    _count: { _all: true },
  });
  const counts = {};
  for (const r of rows) counts[r.category] = r._count._all;
  res.json({ counts });
});

marketplaceRouter.get("/listings/:id", authRequired, async (req, res) => {
  const listing = await prisma.listing.findUnique({
    where: { id: req.params.id },
    include: {
      author: { include: { flat: true } },
      society: true,
      joins: { where: { userId: req.user.id }, select: { userId: true } },
      _count: { select: { messages: true, joins: true } },
    },
  });
  if (!listing) return res.status(404).json({ message: "Listing not found" });
  res.json({ listing: serializeListing(listing, req.user.id) });
});

// Post an item. Residents & admins can list.
marketplaceRouter.post("/listings", authRequired, roleRequired("resident", "admin"), async (req, res) => {
  const { title, description, price, category, location, visibility, images, kind, lendMode, targetCount, unitPrice, deadline } = req.body || {};
  if (!title || !String(title).trim() || !description || !String(description).trim()) {
    return res.status(400).json({ message: "Title and description are required" });
  }
  const cat = CATEGORIES.includes(category) ? category : "others";
  const vis = visibility === "society" ? "society" : "all";
  const knd = KINDS.includes(kind) ? kind : "sale";
  const lm = knd === "borrow" && ["lend", "borrow", "free"].includes(lendMode) ? lendMode : null;

  // Upload base64 images and keep their public URLs. Uploads run in PARALLEL so
  // a multi-photo post isn't slowed by doing them one-at-a-time (important when
  // many residents post at once). Oversized images are skipped to bound memory
  // and DB size. If object storage isn't configured (or an upload fails), we
  // fall back to embedding the data URL so the photo is still visible.
  const MAX_IMG_CHARS = 4_000_000; // ~3 MB decoded per image
  const incoming = Array.isArray(images) ? images.slice(0, 10) : [];
  const stamp = Date.now();
  const uploaded = await Promise.all(
    incoming.map(async (img, i) => {
      if (typeof img !== "string" || !img) return null;
      if (img.startsWith("http")) return img;
      if (img.length > MAX_IMG_CHARS) return null;
      const url = await uploadDocument(img, `listing-${stamp}-${i}`, "listings");
      return url || (img.startsWith("data:") ? img : null);
    })
  );
  const finalUrls = uploaded.filter(Boolean);

  const listing = await prisma.listing.create({
    data: {
      societyId: req.user.societyId,
      authorId: req.user.id,
      title: String(title).trim(),
      description: String(description).trim(),
      price: price != null && price !== "" ? Number(price) : null,
      category: cat,
      kind: knd,
      lendMode: lm,
      targetCount: knd === "group_buy" && targetCount ? Math.max(2, parseInt(targetCount, 10) || 0) : null,
      unitPrice: knd === "group_buy" && unitPrice != null && unitPrice !== "" ? Number(unitPrice) : null,
      deadline: knd === "group_buy" && deadline ? new Date(deadline) : null,
      visibility: vis,
      location: location ? String(location).trim() : null,
      images: finalUrls,
      status: "active",
    },
    include: { author: { include: { flat: true } }, society: true, _count: { select: { messages: true, joins: true } } },
  });
  res.status(201).json({ listing: serializeListing(listing, req.user.id) });
});

// Owner updates status (mark sold / relist) or edits fields.
marketplaceRouter.patch("/listings/:id", authRequired, async (req, res) => {
  const listing = await prisma.listing.findUnique({ where: { id: req.params.id } });
  if (!listing) return res.status(404).json({ message: "Listing not found" });
  if (listing.authorId !== req.user.id) return res.status(403).json({ message: "Not your listing" });
  const { title, description, price, category, location, visibility, status } = req.body || {};
  const data = {};
  if (title != null) data.title = String(title).trim();
  if (description != null) data.description = String(description).trim();
  if (price !== undefined) data.price = price === "" || price == null ? null : Number(price);
  if (category && CATEGORIES.includes(category)) data.category = category;
  if (location !== undefined) data.location = location ? String(location).trim() : null;
  if (visibility) data.visibility = visibility === "society" ? "society" : "all";
  if (status && ["active", "sold", "removed", "fulfilled"].includes(status)) data.status = status;
  const updated = await prisma.listing.update({
    where: { id: listing.id },
    data,
    include: { author: { include: { flat: true } }, society: true, _count: { select: { messages: true, joins: true } } },
  });
  res.json({ listing: serializeListing(updated, req.user.id) });
});

// ---- Circular economy: join / leave a group-buy (or express interest) --------
// A resident joins a group-buy. When the target participant count is reached we
// notify the author so they can place the bulk order. Idempotent per user.
marketplaceRouter.post("/listings/:id/join", authRequired, async (req, res) => {
  const listing = await prisma.listing.findUnique({ where: { id: req.params.id } });
  if (!listing) return res.status(404).json({ message: "Listing not found" });
  if (listing.status !== "active") return res.status(400).json({ message: "This listing is closed" });
  if (listing.authorId === req.user.id) return res.status(400).json({ message: "You are the organiser" });

  const me = await prisma.user.findUnique({ where: { id: req.user.id }, include: { flat: true } });
  const qty = Math.max(1, parseInt(req.body?.qty, 10) || 1);
  await prisma.listingJoin.upsert({
    where: { listingId_userId: { listingId: listing.id, userId: req.user.id } },
    update: { qty },
    create: { listingId: listing.id, userId: req.user.id, name: me?.name || null, flatNo: me?.flat?.flatNo || null, qty },
  });

  const count = await prisma.listingJoin.count({ where: { listingId: listing.id } });
  // Reached the target? Tell the organiser it's ready to order.
  if (listing.kind === "group_buy" && listing.targetCount && count >= listing.targetCount) {
    const owner = await prisma.user.findUnique({ where: { id: listing.authorId }, select: { expoPushToken: true, notifyEnabled: true } });
    if (owner?.expoPushToken && owner.notifyEnabled) {
      enqueuePush(owner.expoPushToken, `Group buy ready: ${listing.title}`, `${count} neighbours have joined — you can place the order now.`, {
        type: "listing",
        listingId: listing.id,
      });
    }
  }
  res.json({ ok: true, joinCount: count });
});

marketplaceRouter.delete("/listings/:id/join", authRequired, async (req, res) => {
  await prisma.listingJoin.deleteMany({ where: { listingId: req.params.id, userId: req.user.id } });
  const count = await prisma.listingJoin.count({ where: { listingId: req.params.id } });
  res.json({ ok: true, joinCount: count });
});

// Organiser sees who's in (name, flat, qty) so they can coordinate the order.
marketplaceRouter.get("/listings/:id/participants", authRequired, async (req, res) => {
  const listing = await prisma.listing.findUnique({ where: { id: req.params.id } });
  if (!listing) return res.status(404).json({ message: "Listing not found" });
  if (listing.authorId !== req.user.id) return res.status(403).json({ message: "Not your listing" });
  const joins = await prisma.listingJoin.findMany({
    where: { listingId: listing.id },
    include: { user: true },
    orderBy: { createdAt: "asc" },
    take: 500,
  });
  res.json({
    participants: joins.map((j) => ({
      id: j.id,
      name: j.name || j.user?.name || "Resident",
      phone: j.user?.phone || null,
      flatNo: j.flatNo || null,
      qty: j.qty,
      createdAt: j.createdAt,
    })),
  });
});

// Delete (owner, or an admin of the listing's own society).
marketplaceRouter.delete("/listings/:id", authRequired, async (req, res) => {
  const listing = await prisma.listing.findUnique({ where: { id: req.params.id } });
  if (!listing) return res.status(404).json({ message: "Listing not found" });
  const isOwnSocietyAdmin = req.user.role === "admin" && listing.societyId === req.user.societyId;
  if (listing.authorId !== req.user.id && !isOwnSocietyAdmin) {
    return res.status(403).json({ message: "Not allowed" });
  }
  await prisma.listing.delete({ where: { id: listing.id } });
  res.json({ ok: true });
});

// ---- Superadmin moderation: view & moderate ALL listings across societies ----
// The GateMate owner can see every post (any society, any status) and either
// disable it (hide from residents) or delete it outright if it's inappropriate.
marketplaceRouter.get("/moderation/listings", authRequired, roleRequired("superadmin"), async (req, res) => {
  const q = (req.query.q || "").toString().trim().toLowerCase();
  const status = ["active", "sold", "removed"].includes(req.query.status) ? req.query.status : null;
  const where = status ? { status } : {};
  const listings = await prisma.listing.findMany({
    where,
    include: { author: { include: { flat: true } }, society: true, _count: { select: { messages: true } } },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  let out = listings.map((l) => serializeListing(l, req.user.id));
  if (q) {
    out = out.filter((l) =>
      [l.title, l.description, l.authorName, l.societyName, l.category].some((f) =>
        (f || "").toString().toLowerCase().includes(q)
      )
    );
  }
  res.json({ listings: out });
});

// Disable (status="removed") or re-enable (status="active") a post.
marketplaceRouter.patch("/moderation/listings/:id", authRequired, roleRequired("superadmin"), async (req, res) => {
  const { status } = req.body || {};
  if (!["active", "removed"].includes(status)) return res.status(400).json({ message: "Invalid status" });
  const listing = await prisma.listing.findUnique({ where: { id: req.params.id } });
  if (!listing) return res.status(404).json({ message: "Listing not found" });
  const updated = await prisma.listing.update({
    where: { id: listing.id },
    data: { status },
    include: { author: { include: { flat: true } }, society: true, _count: { select: { messages: true } } },
  });
  res.json({ listing: serializeListing(updated, req.user.id) });
});

// Permanently delete a post (any society).
marketplaceRouter.delete("/moderation/listings/:id", authRequired, roleRequired("superadmin"), async (req, res) => {
  const listing = await prisma.listing.findUnique({ where: { id: req.params.id } });
  if (!listing) return res.status(404).json({ message: "Listing not found" });
  await prisma.listing.delete({ where: { id: listing.id } });
  res.json({ ok: true });
});

// A buyer messages the owner. Stored + pushed to the owner.
marketplaceRouter.post("/listings/:id/messages", authRequired, async (req, res) => {
  const { body } = req.body || {};
  if (!body || !String(body).trim()) return res.status(400).json({ message: "Message cannot be empty" });
  const listing = await prisma.listing.findUnique({ where: { id: req.params.id }, include: { author: true } });
  if (!listing) return res.status(404).json({ message: "Listing not found" });
  if (listing.authorId === req.user.id) return res.status(400).json({ message: "This is your own listing" });

  const msg = await prisma.listingMessage.create({
    data: {
      listingId: listing.id,
      fromUserId: req.user.id,
      fromName: req.user.name || null,
      body: String(body).trim(),
    },
  });

  const owner = await prisma.user.findUnique({
    where: { id: listing.authorId },
    select: { expoPushToken: true, notifyEnabled: true },
  });
  if (owner?.expoPushToken && owner.notifyEnabled) {
    enqueuePush(owner.expoPushToken, `Enquiry: ${listing.title}`, `${req.user.name || "Someone"}: ${msg.body}`, {
      type: "listing",
      listingId: listing.id,
    });
  }
  res.status(201).json({ ok: true });
});

// Owner reads enquiries on their listing (with each sender's name + phone so
// they can reply/call).
marketplaceRouter.get("/listings/:id/messages", authRequired, async (req, res) => {
  const listing = await prisma.listing.findUnique({ where: { id: req.params.id } });
  if (!listing) return res.status(404).json({ message: "Listing not found" });
  if (listing.authorId !== req.user.id) return res.status(403).json({ message: "Not your listing" });
  const messages = await prisma.listingMessage.findMany({
    where: { listingId: listing.id },
    include: { from: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  res.json({
    messages: messages.map((m) => ({
      id: m.id,
      body: m.body,
      fromName: m.fromName || m.from?.name || "Resident",
      fromPhone: m.from?.phone || null,
      createdAt: m.createdAt,
    })),
  });
});
