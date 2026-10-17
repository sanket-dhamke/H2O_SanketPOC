// Turns Buy & Sell messages into "Needs your attention" rows.
// The latest message in a thread is the one that still needs a reply.
// A newer message uses a new id, so dismissing an older row does not hide it.

const MAX_NOTICES = 5;

function clip(text, max) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}

function atMs(value) {
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? 0 : t;
}

export function onSellerSide(message, viewer) {
  if (!message || !viewer) return false;
  if (message.listingAuthorId && message.listingAuthorId === viewer.userId) return true;
  return Boolean(viewer.flatId && message.authorFlatId && viewer.flatId === message.authorFlatId);
}

function senderOnSellerSide(message) {
  if (!message) return false;
  if (message.fromUserId && message.fromUserId === message.listingAuthorId) return true;
  return Boolean(message.authorFlatId && message.fromFlatId && message.authorFlatId === message.fromFlatId);
}

function involves(message, viewer) {
  if (!message || !viewer?.userId) return false;
  if (message.fromUserId === viewer.userId || message.toUserId === viewer.userId) return true;
  return onSellerSide(message, viewer);
}

function otherParty(message, viewer) {
  if (onSellerSide(message, viewer)) {
    if (message.fromUserId && message.fromUserId !== message.listingAuthorId && !senderOnSellerSide(message)) {
      return message.fromUserId;
    }
    return message.toUserId || message.fromUserId;
  }
  return message.listingAuthorId || message.toUserId || null;
}

// messages: { id, body, createdAt, fromUserId, fromName, fromFlat, fromFlatId,
//   toUserId, listingId, listingTitle, listingAuthorId, authorFlatId }
export function listingAttentionNotices(messages, viewer) {
  const threads = new Map();
  for (const message of messages || []) {
    if (!message?.id || !message.listingId || !involves(message, viewer)) continue;
    const otherId = otherParty(message, viewer);
    if (!otherId || otherId === viewer.userId) continue;
    const key = `${message.listingId}:${otherId}`;
    const at = atMs(message.createdAt);
    const prev = threads.get(key);
    if (!prev || at >= prev.at) threads.set(key, { at, message, otherId });
  }

  return [...threads.values()]
    .filter((thread) => {
      const latest = thread.message;
      if (latest.fromUserId === viewer.userId) return false;
      const seller = onSellerSide(latest, viewer);
      const fromSeller = senderOnSellerSide(latest);
      if (seller) return !fromSeller;
      return fromSeller;
    })
    .sort((a, b) => b.at - a.at)
    .slice(0, MAX_NOTICES)
    .map((thread) => {
      const message = thread.message;
      const who = message.fromName || "A resident";
      const flat = message.fromFlat ? ` · ${message.fromFlat}` : "";
      const title = message.listingTitle || "a listing";
      return {
        key: `listing-message:${message.id}`,
        level: "info",
        icon: "chatbubble-ellipses-outline",
        label: `Message about ${title}`,
        detail: `${who}${flat}: ${clip(message.body, 120)}`,
        route: "Community",
        params: { screen: "ListingDetail", params: { id: message.listingId } },
      };
    });
}
