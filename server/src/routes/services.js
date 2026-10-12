import { Router } from "express";
import { prisma } from "../prisma.js";
import { authRequired, roleRequired } from "../auth.js";
import { enqueuePush } from "../queue.js";

// Daily-help & helpline directory (maid, electrician, doctor, ambulance, MSEB…).
// Three layers via ServiceContact.scope:
//   platform : GATEZO-curated, shown in every society (managed by superadmin).
//   society  : added by a society admin, shown to that society's residents.
//   personal : added by a resident; private to them unless "suggested" to the
//              society (status = "suggested") and then approved by an admin.
export const servicesRouter = Router();

const sid = (req) => req.user.societyId || "__none__";

export const SERVICE_CATEGORIES = [
  { id: "helpers", label: "Daily help" },
  { id: "trades", label: "Home services" },
  { id: "medical", label: "Medical" },
  { id: "utilities", label: "Utilities & civic" },
  { id: "emergency", label: "Emergency" },
  { id: "lifestyle", label: "Lifestyle" },
];
const CAT_IDS = SERVICE_CATEGORIES.map((c) => c.id);

function serialize(c, me) {
  return {
    id: c.id,
    scope: c.scope,
    category: c.category,
    subtype: c.subtype || null,
    name: c.name,
    phone: c.phone || null,
    altPhone: c.altPhone || null,
    note: c.note || null,
    featured: !!c.featured,
    status: c.status,
    suggestedByName: c.suggestedByName || null,
    mine: !!(me && c.ownerId && c.ownerId === me),
    createdAt: c.createdAt,
  };
}

async function societyAdminIds(societyId) {
  if (!societyId) return [];
  const admins = await prisma.user.findMany({
    where: { societyId, role: "admin", active: true },
    select: { id: true },
  });
  return admins.map((a) => a.id);
}

async function notifyUsers(userIds, title, body, data = {}) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return;
  const users = await prisma.user.findMany({
    where: { id: { in: ids }, notifyEnabled: true, expoPushToken: { not: null } },
    select: { expoPushToken: true },
  });
  users.forEach((u) => enqueuePush(u.expoPushToken, title, body, data));
}

/* --------------------------------- List ---------------------------------- */
// Returns the visible catalog for the caller plus (for admins) the pending
// resident suggestions to approve.
servicesRouter.get("/services", authRequired, async (req, res) => {
  const me = req.user.id;
  const role = req.user.role;
  const societyId = req.user.societyId || null;

  let where;
  if (role === "superadmin") {
    // Superadmin manages the platform-curated layer.
    where = { scope: "platform" };
  } else {
    where = {
      OR: [
        { scope: "platform", status: "published" },
        { scope: "society", societyId, status: "published" },
        { ownerId: me }, // personal (and my own suggestions, any status)
      ],
    };
  }

  const rows = await prisma.serviceContact.findMany({
    where,
    orderBy: [{ featured: "desc" }, { name: "asc" }],
    take: 2000,
  });

  const contacts = rows
    .filter((c) => !(c.scope === "society" && c.status === "suggested"))
    .map((c) => serialize(c, me));

  // Admins get the queue of resident suggestions for their society.
  let suggestions = [];
  if (role === "admin") {
    const pend = await prisma.serviceContact.findMany({
      where: { societyId, scope: "society", status: "suggested" },
      orderBy: [{ createdAt: "desc" }],
      take: 200,
    });
    suggestions = pend.map((c) => serialize(c, me));
  }

  res.json({
    categories: SERVICE_CATEGORIES,
    contacts,
    suggestions,
    canManageSociety: role === "admin",
    canManagePlatform: role === "superadmin",
  });
});

/* -------------------------------- Create ---------------------------------- */
servicesRouter.post("/services", authRequired, async (req, res) => {
  const role = req.user.role;
  const b = req.body || {};
  const category = CAT_IDS.includes(b.category) ? b.category : null;
  const name = String(b.name || "").trim();
  const phone = String(b.phone || "").trim() || null;
  const note = String(b.note || "").trim() || null;

  if (!category) return res.status(400).json({ message: "Pick a valid category" });
  if (!name) return res.status(400).json({ message: "Name is required" });
  if (!phone && !note) return res.status(400).json({ message: "Add a phone number or a note" });

  const base = {
    category,
    subtype: String(b.subtype || "").trim() || null,
    name,
    phone,
    altPhone: String(b.altPhone || "").trim() || null,
    note,
  };

  let data;
  if (role === "superadmin") {
    data = { ...base, scope: "platform", societyId: null, status: "published", featured: !!b.featured };
  } else if (role === "admin") {
    // Admin can add a society entry (default) or a personal one for themselves.
    if (b.scope === "personal") {
      data = { ...base, scope: "personal", societyId: req.user.societyId || null, ownerId: req.user.id, status: "published" };
    } else {
      data = { ...base, scope: "society", societyId: req.user.societyId || null, status: "published", featured: !!b.featured };
    }
  } else {
    // resident / guard
    if (b.suggest) {
      data = {
        ...base,
        scope: "society",
        societyId: req.user.societyId || null,
        ownerId: req.user.id,
        status: "suggested",
        suggestedById: req.user.id,
        suggestedByName: req.user.name || null,
      };
    } else {
      data = { ...base, scope: "personal", societyId: req.user.societyId || null, ownerId: req.user.id, status: "published" };
    }
  }

  const created = await prisma.serviceContact.create({ data });

  // Ping admins when a resident suggests a contact for the society.
  if (data.status === "suggested") {
    const adminIds = await societyAdminIds(req.user.societyId);
    await notifyUsers(adminIds, "New service suggestion", `${req.user.name || "A resident"} suggested “${name}”`, {
      type: "service_suggestion",
      id: created.id,
    });
  }

  res.status(201).json({ contact: serialize(created, req.user.id) });
});

/* -------------------------------- Update ---------------------------------- */
// Owners edit their personal entries; admins manage their society layer
// (edit / approve suggestions / feature / hide); superadmin manages platform.
servicesRouter.patch("/services/:id", authRequired, async (req, res) => {
  const c = await prisma.serviceContact.findUnique({ where: { id: req.params.id } });
  if (!c) return res.status(404).json({ message: "Not found" });
  const role = req.user.role;

  const canManage =
    (role === "superadmin" && c.scope === "platform") ||
    (role === "admin" && c.scope === "society" && c.societyId === req.user.societyId) ||
    (c.ownerId && c.ownerId === req.user.id);
  if (!canManage) return res.status(403).json({ message: "Not allowed" });

  const b = req.body || {};
  const data = {};
  if (typeof b.name === "string" && b.name.trim()) data.name = b.name.trim();
  if ("phone" in b) data.phone = String(b.phone || "").trim() || null;
  if ("altPhone" in b) data.altPhone = String(b.altPhone || "").trim() || null;
  if ("note" in b) data.note = String(b.note || "").trim() || null;
  if ("subtype" in b) data.subtype = String(b.subtype || "").trim() || null;
  if (CAT_IDS.includes(b.category)) data.category = b.category;

  // Feature toggle + status changes are for managers only (admin/superadmin).
  const isManager =
    (role === "admin" && c.scope === "society" && c.societyId === req.user.societyId) ||
    (role === "superadmin" && c.scope === "platform");
  if (isManager) {
    if (typeof b.featured === "boolean") data.featured = b.featured;
    if (["published", "hidden"].includes(b.status)) {
      data.status = b.status;
      // Approving a resident suggestion promotes it to a published society entry.
      if (b.status === "published" && c.status === "suggested") data.ownerId = null;
    }
  }

  if (Object.keys(data).length === 0) return res.status(400).json({ message: "Nothing to update" });

  const updated = await prisma.serviceContact.update({ where: { id: c.id }, data });

  // Tell the resident their suggestion went live.
  if (data.status === "published" && c.status === "suggested" && c.suggestedById) {
    await notifyUsers([c.suggestedById], "Suggestion approved", `“${updated.name}” is now in your society directory.`, {
      type: "service",
      id: updated.id,
    });
  }

  res.json({ contact: serialize(updated, req.user.id) });
});

/* -------------------------------- Delete ---------------------------------- */
servicesRouter.delete("/services/:id", authRequired, async (req, res) => {
  const c = await prisma.serviceContact.findUnique({ where: { id: req.params.id } });
  if (!c) return res.status(404).json({ message: "Not found" });
  const role = req.user.role;
  const canDelete =
    (role === "superadmin" && c.scope === "platform") ||
    (role === "admin" && c.scope === "society" && c.societyId === req.user.societyId) ||
    (c.ownerId && c.ownerId === req.user.id);
  if (!canDelete) return res.status(403).json({ message: "Not allowed" });
  await prisma.serviceContact.delete({ where: { id: c.id } });
  res.json({ ok: true });
});

/* --------------------- Default platform helplines (seed) ------------------ */
// Idempotent: creates the national helplines once so the catalog is never empty.
const DEFAULT_HELPLINES = [
  { category: "emergency", subtype: "All-in-one emergency", name: "Emergency (Police/Fire/Medical)", phone: "112" },
  { category: "emergency", subtype: "Police", name: "Police", phone: "100" },
  { category: "emergency", subtype: "Fire", name: "Fire brigade", phone: "101" },
  { category: "medical", subtype: "Ambulance", name: "Ambulance", phone: "108" },
  { category: "emergency", subtype: "Women", name: "Women's helpline", phone: "1091" },
  { category: "emergency", subtype: "Child", name: "Child helpline", phone: "1098" },
  { category: "emergency", subtype: "Senior citizen", name: "Senior citizen helpline", phone: "14567" },
  { category: "emergency", subtype: "Cyber crime", name: "Cyber crime helpline", phone: "1930" },
  { category: "emergency", subtype: "Disaster", name: "Disaster management", phone: "1077" },
  { category: "utilities", subtype: "Electricity (MSEDCL)", name: "MSEB / MSEDCL power outage", phone: "1912" },
  { category: "utilities", subtype: "Gas leak", name: "LPG gas leak helpline", phone: "1906" },
  { category: "utilities", subtype: "Railway", name: "Railway enquiry", phone: "139" },
  { category: "medical", subtype: "COVID / health", name: "National health helpline", phone: "1075" },
];

export async function ensureDefaultHelplines() {
  try {
    const existing = await prisma.serviceContact.count({ where: { scope: "platform" } });
    if (existing > 0) return;
    await prisma.serviceContact.createMany({
      data: DEFAULT_HELPLINES.map((h) => ({ ...h, scope: "platform", status: "published", featured: h.phone === "112" })),
    });
    console.log(`[services] seeded ${DEFAULT_HELPLINES.length} default helplines`);
  } catch (e) {
    console.warn("[services] could not seed default helplines:", e.message);
  }
}
