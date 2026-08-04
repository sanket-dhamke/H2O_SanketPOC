import { Router } from "express";
import { prisma } from "../prisma.js";
import { authRequired, roleRequired } from "../auth.js";
import { serializeTicket, serializeTicketComment } from "../serializers.js";
import { sendPush } from "../push.js";

// Society helpdesk: residents raise tickets (complaints / maintenance requests),
// the admin (manager) gets notified, replies in a comment thread and marks the
// ticket resolved. Also exposes the society contact directory (admins + guards)
// so residents can call the security guard / office directly.
export const helpdeskRouter = Router();

const sid = (req) => req.user.societyId || "__none__";

const CATEGORIES = ["plumbing", "electrical", "housekeeping", "security", "billing", "general", "other"];
const PRIORITIES = ["low", "normal", "high"];
const STATUSES = ["open", "in_progress", "resolved"];

// Push helper: notify a set of users (skips those without a token / opted out).
async function notifyUsers(userIds, title, body, data = {}) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return;
  const users = await prisma.user.findMany({
    where: { id: { in: ids }, notifyEnabled: true, expoPushToken: { not: null } },
    select: { expoPushToken: true },
  });
  await Promise.all(users.map((u) => sendPush(u.expoPushToken, title, body, data)));
}

async function societyAdminIds(societyId) {
  const admins = await prisma.user.findMany({
    where: { societyId, role: "admin", active: true },
    select: { id: true },
  });
  return admins.map((a) => a.id);
}

/* ---------------------------- Contact directory -------------------------- */
// Society admins (office) + guards (gate/security) with their phone numbers so
// residents can call them directly from the helpdesk screen.
helpdeskRouter.get("/helpdesk/contacts", authRequired, async (req, res) => {
  const staff = await prisma.user.findMany({
    where: { societyId: sid(req), role: { in: ["admin", "guard"] }, active: true },
    select: { id: true, name: true, role: true, phone: true },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });
  res.json({
    contacts: staff.map((s) => ({ id: s.id, name: s.name, role: s.role, phone: s.phone || null })),
  });
});

/* --------------------------- Resident directory -------------------------- */
// Members of the society with their flat + phone, so residents can reach a
// neighbour. Residents who opted out of sharing their phone are still listed
// (name + flat) but without a number.
helpdeskRouter.get("/directory/residents", authRequired, async (req, res) => {
  const residents = await prisma.user.findMany({
    where: { societyId: sid(req), role: "resident", active: true },
    include: { flat: true },
    orderBy: [{ name: "asc" }],
    take: 1000,
  });
  res.json({
    residents: residents.map((u) => ({
      id: u.id,
      name: u.name,
      flatNo: u.flat?.flatNo || null,
      block: u.flat?.block || null,
      phone: u.sharePhone === false ? null : u.phone || null,
      isSelf: u.id === req.user.id,
    })),
  });
});

/* -------------------------------- Tickets -------------------------------- */
// Residents see their own tickets; admins see every ticket in their society.
helpdeskRouter.get("/helpdesk/tickets", authRequired, async (req, res) => {
  const where = { societyId: sid(req) };
  if (req.user.role === "resident") where.authorId = req.user.id;
  if (typeof req.query.status === "string" && STATUSES.includes(req.query.status)) {
    where.status = req.query.status;
  }
  const tickets = await prisma.ticket.findMany({
    where,
    include: { author: { include: { flat: true } }, _count: { select: { comments: true } } },
    orderBy: [{ createdAt: "desc" }],
    take: 200,
  });
  res.json({ tickets: tickets.map((t) => serializeTicket(t)) });
});

// Raise a ticket (residents, and admins on behalf of the office). Notifies admins.
helpdeskRouter.post("/helpdesk/tickets", authRequired, roleRequired("resident", "admin"), async (req, res) => {
  const { subject, description, category, priority } = req.body || {};
  if (!subject || !String(subject).trim() || !description || !String(description).trim()) {
    return res.status(400).json({ message: "Subject and description are required" });
  }
  const cat = CATEGORIES.includes(category) ? category : "general";
  const pri = PRIORITIES.includes(priority) ? priority : "normal";
  const me = await prisma.user.findUnique({ where: { id: req.user.id }, select: { flatId: true } });
  const ticket = await prisma.ticket.create({
    data: {
      societyId: req.user.societyId,
      authorId: req.user.id,
      flatId: me?.flatId || null,
      subject: String(subject).trim(),
      description: String(description).trim(),
      category: cat,
      priority: pri,
      status: "open",
    },
    include: { author: { include: { flat: true } }, _count: { select: { comments: true } } },
  });

  // Notify society admins (unless the admin raised it themselves).
  const adminIds = (await societyAdminIds(req.user.societyId)).filter((id) => id !== req.user.id);
  await notifyUsers(
    adminIds,
    "New helpdesk ticket",
    `${req.user.name || "A resident"}: ${ticket.subject}`,
    { type: "ticket", ticketId: ticket.id }
  );

  res.status(201).json({ ticket: serializeTicket(ticket) });
});

// Full ticket with its comment thread. Author or any society admin.
helpdeskRouter.get("/helpdesk/tickets/:id", authRequired, async (req, res) => {
  const ticket = await prisma.ticket.findFirst({
    where: { id: req.params.id, societyId: sid(req) },
    include: {
      author: { include: { flat: true } },
      comments: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!ticket) return res.status(404).json({ message: "Ticket not found" });
  if (req.user.role === "resident" && ticket.authorId !== req.user.id) {
    return res.status(403).json({ message: "Not your ticket" });
  }
  res.json({ ticket: serializeTicket(ticket, { includeComments: true }) });
});

// Add a comment to the thread. Author or a society admin. Notifies the other side.
helpdeskRouter.post("/helpdesk/tickets/:id/comments", authRequired, async (req, res) => {
  const { body } = req.body || {};
  if (!body || !String(body).trim()) return res.status(400).json({ message: "Comment cannot be empty" });
  const ticket = await prisma.ticket.findFirst({ where: { id: req.params.id, societyId: sid(req) } });
  if (!ticket) return res.status(404).json({ message: "Ticket not found" });
  const isAdmin = req.user.role === "admin";
  if (!isAdmin && ticket.authorId !== req.user.id) {
    return res.status(403).json({ message: "Not your ticket" });
  }
  const comment = await prisma.ticketComment.create({
    data: {
      ticketId: ticket.id,
      authorId: req.user.id,
      authorName: req.user.name || null,
      authorRole: req.user.role,
      body: String(body).trim(),
    },
  });
  await prisma.ticket.update({ where: { id: ticket.id }, data: { updatedAt: new Date() } });

  // Notify the counterpart: if an admin replied, tell the resident; else tell admins.
  if (isAdmin) {
    await notifyUsers([ticket.authorId], "Update on your ticket", `${req.user.name || "Office"}: ${comment.body}`, {
      type: "ticket",
      ticketId: ticket.id,
    });
  } else {
    const adminIds = (await societyAdminIds(req.user.societyId)).filter((id) => id !== req.user.id);
    await notifyUsers(adminIds, `Reply on ticket: ${ticket.subject}`, comment.body, {
      type: "ticket",
      ticketId: ticket.id,
    });
  }
  res.status(201).json({ comment: serializeTicketComment(comment) });
});

// Admin updates status / resolves the ticket (optionally with a closing note).
helpdeskRouter.patch("/helpdesk/tickets/:id", authRequired, roleRequired("admin"), async (req, res) => {
  const ticket = await prisma.ticket.findFirst({ where: { id: req.params.id, societyId: sid(req) } });
  if (!ticket) return res.status(404).json({ message: "Ticket not found" });
  const { status, resolution } = req.body || {};
  const data = {};
  if (status && STATUSES.includes(status)) {
    data.status = status;
    if (status === "resolved") {
      data.resolvedAt = new Date();
      data.resolvedById = req.user.id;
    }
  }
  if (resolution != null) data.resolution = String(resolution).trim() || null;
  if (Object.keys(data).length === 0) {
    return res.status(400).json({ message: "Nothing to update" });
  }

  const updated = await prisma.ticket.update({
    where: { id: ticket.id },
    data,
    include: {
      author: { include: { flat: true } },
      comments: { orderBy: { createdAt: "asc" } },
    },
  });

  // If a closing note was provided, drop it into the thread for history.
  if (data.status === "resolved" && data.resolution) {
    await prisma.ticketComment.create({
      data: {
        ticketId: ticket.id,
        authorId: req.user.id,
        authorName: req.user.name || null,
        authorRole: "admin",
        body: `Resolved: ${data.resolution}`,
      },
    });
  }

  const label =
    data.status === "resolved" ? "Your ticket was resolved" : data.status === "in_progress" ? "Your ticket is in progress" : "Ticket updated";
  await notifyUsers([ticket.authorId], label, updated.subject, { type: "ticket", ticketId: ticket.id });

  const fresh = await prisma.ticket.findUnique({
    where: { id: ticket.id },
    include: { author: { include: { flat: true } }, comments: { orderBy: { createdAt: "asc" } } },
  });
  res.json({ ticket: serializeTicket(fresh, { includeComments: true }) });
});
