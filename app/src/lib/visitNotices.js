// Open home-service visits belong on Home, next to the other things a resident
// still has to act on. History remains the full list.

const OPEN = new Set(["requested", "finding", "offered", "accepted", "started", "confirmed", "assigned"]);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function prettyDate(iso) {
  const [y, m, d] = String(iso || "").split("-").map(Number);
  if (!y || !m || !d) return "";
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${DAYS[dt.getUTCDay()]}, ${MONTHS[m - 1]} ${d}`;
}

function detailFor(booking) {
  const when = [booking.packageName, prettyDate(booking.scheduledDate), booking.slot].filter(Boolean).join(" · ");
  if (booking.status === "accepted" && booking.startOtp) {
    return `${when}. Start code ${booking.startOtp}. Read it to the professional when they arrive.`;
  }
  if (booking.status === "started" && booking.completeOtp) {
    return `${when}. Finish code ${booking.completeOtp}. Read it when the work is done.`;
  }
  if (booking.status === "finding" || booking.status === "offered" || booking.status === "requested") {
    return `${when}. Waiting for a professional to accept.`;
  }
  if (booking.partnerName) return `${when}. ${booking.partnerName} is coming.`;
  return when;
}

const STEP = { started: 6, accepted: 5, confirmed: 4, assigned: 4, offered: 3, finding: 2, requested: 1 };

function sameVisit(a, b) {
  return a.serviceSlug === b.serviceSlug && a.packageId === b.packageId && a.scheduledDate === b.scheduledDate && a.slot === b.slot;
}

function oneVisitEach(bookings) {
  const kept = [];
  for (const booking of bookings) {
    const index = kept.findIndex((row) => sameVisit(row, booking));
    if (index < 0) {
      kept.push(booking);
      continue;
    }
    const current = kept[index];
    const betterStep = (STEP[booking.status] || 0) - (STEP[current.status] || 0);
    const earlier = betterStep === 0 && new Date(booking.createdAt).getTime() < new Date(current.createdAt).getTime();
    if (betterStep > 0 || earlier) kept[index] = booking;
  }
  return kept;
}

export function visitNotices(bookings) {
  return oneVisitEach((bookings || []).filter((booking) => booking && booking.id && OPEN.has(booking.status)))
    .sort((a, b) => String(a.scheduledDate || "").localeCompare(String(b.scheduledDate || "")) || String(a.slot || "").localeCompare(String(b.slot || "")))
    .slice(0, 3)
    .map((booking) => ({
      key: `visit:${booking.id}`,
      level: booking.status === "accepted" || booking.status === "started" ? "warn" : "info",
      icon: "construct-outline",
      label: booking.serviceName || "Home service",
      detail: detailFor(booking),
      route: "Community",
      params: { screen: "HomeServices", params: { tab: "orders" } },
    }));
}

export function withVisitNotices(summary, bookings) {
  if (!summary || bookings == null) return summary;
  const extra = visitNotices(bookings);
  const rest = (summary.pending || []).filter((row) => !String(row.key || "").startsWith("visit:"));
  return { ...summary, pending: [...extra, ...rest] };
}
