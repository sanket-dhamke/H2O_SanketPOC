import { prisma } from "./prisma.js";
import { enqueuePush } from "./queue.js";
import { placeApprovalCall } from "./ivr.js";
import {
  VISITOR_WAIT_MS,
  VISITOR_CALL_AFTER_MS,
  isParcelVisit,
  presentVisitor,
  validateGuardAction,
} from "../../app/src/lib/visitorWait.js";

export { VISITOR_WAIT_MS, VISITOR_CALL_AFTER_MS, isParcelVisit, presentVisitor, validateGuardAction };

let columnsReady = false;

// decisionNote and approvalCallAt are optional bookkeeping. Adding them on boot
// keeps an existing database working without a separate migration step.
export async function ensureVisitorWaitColumns() {
  if (columnsReady) return;
  await prisma.$executeRawUnsafe(`ALTER TABLE "Visitor" ADD COLUMN IF NOT EXISTS "decisionNote" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "Visitor" ADD COLUMN IF NOT EXISTS "approvalCallAt" TIMESTAMP(3)`);
  columnsReady = true;
}

async function notifyFlat(visitor, title, body) {
  const residents = await prisma.user.findMany({
    where: { flatId: visitor.flatId, role: "resident", active: true },
  });
  for (const r of residents) {
    if (r.expoPushToken) enqueuePush(r.expoPushToken, title, body, { type: "visitor", visitorId: visitor.id });
  }
  const societyId = visitor.flat?.societyId;
  if (!societyId) return;
  const admins = await prisma.user.findMany({
    where: { societyId, role: "admin", active: true },
  });
  for (const a of admins) {
    if (a.expoPushToken) enqueuePush(a.expoPushToken, title, body, { type: "visitor", visitorId: visitor.id });
  }
  if (visitor.guardId) {
    const guard = await prisma.user.findUnique({ where: { id: visitor.guardId } });
    if (guard?.expoPushToken) enqueuePush(guard.expoPushToken, title, body, { type: "visitor", visitorId: visitor.id });
  }
}

// Pending visits older than 3 minutes become No response. One phone call goes
// out after the first minute if the resident has not answered in the app.
export async function sweepVisitorWaits() {
  await ensureVisitorWaitColumns();
  const now = Date.now();
  const cutoff = new Date(now - VISITOR_WAIT_MS);
  const callAfter = new Date(now - VISITOR_CALL_AFTER_MS);

  const stale = await prisma.visitor.findMany({
    where: { status: "pending", createdAt: { lt: cutoff } },
    include: { flat: true },
  });
  for (const visitor of stale) {
    await prisma.visitor.update({
      where: { id: visitor.id },
      data: { status: "no_response", decidedAt: new Date(), decidedBy: "timeout" },
    });
    const parcel = isParcelVisit(visitor.purpose);
    const title = `No answer from ${visitor.flat?.flatNo || "the flat"}`;
    const body = parcel
      ? `${visitor.name} (${visitor.purpose}) was not answered in 3 minutes. Leave them at the gate or send them back. Do not send them up.`
      : `${visitor.name} was not answered in 3 minutes. Call the flat. Let them in only if you record a reason.`;
    await notifyFlat(visitor, title, body);
  }

  const toCall = await prisma.visitor.findMany({
    where: {
      status: "pending",
      approvalCallAt: null,
      createdAt: { lt: callAfter, gte: cutoff },
    },
    include: { flat: true },
  });
  for (const visitor of toCall) {
    const resident = await prisma.user.findFirst({
      where: { flatId: visitor.flatId, role: "resident", active: true, phone: { not: "" } },
      orderBy: { createdAt: "asc" },
    });
    if (resident?.phone) {
      await placeApprovalCall({ visitor, toPhone: resident.phone });
    }
    await prisma.visitor.update({
      where: { id: visitor.id },
      data: { approvalCallAt: new Date() },
    });
  }
}
