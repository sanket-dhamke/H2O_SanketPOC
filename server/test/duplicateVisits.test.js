import test from "node:test";
import assert from "node:assert/strict";
import { duplicateVisitIds, visitKey } from "../src/duplicateVisits.js";

test("two taps for the same visit keep the first start code and drop the second", () => {
  const ids = duplicateVisitIds([
    { id: "first", residentId: "me", serviceSlug: "ac", packageId: "svc", scheduledDate: "2026-10-19", slot: "10:00–11:00", status: "accepted", createdAt: "2026-10-16T04:00:00.000Z" },
    { id: "second", residentId: "me", serviceSlug: "ac", packageId: "svc", scheduledDate: "2026-10-19", slot: "10:00–11:00", status: "accepted", createdAt: "2026-10-16T04:05:00.000Z" },
    { id: "other-day", residentId: "me", serviceSlug: "ac", packageId: "svc", scheduledDate: "2026-10-20", slot: "10:00–11:00", status: "accepted", createdAt: "2026-10-16T04:06:00.000Z" },
  ]);
  assert.deepEqual(ids, ["second"]);
  assert.notEqual(visitKey({ residentId: "me", serviceSlug: "ac", packageId: "svc", scheduledDate: "2026-10-19", slot: "10:00–11:00" }), visitKey({ residentId: "me", serviceSlug: "ac", packageId: "gas", scheduledDate: "2026-10-19", slot: "10:00–11:00" }));
});

test("an accepted visit wins over a later finding duplicate", () => {
  const ids = duplicateVisitIds([
    { id: "finding", residentId: "me", serviceSlug: "ac", packageId: "svc", scheduledDate: "2026-10-19", slot: "10:00–11:00", status: "finding", createdAt: "2026-10-16T04:00:00.000Z" },
    { id: "accepted", residentId: "me", serviceSlug: "ac", packageId: "svc", scheduledDate: "2026-10-19", slot: "10:00–11:00", status: "accepted", createdAt: "2026-10-16T04:02:00.000Z" },
  ]);
  assert.deepEqual(ids, ["finding"]);
});
