// One open visit per resident, service, package, date, and time.
// A second tap must not create a second start code.

const OPEN = ["requested", "finding", "offered", "accepted", "started", "confirmed", "assigned"];
const RANK = {
  started: 6,
  accepted: 5,
  confirmed: 4,
  assigned: 4,
  offered: 3,
  finding: 2,
  requested: 1,
};

export function isOpenVisit(booking) {
  return OPEN.includes(booking?.status);
}

export function visitKey(booking) {
  return [booking?.residentId, booking?.serviceSlug, booking?.packageId, booking?.scheduledDate, booking?.slot].join("|");
}

// Keep the visit that has gone furthest. If both are at the same step, keep
// the first tap so the original start code stays.
export function duplicateVisitIds(bookings) {
  const groups = new Map();
  for (const booking of bookings || []) {
    if (!booking?.id || !isOpenVisit(booking)) continue;
    const key = visitKey(booking);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(booking);
  }
  const cancel = [];
  for (const rows of groups.values()) {
    if (rows.length < 2) continue;
    const ranked = rows.slice().sort((a, b) => {
      const byStep = (RANK[b.status] || 0) - (RANK[a.status] || 0);
      if (byStep) return byStep;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
    for (const extra of ranked.slice(1)) cancel.push(extra.id);
  }
  return cancel;
}

export async function collapseDuplicateVisits(prisma, where) {
  const rows = await prisma.serviceBooking.findMany({
    where: { ...where, status: { in: OPEN } },
    select: {
      id: true,
      residentId: true,
      serviceSlug: true,
      packageId: true,
      scheduledDate: true,
      slot: true,
      status: true,
      createdAt: true,
    },
  });
  const ids = duplicateVisitIds(rows);
  if (!ids.length) return [];
  await prisma.serviceBooking.updateMany({
    where: { id: { in: ids } },
    data: { status: "cancelled", offerProviderId: null, offerExpiresAt: null },
  });
  return ids;
}
