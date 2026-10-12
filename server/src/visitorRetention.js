import { prisma } from "./prisma.js";

// Anonymize visitor PII after a society's retention window. Pending visitors
// are never erased. Photos/phones/names become placeholders so the gate count
// still exists for reports.

export async function runVisitorRetention(now = new Date()) {
  const societies = await prisma.society.findMany({
    where: { visitorRetentionDays: { gt: 0 } },
    select: { id: true, visitorRetentionDays: true },
  });
  let erased = 0;
  for (const s of societies) {
    const cutoff = new Date(now.getTime() - s.visitorRetentionDays * 86400000);
    const stale = await prisma.visitor.findMany({
      where: {
        flat: { societyId: s.id },
        status: { not: "pending" },
        createdAt: { lt: cutoff },
        NOT: { name: "[erased]" },
      },
      select: { id: true },
      take: 500,
    });
    if (!stale.length) continue;
    await prisma.visitor.updateMany({
      where: { id: { in: stale.map((v) => v.id) } },
      data: {
        name: "[erased]",
        phone: "",
        vehicleNo: null,
        photoUrl: null,
        purpose: "Erased",
      },
    });
    erased += stale.length;
  }
  return { checked: societies.length, erased };
}
