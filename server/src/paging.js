// Tiny, backward-compatible pagination helper for list endpoints.
//
// Reads optional `?page` and `?limit` query params. When a client sends neither,
// callers pass a `def` equal to the endpoint's previous hard cap, so existing
// clients see identical results. Responses keep their original array key and can
// add `hasMore` (additive — safe for older app builds that ignore it).

export function parsePaging(req, { def = 50, max = 200 } = {}) {
  let limit = parseInt(req.query?.limit, 10);
  if (!Number.isFinite(limit) || limit <= 0) limit = def;
  limit = Math.min(limit, max);

  let page = parseInt(req.query?.page, 10);
  if (!Number.isFinite(page) || page < 1) page = 1;

  return { take: limit, skip: (page - 1) * limit, page, limit };
}

// Given the number of rows returned for the current page, has more if the page
// came back full. (Cheap: avoids a COUNT query.)
export function hasMore(returnedCount, { limit }) {
  return returnedCount >= limit;
}
