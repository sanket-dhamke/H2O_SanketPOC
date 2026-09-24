// Who can see a neighborhood post, and who can message.
// visibility: followers (accepted follow either way) | society | area
// "area" reaches nearby societies in the same locality (society city), not the
// whole country. This is the cross-boundary-wall discussion that sets GATEZO
// apart from a global public feed.

export const VISIBILITIES = ["followers", "society", "area"];
export const KINDS = ["post", "problem", "poll"];

// Normalizes a society's city into a stable area key ("  Pune " -> "pune").
export function areaKey(city) {
  return String(city || "").trim().toLowerCase() || null;
}

export function pairKey(a, b) {
  return [a, b].sort().join(":");
}

export function acceptedPeerIds(follows, userId) {
  const ids = new Set();
  for (const row of follows || []) {
    if (row.status !== "accepted") continue;
    if (row.requesterId === userId) ids.add(row.targetId);
    else if (row.targetId === userId) ids.add(row.requesterId);
  }
  return ids;
}

export function canSeePost(post, viewer, peers) {
  if (!post || !viewer) return false;
  if (post.authorId === viewer.id) return true;
  if (post.visibility === "society") return Boolean(post.societyId) && post.societyId === viewer.societyId;
  if (post.visibility === "area") return Boolean(post.area) && post.area === viewer.area;
  if (post.visibility === "followers") return peers.has(post.authorId);
  return false;
}

export function canMessage(userId, otherId, peers) {
  if (!userId || !otherId || userId === otherId) return false;
  return peers.has(otherId);
}

export function filterFeed(posts, viewer, peers) {
  return (posts || []).filter((post) => canSeePost(post, viewer, peers));
}
