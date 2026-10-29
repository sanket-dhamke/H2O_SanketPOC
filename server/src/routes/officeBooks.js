import { Router } from "express";
import { prisma } from "../prisma.js";
import { authRequired, roleRequired } from "../auth.js";
import { billBalance, effectivePaid } from "../billing.js";
import { sendEmail } from "../email.js";
import {
  LEDGERS,
  financialYear,
  dateLocked,
  nextInvoiceNo,
  ledgerBalance,
  reconcile,
  visitorsInside,
  emptyFlatVisits,
  duplicateHelpers,
  monthReport,
  duesRows,
  toCsv,
  tallyXml,
} from "../books.js";

export const officeBooksRouter = Router();

const sid = (req) => req.user.societyId || "__none__";
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const PERIOD = /^\d{4}-\d{2}$/;

function clip(v, max) {
  return String(v || "").trim().slice(0, max);
}

async function locked(societyId, day) {
  const society = await prisma.society.findUnique({
    where: { id: societyId },
    select: { booksLockedThrough: true },
  });
  return dateLocked(day, society?.booksLockedThrough);
}

function billView(b) {
  return { ...b, paid: effectivePaid(b), balance: billBalance(b) };
}

officeBooksRouter.use(authRequired);

/* ------------------------------ Bank books ------------------------------- */

officeBooksRouter.get("/books", roleRequired("admin"), async (req, res) => {
  const societyId = sid(req);
  const [society, accounts, vouchers, reconciliations] = await Promise.all([
    prisma.society.findUnique({
      where: { id: societyId },
      select: { name: true, invoicePrefix: true, invoiceSeq: true, booksLockedThrough: true },
    }),
    prisma.societyAccount.findMany({ where: { societyId }, orderBy: { createdAt: "asc" } }),
    prisma.accountVoucher.findMany({ where: { societyId }, orderBy: { date: "desc" }, take: 200 }),
    prisma.bankReconciliation.findMany({ where: { societyId }, orderBy: { createdAt: "desc" }, take: 40 }),
  ]);
  const byAccount = new Map();
  for (const v of vouchers) {
    const key = v.accountId || "";
    if (!byAccount.has(key)) byAccount.set(key, []);
    byAccount.get(key).push(v);
  }
  res.json({
    financialYear: financialYear(),
    booksLockedThrough: society?.booksLockedThrough || null,
    invoicePrefix: society?.invoicePrefix || "INV",
    invoiceNext: society?.invoiceSeq || 1,
    ledgers: LEDGERS,
    accounts: accounts.map((a) => ({
      id: a.id,
      accountHolderName: a.accountHolderName,
      bankName: a.bankName,
      accountNumber: a.accountNumber,
      ifsc: a.ifsc,
      upiId: a.upiId,
      active: a.active,
      ledgerBalance: ledgerBalance(byAccount.get(a.id) || []),
    })),
    vouchers,
    reconciliations,
  });
});

officeBooksRouter.post("/bank-accounts", roleRequired("admin"), async (req, res) => {
  const name = clip(req.body?.accountHolderName, 80);
  if (!name) return res.status(400).json({ message: "Account holder name is required" });
  const account = await prisma.societyAccount.create({
    data: {
      societyId: sid(req),
      accountHolderName: name,
      bankName: clip(req.body?.bankName, 80) || null,
      accountNumber: clip(req.body?.accountNumber, 20) || null,
      ifsc: clip(req.body?.ifsc, 11).toUpperCase() || null,
      upiId: clip(req.body?.upiId, 60) || null,
      updatedBy: req.user.id,
    },
  });
  res.status(201).json({ account });
});

officeBooksRouter.post("/vouchers", roleRequired("admin"), async (req, res) => {
  const kind = req.body?.kind === "expense" ? "expense" : "income";
  const amount = Number(req.body?.amount);
  const date = String(req.body?.date || new Date().toISOString().slice(0, 10));
  const ledger = LEDGERS.includes(req.body?.ledger) ? req.body.ledger : kind === "expense" ? "Vendor expense" : "Maintenance income";
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ message: "Amount must be greater than zero" });
  if (!YMD.test(date)) return res.status(400).json({ message: "Date must be YYYY-MM-DD" });
  if (await locked(sid(req), date)) return res.status(409).json({ message: "That date is in a locked financial year" });
  const accountId = clip(req.body?.accountId, 40) || null;
  if (accountId) {
    const account = await prisma.societyAccount.findFirst({ where: { id: accountId, societyId: sid(req) } });
    if (!account) return res.status(400).json({ message: "Bank account not found" });
  }
  const voucher = await prisma.accountVoucher.create({
    data: {
      societyId: sid(req),
      accountId,
      kind,
      ledger,
      amount,
      date,
      narration: clip(req.body?.narration, 240) || null,
      createdById: req.user.id,
    },
  });
  res.status(201).json({ voucher });
});

officeBooksRouter.post("/reconcile", roleRequired("admin"), async (req, res) => {
  const accountId = clip(req.body?.accountId, 40);
  const statementDate = String(req.body?.statementDate || "");
  const statementBalance = Number(req.body?.statementBalance);
  if (!accountId || !YMD.test(statementDate) || !Number.isFinite(statementBalance)) {
    return res.status(400).json({ message: "Account, statement date, and statement balance are required" });
  }
  const account = await prisma.societyAccount.findFirst({ where: { id: accountId, societyId: sid(req) } });
  if (!account) return res.status(404).json({ message: "Bank account not found" });
  const vouchers = await prisma.accountVoucher.findMany({
    where: { societyId: sid(req), accountId, date: { lte: statementDate } },
  });
  const compared = reconcile(statementBalance, ledgerBalance(vouchers));
  const row = await prisma.bankReconciliation.create({
    data: {
      societyId: sid(req),
      accountId,
      statementDate,
      statementBalance: compared.statementBalance,
      ledgerBalance: compared.ledgerBalance,
      note: clip(req.body?.note, 240) || null,
      createdById: req.user.id,
    },
  });
  res.status(201).json({ reconciliation: { ...row, difference: compared.difference } });
});

officeBooksRouter.post("/books/lock", roleRequired("admin"), async (req, res) => {
  const through = String(req.body?.through || "");
  if (through && !YMD.test(through)) return res.status(400).json({ message: "Lock date must be YYYY-MM-DD" });
  const society = await prisma.society.update({
    where: { id: sid(req) },
    data: { booksLockedThrough: through || null },
    select: { booksLockedThrough: true },
  });
  res.json(society);
});

officeBooksRouter.get("/books/tally", roleRequired("admin"), async (req, res) => {
  const societyId = sid(req);
  const [society, vouchers] = await Promise.all([
    prisma.society.findUnique({ where: { id: societyId }, select: { name: true } }),
    prisma.accountVoucher.findMany({ where: { societyId }, orderBy: { date: "asc" }, take: 2000 }),
  ]);
  const xml = tallyXml(vouchers, society?.name || "Society");
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=gatezo-tally.xml");
  res.send(xml);
});

/* --------------------------- Invoices & reports -------------------------- */

officeBooksRouter.post("/invoices", roleRequired("admin"), async (req, res) => {
  const flatId = clip(req.body?.flatId, 40);
  const amount = Number(req.body?.amount);
  const period = String(req.body?.period || new Date().toISOString().slice(0, 7));
  const dueDate = String(req.body?.dueDate || `${period}-10`);
  if (!flatId || !Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ message: "Flat and amount are required" });
  }
  if (!PERIOD.test(period) || !YMD.test(dueDate)) {
    return res.status(400).json({ message: "Period must be YYYY-MM and due date YYYY-MM-DD" });
  }
  if (await locked(sid(req), dueDate)) return res.status(409).json({ message: "That date is in a locked financial year" });
  const flat = await prisma.flat.findFirst({ where: { id: flatId, societyId: sid(req) } });
  if (!flat) return res.status(404).json({ message: "Flat not found" });
  const invoiceNo = await prisma.$transaction(async (tx) => {
    const current = await tx.society.findUnique({
      where: { id: sid(req) },
      select: { invoicePrefix: true, invoiceSeq: true },
    });
    const seq = current?.invoiceSeq || 1;
    await tx.society.update({ where: { id: sid(req) }, data: { invoiceSeq: seq + 1 } });
    return nextInvoiceNo(current?.invoicePrefix, seq, period.slice(0, 4));
  });
  const bill = await prisma.bill.create({
    data: {
      flatId: flat.id,
      period,
      amount,
      dueDate,
      status: "pending",
      invoiceNo,
      breakdown: req.body?.note ? [{ head: clip(req.body.note, 80), amount }] : undefined,
    },
  });
  res.status(201).json({ bill: { ...billView(bill), invoiceNo, flatNo: flat.flatNo } });
});

officeBooksRouter.get("/reports/month", roleRequired("admin"), async (req, res) => {
  const period = String(req.query.period || new Date().toISOString().slice(0, 7));
  if (!PERIOD.test(period)) return res.status(400).json({ message: "Period must be YYYY-MM" });
  const societyId = sid(req);
  const [bills, expenses, vendors, flats] = await Promise.all([
    prisma.bill.findMany({ where: { flat: { societyId }, period } }),
    prisma.expense.findMany({
      where: { societyId, date: { gte: new Date(`${period}-01T00:00:00.000Z`), lt: new Date(new Date(`${period}-01`).setMonth(new Date(`${period}-01`).getMonth() + 1)) } },
    }),
    prisma.vendorBill.findMany({ where: { societyId, status: "unpaid" } }),
    prisma.flat.findMany({ where: { societyId }, select: { id: true, flatNo: true, block: true } }),
  ]);
  const shaped = bills.map((b) => ({ ...b, paid: effectivePaid(b) }));
  const summary = monthReport(shaped, period);
  const expenseTotal = Math.round(expenses.reduce((s, e) => s + (e.amount || 0), 0));
  const dues = duesRows(shaped, flats);
  const payload = {
    period,
    mis: { ...summary, expenses: expenseTotal, vendorUnpaid: Math.round(vendors.reduce((s, v) => s + (v.amount || 0), 0)) },
    collection: summary,
    dues,
  };
  if (req.query.format === "csv") {
    const csv = toCsv(dues, ["flatNo", "block", "bills", "pending"]);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=dues-${period}.csv`);
    return res.send(csv);
  }
  res.json(payload);
});

/* ------------------------------- Gate reports ---------------------------- */

officeBooksRouter.get("/reports/gate", roleRequired("admin", "guard"), async (req, res) => {
  const month = String(req.query.month || new Date().toISOString().slice(0, 7));
  if (!PERIOD.test(month)) return res.status(400).json({ message: "Month must be YYYY-MM" });
  const societyId = sid(req);
  const start = new Date(`${month}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  const [visitors, residents] = await Promise.all([
    prisma.visitor.findMany({
      where: { flat: { societyId }, createdAt: { gte: start, lt: end } },
      include: { flat: { select: { id: true, flatNo: true, block: true } } },
      orderBy: { createdAt: "desc" },
      take: 2000,
    }),
    prisma.user.findMany({
      where: { societyId, role: "resident", active: true, flatId: { not: null } },
      select: { flatId: true },
    }),
  ]);
  const occupied = residents.map((r) => r.flatId);
  const shape = (v) => ({
    name: v.name,
    flatNo: v.flat?.flatNo || "",
    block: v.flat?.block || "",
    purpose: v.purpose || "",
    status: v.status,
    inAt: v.createdAt,
    outAt: v.exitAt || "",
  });
  const inside = visitorsInside(visitors).map(shape);
  const empty = emptyFlatVisits(visitors, occupied).map(shape);
  const monthly = visitors.map(shape);
  if (req.query.format === "csv") {
    const csv = toCsv(monthly, ["name", "flatNo", "block", "purpose", "status", "inAt", "outAt"]);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=entry-exit-${month}.csv`);
    return res.send(csv);
  }
  res.json({ month, inside, emptyFlat: empty, monthlyCount: monthly.length });
});

/* ---------------------------- Resident records --------------------------- */

officeBooksRouter.get("/buildings", roleRequired("admin"), async (req, res) => {
  const buildings = await prisma.building.findMany({ where: { societyId: sid(req) }, orderBy: { name: "asc" } });
  res.json({ buildings });
});

officeBooksRouter.post("/buildings", roleRequired("admin"), async (req, res) => {
  const name = clip(req.body?.name, 80);
  const kinds = ["residential", "non_member", "security", "facilities"];
  if (!name) return res.status(400).json({ message: "Building name is required" });
  const building = await prisma.building.create({
    data: {
      societyId: sid(req),
      name,
      kind: kinds.includes(req.body?.kind) ? req.body.kind : "residential",
      createdById: req.user.id,
      updatedById: req.user.id,
    },
  });
  res.status(201).json({ building });
});

officeBooksRouter.get("/move-requests", authRequired, async (req, res) => {
  const where = { societyId: sid(req) };
  if (req.user.role === "resident") where.userId = req.user.id;
  else if (req.user.role !== "admin") return res.status(403).json({ message: "Not allowed" });
  const requests = await prisma.moveRequest.findMany({ where, orderBy: { createdAt: "desc" }, take: 100 });
  res.json({ requests });
});

officeBooksRouter.post("/move-requests", roleRequired("resident", "admin"), async (req, res) => {
  const kind = req.body?.kind === "move_out" ? "move_out" : "move_in";
  const me = await prisma.user.findUnique({ where: { id: req.user.id }, select: { flatId: true } });
  const request = await prisma.moveRequest.create({
    data: {
      societyId: sid(req),
      flatId: me?.flatId || clip(req.body?.flatId, 40) || null,
      userId: req.user.id,
      kind,
      note: clip(req.body?.note, 240) || null,
    },
  });
  res.status(201).json({ request });
});

officeBooksRouter.post("/move-requests/:id/decide", roleRequired("admin"), async (req, res) => {
  const row = await prisma.moveRequest.findFirst({ where: { id: req.params.id, societyId: sid(req) } });
  if (!row) return res.status(404).json({ message: "Request not found" });
  const approve = req.body?.status !== "rejected";
  const updated = await prisma.moveRequest.update({
    where: { id: row.id },
    data: { status: approve ? "approved" : "rejected", decidedById: req.user.id, decidedAt: new Date() },
  });
  if (approve && row.flatId) {
    const user = row.userId ? await prisma.user.findUnique({ where: { id: row.userId }, select: { name: true, phone: true, email: true } }) : null;
    await prisma.occupancyMove.create({
      data: {
        societyId: sid(req),
        flatId: row.flatId,
        kind: row.kind,
        residentName: user?.name || "Resident",
        phone: user?.phone || null,
        email: user?.email || null,
        date: new Date().toISOString().slice(0, 10),
        notes: row.note,
        createdById: req.user.id,
      },
    });
  }
  res.json({ request: updated });
});

officeBooksRouter.get("/member-archive", roleRequired("admin"), async (req, res) => {
  const rows = await prisma.memberArchive.findMany({ where: { societyId: sid(req) }, orderBy: { createdAt: "desc" }, take: 200 });
  res.json({ archive: rows });
});

/* -------------------------- Documents, polls, mail ----------------------- */

officeBooksRouter.get("/documents", authRequired, async (req, res) => {
  const documents = await prisma.societyDocument.findMany({
    where: { societyId: sid(req) },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  res.json({ documents });
});

officeBooksRouter.post("/documents", roleRequired("admin"), async (req, res) => {
  const title = clip(req.body?.title, 120);
  const body = clip(req.body?.body, 4000);
  if (!title || !body) return res.status(400).json({ message: "Title and text are required" });
  const document = await prisma.societyDocument.create({
    data: { societyId: sid(req), title, body, createdById: req.user.id },
  });
  res.status(201).json({ document });
});

officeBooksRouter.get("/polls", authRequired, async (req, res) => {
  const polls = await prisma.poll.findMany({
    where: { societyId: sid(req) },
    include: { votes: true },
    orderBy: { createdAt: "desc" },
    take: 40,
  });
  res.json({
    polls: polls.map((p) => ({
      id: p.id,
      question: p.question,
      options: p.options,
      closesOn: p.closesOn,
      mine: p.votes.find((v) => v.userId === req.user.id)?.choice || null,
      counts: countVotes(p.options, p.votes),
    })),
  });
});

function countVotes(options, votes) {
  const counts = {};
  for (const opt of Array.isArray(options) ? options : []) counts[opt] = 0;
  for (const v of votes || []) counts[v.choice] = (counts[v.choice] || 0) + 1;
  return counts;
}

officeBooksRouter.post("/polls", roleRequired("admin"), async (req, res) => {
  const question = clip(req.body?.question, 200);
  const options = (Array.isArray(req.body?.options) ? req.body.options : String(req.body?.options || "").split(","))
    .map((o) => clip(o, 80))
    .filter(Boolean)
    .slice(0, 6);
  if (!question || options.length < 2) return res.status(400).json({ message: "A question and at least two options are required" });
  const poll = await prisma.poll.create({
    data: {
      societyId: sid(req),
      question,
      options,
      closesOn: YMD.test(String(req.body?.closesOn || "")) ? req.body.closesOn : null,
      createdById: req.user.id,
    },
  });
  res.status(201).json({ poll });
});

officeBooksRouter.post("/polls/:id/vote", authRequired, async (req, res) => {
  const poll = await prisma.poll.findFirst({ where: { id: req.params.id, societyId: sid(req) } });
  if (!poll) return res.status(404).json({ message: "Poll not found" });
  if (poll.closesOn && poll.closesOn < new Date().toISOString().slice(0, 10)) {
    return res.status(400).json({ message: "This poll has closed" });
  }
  const choice = clip(req.body?.choice, 80);
  const options = Array.isArray(poll.options) ? poll.options : [];
  if (!options.includes(choice)) return res.status(400).json({ message: "Pick one of the listed options" });
  const vote = await prisma.pollVote.upsert({
    where: { pollId_userId: { pollId: poll.id, userId: req.user.id } },
    update: { choice },
    create: { pollId: poll.id, userId: req.user.id, choice },
  });
  res.json({ vote: { choice: vote.choice } });
});

officeBooksRouter.post("/group-mail", roleRequired("admin"), async (req, res) => {
  const subject = clip(req.body?.subject, 140);
  const body = clip(req.body?.body, 4000);
  const audience = ["all", "admins", "defaulters"].includes(req.body?.audience) ? req.body.audience : "all";
  if (!subject || !body) return res.status(400).json({ message: "Subject and message are required" });
  const societyId = sid(req);
  let users = await prisma.user.findMany({
    where: { societyId, active: true, role: audience === "admins" ? "admin" : { in: ["resident", "admin"] } },
    select: { id: true, email: true, role: true, flatId: true, name: true },
  });
  if (audience === "defaulters") {
    const bills = await prisma.bill.findMany({ where: { flat: { societyId } } });
    const owing = new Set(bills.filter((b) => billBalance(b) > 0.5).map((b) => b.flatId));
    users = users.filter((u) => u.role === "resident" && owing.has(u.flatId));
  }
  let sent = 0;
  let failed = 0;
  let dev = 0;
  for (const u of users) {
    if (!u.email) {
      failed += 1;
      continue;
    }
    const result = await sendEmail({ to: u.email, subject, text: `Hi ${u.name || ""},\n\n${body}` });
    if (result.dev) dev += 1;
    else if (result.delivered) sent += 1;
    else failed += 1;
  }
  const mail = await prisma.groupMail.create({
    data: { societyId, subject, body, audience, sent, failed, dev, createdById: req.user.id },
  });
  res.status(201).json({ mail });
});

officeBooksRouter.get("/group-mail", roleRequired("admin"), async (req, res) => {
  const mails = await prisma.groupMail.findMany({ where: { societyId: sid(req) }, orderBy: { createdAt: "desc" }, take: 30 });
  res.json({ mails });
});

officeBooksRouter.get("/helpers/duplicates", roleRequired("admin", "guard"), async (req, res) => {
  const seen = await prisma.workerAttendance.findMany({
    where: { societyId: sid(req) },
    select: { workerId: true },
    distinct: ["workerId"],
  });
  const workers = seen.length
    ? await prisma.worker.findMany({
        where: { id: { in: seen.map((row) => row.workerId) } },
        select: { id: true, name: true, phone: true, company: true, subtype: true, active: true },
      })
    : [];
  res.json({
    active: workers.filter((w) => w.active),
    inactive: workers.filter((w) => !w.active),
    duplicates: duplicateHelpers(workers),
  });
});

officeBooksRouter.patch("/helpers/:id", roleRequired("admin"), async (req, res) => {
  const worker = await prisma.worker.findUnique({ where: { id: req.params.id } });
  if (!worker) return res.status(404).json({ message: "Helper not found" });
  const data = {};
  if (req.body?.company != null) data.company = clip(req.body.company, 80) || null;
  if (req.body?.active != null) data.active = Boolean(req.body.active);
  const updated = await prisma.worker.update({ where: { id: worker.id }, data });
  res.json({ worker: { id: updated.id, name: updated.name, company: updated.company, active: updated.active } });
});
