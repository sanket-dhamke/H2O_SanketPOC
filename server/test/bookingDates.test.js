import test from "node:test";
import assert from "node:assert/strict";
import { bookingDatePassed } from "../src/bookingDates.js";

test("a clubhouse slot on 23 Sep cannot be paid on 16 Oct", () => {
  assert.equal(bookingDatePassed("2026-09-23", "2026-10-16"), true);
  assert.equal(bookingDatePassed("2026-10-16", "2026-10-16"), false);
  assert.equal(bookingDatePassed("2026-10-19", "2026-10-16"), false);
});
