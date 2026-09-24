// Small presentation helpers shared by the Neighborhood feed and profile.
// Pure functions only, so they are easy to reason about and test.

export function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Stable, pleasant avatar colour derived from the name so a person keeps the
// same colour everywhere without storing anything.
const AVATAR_COLORS = [
  "#0B6E8F", "#0F6E56", "#C2410C", "#7C3AED", "#B42318",
  "#0369A1", "#15803D", "#A16207", "#BE185D", "#4F46E5",
];
export function colorForName(name) {
  const s = String(name || "");
  let hash = 0;
  for (let i = 0; i < s.length; i += 1) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

// Compact "time ago" like the ones social feeds use: 5s, 12m, 3h, 2d, 4w, 6mo.
export function timeAgo(iso) {
  const then = new Date(iso).getTime();
  if (!then) return "";
  const s = Math.max(1, Math.floor((Date.now() - then) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo`;
  return `${Math.floor(d / 365)}y`;
}

export function titleCase(value) {
  return String(value || "").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Audience the post was shared with (matches server VISIBILITIES).
export const VISIBILITY_META = {
  followers: { label: "Followers", icon: "people" },
  society: { label: "My society", icon: "business" },
  area: { label: "This area", icon: "location" },
};

// Post kind badge styling.
export const KIND_META = {
  post: { label: "Update", icon: "chatbubble-ellipses-outline", color: "#0B6E8F" },
  problem: { label: "Problem", icon: "alert-circle", color: "#C2410C" },
  poll: { label: "Poll", icon: "stats-chart", color: "#7C3AED" },
};

// Follow-button appearance for each relationship state.
export const FOLLOW_META = {
  none: { label: "Follow", solid: true },
  requested: { label: "Requested", solid: false },
  incoming: { label: "Accept", solid: true },
  accepted: { label: "Following", solid: false },
};
