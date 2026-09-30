// In-process metrics. Free: no Prometheus host required. /api/metrics dumps
// JSON. When we pay for Grafana later, scrape this or swap the store.

const MAX_SAMPLES = 500;
const startedAt = Date.now();
let requests = 0;
let errors = 0;
const byStatus = new Map();
const byPath = new Map();
const samples = [];

function trimPath(p) {
  return String(p || "").split("?")[0].slice(0, 80) || "/";
}

export function observeRequest({ method, path, status, ms }) {
  requests += 1;
  if (status >= 500) errors += 1;
  const s = String(status);
  byStatus.set(s, (byStatus.get(s) || 0) + 1);
  const key = `${method} ${trimPath(path)}`;
  const row = byPath.get(key) || { n: 0, ms: 0 };
  row.n += 1;
  row.ms += ms;
  byPath.set(key, row);
  samples.push(ms);
  if (samples.length > MAX_SAMPLES) samples.shift();
}

function percentile(p) {
  if (!samples.length) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const i = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[i];
}

export function metricsSnapshot(extra = {}) {
  const paths = [...byPath.entries()]
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, 15)
    .map(([path, row]) => ({ path, count: row.n, avgMs: Math.round(row.ms / row.n) }));
  return {
    ok: true,
    uptimeSec: Math.round((Date.now() - startedAt) / 1000),
    requests,
    errors,
    status: Object.fromEntries(byStatus),
    latencyMs: { p50: percentile(50), p95: percentile(95), p99: percentile(99) },
    hotPaths: paths,
    ...extra,
  };
}
