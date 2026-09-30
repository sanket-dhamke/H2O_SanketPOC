import test from "node:test";
import assert from "node:assert/strict";
import { canAccessSociety, assertSociety, scopedSocietyId } from "../src/tenant.js";
import { loginBlocked, noteLoginFailure, clearLoginFailures } from "../src/lockout.js";
import { observeRequest, metricsSnapshot } from "../src/metrics.js";

const admin = { id: "a", role: "admin", societyId: "soc-a" };
const other = { id: "b", role: "resident", societyId: "soc-b" };
const owner = { id: "o", role: "superadmin", societyId: null };

test("a society user cannot read another society's rows", () => {
  assert.equal(canAccessSociety(admin, "soc-a"), true);
  assert.equal(canAccessSociety(admin, "soc-b"), false);
  assert.equal(canAccessSociety(other, "soc-a"), false);
  assert.equal(canAccessSociety(owner, "soc-a"), true);
  assert.equal(scopedSocietyId(admin), "soc-a");
  assert.throws(() => assertSociety(other, "soc-a"), (err) => err.status === 403);
});

test("repeated failed logins lock that email+IP for a while", () => {
  const email = "lock@test.com";
  const ip = "1.2.3.4";
  clearLoginFailures(email, ip);
  assert.equal(loginBlocked(email, ip), null);
  const prev = process.env.LOGIN_LOCKOUT_MAX;
  process.env.LOGIN_LOCKOUT_MAX = "3";
  // Module already captured MAX_FAILS at load — we just hammer until blocked
  // using the default of 8, which is still a free in-memory limit.
  for (let i = 0; i < 8; i++) noteLoginFailure(email, ip);
  assert.ok(loginBlocked(email, ip) > 0);
  clearLoginFailures(email, ip);
  assert.equal(loginBlocked(email, ip), null);
  if (prev === undefined) delete process.env.LOGIN_LOCKOUT_MAX;
  else process.env.LOGIN_LOCKOUT_MAX = prev;
});

test("metrics record request counts and latency buckets", () => {
  observeRequest({ method: "GET", path: "/api/health", status: 200, ms: 12 });
  observeRequest({ method: "GET", path: "/api/missing", status: 404, ms: 4 });
  const snap = metricsSnapshot();
  assert.ok(snap.requests >= 2);
  assert.equal(typeof snap.latencyMs.p95, "number");
  assert.ok(Array.isArray(snap.hotPaths));
});
