import test from "node:test";
import assert from "node:assert/strict";
import { applyGuardMemory, presentVisitor, validateGuardAction, isParcelVisit, VISITOR_WAIT_MS } from "../../app/src/lib/visitorWait.js";

const now = Date.parse("2026-09-23T10:00:00Z");

function visit(overrides) {
  return {
    id: "v1",
    name: "Ramesh",
    purpose: "Guest",
    status: "pending",
    createdAt: new Date(now - 16 * 864e5).toISOString(),
    ...overrides,
  };
}

test("a visit inside 3 minutes stays Waiting", () => {
  const shown = presentVisitor(visit({ createdAt: new Date(now - 60 * 1000).toISOString() }), now);
  assert.equal(shown.status, "pending");
  assert.ok(shown.waitMsLeft > 0);
  assert.ok(shown.waitMsLeft <= VISITOR_WAIT_MS);
});

test("a visit with no answer after 3 minutes is No response, including one from days ago", () => {
  const guest = presentVisitor(visit(), now);
  const parcel = presentVisitor(visit({ purpose: "Delivery", createdAt: new Date(now - 10 * 60 * 1000).toISOString() }), now);
  assert.equal(guest.status, "no_response");
  assert.equal(parcel.status, "no_response");
});

test("an answered visit is left as the resident decided", () => {
  assert.equal(presentVisitor(visit({ status: "approved" }), now).status, "approved");
  assert.equal(presentVisitor(visit({ status: "rejected" }), now).status, "rejected");
});

test("a guard can let a guest in only with a reason, after the wait", () => {
  const guest = visit();
  assert.equal(validateGuardAction(guest, "allow", "", now).ok, false);
  const ok = validateGuardAction(guest, "allow", "Called, no one picked up", now);
  assert.equal(ok.ok, true);
  assert.equal(ok.status, "allowed_by_guard");
  assert.equal(validateGuardAction(guest, "leave_at_gate", "", now).ok, false);
  assert.equal(validateGuardAction(guest, "send_back", "", now).status, "sent_back");
});

test("a delivery is left at the gate or sent back, not sent up", () => {
  const parcel = visit({ purpose: "Cab" });
  assert.equal(isParcelVisit("Delivery"), true);
  assert.equal(validateGuardAction(parcel, "allow", "they insisted", now).ok, false);
  assert.equal(validateGuardAction(parcel, "leave_at_gate", "", now).status, "leave_at_gate");
  assert.equal(validateGuardAction(parcel, "send_back", "", now).status, "sent_back");
});

test("a guard close saved on the current server still shows as the guard's decision", () => {
  const memory = {
    "old-guest": { status: "allowed_by_guard", decisionNote: "called resident" },
    "turned-away": { status: "sent_back", decisionNote: "" },
  };
  const allowed = applyGuardMemory(presentVisitor(visit({ id: "old-guest", status: "approved" }), now), memory);
  assert.equal(allowed.status, "allowed_by_guard");
  assert.equal(allowed.decisionNote, "called resident");
  const sent = applyGuardMemory(presentVisitor(visit({ id: "turned-away", status: "rejected" }), now), memory);
  assert.equal(sent.status, "sent_back");
  const residentApproved = applyGuardMemory(presentVisitor(visit({ id: "other", status: "approved" }), now), memory);
  assert.equal(residentApproved.status, "approved");
});

test("the guard cannot close a visit while the resident still has time", () => {
  const fresh = visit({ createdAt: new Date(now - 30 * 1000).toISOString() });
  assert.equal(validateGuardAction(fresh, "allow", "too soon", now).ok, false);
});
