// Who can see a neighborhood post, and who can message.
// visibility: followers (accepted follow either way) | society | all

export const VISIBILITIES = ["followers", "society", "all"];
export const KINDS = ["post", "problem", "poll"];

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
  if (post.visibility === "all") return true;
  if (post.visibility === "society") return Boolean(post.societyId) && post.societyId === viewer.societyId;
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
