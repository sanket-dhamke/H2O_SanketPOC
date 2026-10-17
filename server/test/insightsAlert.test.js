import test from "node:test";
import assert from "node:assert/strict";
import { unpaidDuesAlert } from "../src/insights.js";

test("unpaid dues alert names the money and the flats", () => {
  const alert = unpaidDuesAlert({ totalPending: 360, dueFlatCount: 360 });
  assert.equal(alert.level, "warn");
  assert.equal(alert.action, "finance");
  assert.match(alert.title, /360/);
  assert.match(alert.detail, /360 flats/);
});

test("one flat uses the singular", () => {
  const alert = unpaidDuesAlert({ totalPending: 1, dueFlatCount: 1, unit: "flat", units: "flats" });
  assert.match(alert.detail, /1 flat has/);
});
