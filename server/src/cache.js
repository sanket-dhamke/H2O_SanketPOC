// Optional cache layer. Uses Redis when REDIS_URL is set (shared across all API
// instances); otherwise falls back to a bounded in-process Map with TTLs so the
// server behaves identically — just without cross-instance sharing. Values are
// JSON-serialised. Keep TTLs short for anything that can change (correctness > hit rate).

const REDIS_URL = process.env.REDIS_URL || "";
export const cacheBackend = REDIS_URL ? "redis" : "memory";

// ---- in-memory fallback (bounded, TTL-pruned) ----
const MEM_MAX = Number(process.env.CACHE_MEM_MAX || 5000);
const mem = new Map(); // key -> { v: string, exp: number(ms) }

function memGet(key) {
  const hit = mem.get(key);
  if (!hit) return null;
  if (hit.exp && hit.exp < Date.now()) {
    mem.delete(key);
    return null;
  }
  return hit.v;
}
function memSet(key, v, ttlSec) {
  if (mem.size >= MEM_MAX) {
    // Evict the oldest ~1% to keep memory bounded (Map preserves insertion order).
    let n = Math.max(1, Math.floor(MEM_MAX * 0.01));
    for (const k of mem.keys()) {
      mem.delete(k);
      if (--n <= 0) break;
    }
  }
  mem.set(key, { v, exp: ttlSec ? Date.now() + ttlSec * 1000 : 0 });
}

// ---- Redis (lazy, optional) ----
let redis = null;
let redisTried = false;
async function getRedis() {
  if (!REDIS_URL) return null;
  if (redis || redisTried) return redis;
  redisTried = true;
  try {
    const { default: IORedis } = await import("ioredis");
    redis = new IORedis(REDIS_URL, { maxRetriesPerRequest: 2, enableOfflineQueue: false });
    redis.on("error", (e) => console.error("[cache] redis error:", e.message));
    return redis;
  } catch (e) {
    console.warn("[cache] ioredis unavailable, using in-memory cache:", e.message);
    return null;
  }
}

export async function cacheGet(key) {
  try {
    const r = await getRedis();
    const raw = r ? await r.get(key) : memGet(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null; // cache must never break a request
  }
}

export async function cacheSet(key, value, ttlSec = 60) {
  try {
    const raw = JSON.stringify(value);
    const r = await getRedis();
    if (r) await r.set(key, raw, "EX", ttlSec);
    else memSet(key, raw, ttlSec);
  } catch {
    /* ignore */
  }
}

export async function cacheDel(key) {
  try {
    const r = await getRedis();
    if (r) await r.del(key);
    else mem.delete(key);
  } catch {
    /* ignore */
  }
}

// Read-through helper: return the cached value or compute, cache, and return it.
// On any cache error it transparently falls back to calling fn().
export async function cacheWrap(key, ttlSec, fn) {
  const cached = await cacheGet(key);
  if (cached !== null && cached !== undefined) return cached;
  const fresh = await fn();
  if (fresh !== null && fresh !== undefined) await cacheSet(key, fresh, ttlSec);
  return fresh;
}
