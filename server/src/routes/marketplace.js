import { Router } from "express";
import { prisma } from "../prisma.js";
import { authRequired, roleRequired } from "../auth.js";
import { sendPush } from "../push.js";
import { uploadDocument } from "../storage.js";

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

function serializeListing(l, userId) {
  return {
    id: l.id,
    title: l.title,
    description: l.description,
    price: l.price ?? null,
    category: l.category,
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
    createdAt: l.createdAt,
  };
}

// Browse listings. Shows active listings that are either global ("all") or
// scoped to the caller's own society. `mine=1` returns the caller's listings
// (any status); `category` filters.
marketplaceRouter.get("/listings", authRequired, async (req, res) => {
  const mine = req.query.mine === "1" || req.query.mine === "true";
  const category = CATEGORIES.includes(req.query.category) ? req.query.category : null;

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

  const listings = await prisma.listing.findMany({
    where,
    include: {
      author: { include: { flat: true } },
      society: true,
      _count: { select: { messages: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  res.json({ listings: listings.map((l) => serializeListing(l, req.user.id)) });
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
      _count: { select: { messages: true } },
    },
  });
  if (!listing) return res.status(404).json({ message: "Listing not found" });
  res.json({ listing: serializeListing(listing, req.user.id) });
});

// Post an item. Residents & admins can list.
marketplaceRouter.post("/listings", authRequired, roleRequired("resident", "admin"), async (req, res) => {
  const { title, description, price, category, location, visibility, images } = req.body || {};
  if (!title || !String(title).trim() || !description || !String(description).trim()) {
    return res.status(400).json({ message: "Title and description are required" });
  }
  const cat = CATEGORIES.includes(category) ? category : "others";
  const vis = visibility === "society" ? "society" : "all";

  // Upload any base64 images (max 4) and keep their public URLs.
  const urls = [];
  const incoming = Array.isArray(images) ? images.slice(0, 4) : [];
  for (let i = 0; i < incoming.length; i++) {
    if (typeof incoming[i] === "string" && incoming[i].startsWith("http")) {
      urls.push(incoming[i]);
      continue;
    }
    const url = await uploadDocument(incoming[i], `listing-${Date.now()}-${i}`, "listings");
    if (url) urls.push(url);
  }

  const listing = await prisma.listing.create({
    data: {
      societyId: req.user.societyId,
      authorId: req.user.id,
      title: String(title).trim(),
      description: String(description).trim(),
      price: price != null && price !== "" ? Number(price) : null,
      category: cat,
      visibility: vis,
      location: location ? String(location).trim() : null,
      images: urls,
      status: "active",
    },
    include: { author: { include: { flat: true } }, society: true, _count: { select: { messages: true } } },
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
  if (status && ["active", "sold", "removed"].includes(status)) data.status = status;
  const updated = await prisma.listing.update({
    where: { id: listing.id },
    data,
    include: { author: { include: { flat: true } }, society: true, _count: { select: { messages: true } } },
  });
  res.json({ listing: serializeListing(updated, req.user.id) });
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
    sendPush(owner.expoPushToken, `Enquiry: ${listing.title}`, `${req.user.name || "Someone"}: ${msg.body}`, {
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
