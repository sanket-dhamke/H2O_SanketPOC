// In-memory login lockout. Free on a single API instance. With several
// instances, put this in Redis (same keys) — that needs a paid Redis URL.

const WINDOW_MS = Number(process.env.LOGIN_LOCKOUT_WINDOW_MS || 15 * 60 * 1000);
const MAX_FAILS = Number(process.env.LOGIN_LOCKOUT_MAX || 8);
const hits = new Map();

function key(email, ip) {
  return `${String(email || "").toLowerCase().trim()}|${ip || "?"}`;
}

function prune(now) {
  if (hits.size < 2000) return;
  for (const [k, row] of hits) {
    if (row.resetAt < now) hits.delete(k);
  }
}

export function loginBlocked(email, ip) {
  const row = hits.get(key(email, ip));
  if (!row) return null;
  if (Date.now() > row.resetAt) {
    hits.delete(key(email, ip));
    return null;
  }
  if (row.n >= MAX_FAILS) {
    return Math.ceil((row.resetAt - Date.now()) / 1000);
  }
  return null;
}

export function noteLoginFailure(email, ip) {
  const now = Date.now();
  prune(now);
  const k = key(email, ip);
  const row = hits.get(k) || { n: 0, resetAt: now + WINDOW_MS };
  if (now > row.resetAt) {
    row.n = 0;
    row.resetAt = now + WINDOW_MS;
  }
  row.n += 1;
  hits.set(k, row);
  return row.n;
}

export function clearLoginFailures(email, ip) {
  hits.delete(key(email, ip));
}
