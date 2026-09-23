// Approved clubhouse bookings that still need payment. Home reads the same
// bookings list as My bookings, so the reminder shows even when the live
// home summary does not mention them.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function prettyDate(iso) {
  const [y, m, d] = String(iso || "").split("-").map(Number);
  if (!y || !m || !d) return "";
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${DAYS[dt.getUTCDay()]}, ${MONTHS[m - 1]} ${d}`;
}

function rupee(amount) {
  return `₹${Number(amount || 0).toLocaleString("en-IN")}`;
}

export function bookingNotices(bookings, { residentId } = {}) {
  return (bookings || [])
    .filter((b) => b && b.status === "approved")
    .filter((b) => !residentId || !b.residentId || b.residentId === residentId)
    .slice(0, 3)
    .map((b) => {
      const place = b.amenityName || "Booking";
      const when = [b.slotLabel, prettyDate(b.date)].filter(Boolean).join(" · ");
      const amount = Number(b.amount || 0);
      const pay = amount > 0 ? `Pay ${rupee(amount)}` : "Pay to confirm";
      return {
        key: `booking:${b.id}`,
        level: "warn",
        icon: "calendar-outline",
        label: `${place} approved`,
        detail: [when, pay].filter(Boolean).join(" · "),
        route: "Community",
        params: { screen: "Amenities", params: { tab: "mine" } },
      };
    });
}

export function withBookingNotices(summary, bookings, opts) {
  if (!summary) return summary;
  const extra = bookingNotices(bookings, opts);
  if (!extra.length) return summary;
  const rest = (summary.pending || []).filter((p) => p.key !== "bookings" && !String(p.key || "").startsWith("booking:"));
  return { ...summary, pending: [...extra, ...rest] };
}
