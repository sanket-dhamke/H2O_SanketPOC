import test from "node:test";
import assert from "node:assert/strict";
import { formatHours, periodBounds, summarizeVisits, visitsInPeriod } from "../../app/src/lib/attendancePeriod.js";

const wednesday = new Date("2026-09-23T08:00:00.000Z");

test("today, this week and this month use the India calendar", () => {
  assert.deepEqual(periodBounds("day", wednesday), { from: "2026-09-23", to: "2026-09-23" });
  assert.deepEqual(periodBounds("week", wednesday), { from: "2026-09-21", to: "2026-09-27" });
  assert.deepEqual(periodBounds("month", wednesday), { from: "2026-09-01", to: "2026-09-30" });
  assert.equal(periodBounds("week", new Date("2026-09-21T03:30:00.000Z")).from, "2026-09-21");
  assert.equal(periodBounds("week", new Date("2026-09-27T12:00:00.000Z")).from, "2026-09-21");
});

test("a period keeps that person's visits and adds up finished hours", () => {
  const rows = [
    { date: "2026-09-23", inAt: "2026-09-23T04:00:00.000Z", outAt: "2026-09-23T06:30:00.000Z" },
    { date: "2026-09-22", inAt: "2026-09-22T04:00:00.000Z", outAt: "2026-09-22T05:00:00.000Z" },
    { date: "2026-08-31", inAt: "2026-08-31T04:00:00.000Z", outAt: "2026-08-31T08:00:00.000Z" },
    { date: "2026-09-23", inAt: "2026-09-23T08:00:00.000Z", outAt: null },
  ];
  assert.equal(visitsInPeriod(rows, "day", wednesday).length, 2);
  assert.equal(visitsInPeriod(rows, "month", wednesday).length, 3);
  const summary = summarizeVisits(visitsInPeriod(rows, "week", wednesday));
  assert.equal(summary.days, 2);
  assert.equal(summary.visits, 3);
  assert.equal(summary.minutes, 210);
  assert.equal(summary.open, 1);
  assert.equal(formatHours(210), "3h 30m");
});
