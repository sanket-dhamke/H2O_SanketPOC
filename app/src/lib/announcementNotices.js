// Turns society announcements into the "Needs your attention" rows on Home.
// The live home-summary API does not know about notices yet, so Home reads
// the announcements list that already exists and adds these rows itself.

const RECENT_MS = 14 * 864e5;
const MAX_NOTICES = 3;

function clip(text, max) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}

function createdAtMs(announcement) {
  const t = new Date(announcement?.createdAt).getTime();
  return Number.isNaN(t) ? 0 : t;
}

// Pinned notices stay until the person opens them. Other notices stay for
// two weeks. Dismissed ids are the ones this phone has already opened.
export function announcementNotices(announcements, { now = Date.now(), dismissed = [] } = {}) {
  const hide = new Set(dismissed || []);
  return (announcements || [])
    .filter((a) => a && a.id && a.title && !hide.has(a.id))
    .filter((a) => {
      if (a.pinned) return true;
      const t = createdAtMs(a);
      if (!t) return true;
      return now - t <= RECENT_MS;
    })
    .sort((a, b) => {
      if (Boolean(b.pinned) !== Boolean(a.pinned)) return a.pinned ? -1 : 1;
      return createdAtMs(b) - createdAtMs(a);
    })
    .slice(0, MAX_NOTICES)
    .map((a) => ({
      key: `announcement:${a.id}`,
      announcementId: a.id,
      level: "info",
      icon: "megaphone-outline",
      label: a.title,
      detail: clip(a.body, 140),
      route: "Community",
      params: { screen: "CommunityHome" },
    }));
}

export function withAnnouncementNotices(summary, announcements, opts) {
  if (!summary) return summary;
  const extra = announcementNotices(announcements, opts);
  const rest = (summary.pending || []).filter((p) => !String(p.key || "").startsWith("announcement:"));
  return { ...summary, pending: [...extra, ...rest] };
}
