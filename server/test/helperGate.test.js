import test from "node:test";
import assert from "node:assert/strict";
import { indiaDate, insideVisits, mergeHelperDirectory, retainInside } from "../../app/src/lib/helperGate.js";

test("a registered helper stays on the list when they are not inside", () => {
  const rows = mergeHelperDirectory(
    [{ id: "k", name: "Kusum", subtype: "Maid" }],
    []
  );
  assert.equal(rows[0].inside, false);
  assert.equal(rows[0].attendanceId, null);
});

test("an open visit marks that helper inside and keeps the checkout id", () => {
  const rows = mergeHelperDirectory(
    [{ id: "k", name: "Kusum", subtype: "Maid" }],
    [{ id: "att-1", workerId: "k", inAt: "2026-09-23T11:02:00.000Z", outAt: null, inPhotoUrl: "https://cdn.example/in.jpg" }]
  );
  assert.equal(rows[0].inside, true);
  assert.equal(rows[0].attendanceId, "att-1");
  assert.equal(rows[0].inPhotoUrl, "https://cdn.example/in.jpg");
  const left = mergeHelperDirectory(
    [{ id: "k", name: "Kusum" }],
    [{ id: "att-2", workerId: "k", outAt: "2026-09-23T12:00:00.000Z" }]
  );
  assert.equal(left[0].inside, false);
  assert.equal(insideVisits([{ id: "att-1", outAt: null }, { id: "att-2", outAt: "2026-09-23T12:00:00.000Z" }]).length, 1);
});

test("a refresh keeps someone inside until today's visits arrive", () => {
  const kept = retainInside(
    [{ id: "k", name: "Kusum", inside: false, attendanceId: null }],
    [{ id: "k", name: "Kusum", inside: true, attendanceId: "att-1", inAt: "2026-09-23T11:02:00.000Z" }]
  );
  assert.equal(kept[0].inside, true);
  assert.equal(kept[0].attendanceId, "att-1");
  const fresh = retainInside([{ id: "k", name: "Kusum", inside: false }], []);
  assert.equal(fresh[0].inside, false);
});

test("today follows the India calendar", () => {
  const late = new Date("2026-09-22T19:00:00.000Z");
  assert.equal(indiaDate(late), "2026-09-23");
});
