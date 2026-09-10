import test from "node:test";
import assert from "node:assert/strict";
import { resolveFlat, fallbackParseVisitor } from "../src/ai.js";

// The guard's voice path has two halves that must work without any AI provider:
// resolving a spoken unit onto a real flat, and the heuristic field parser that
// runs when the LLM is unreachable. Both are pure functions, so they are tested
// here directly; the LLM prompt itself is exercised manually against a key.

const FLATS = ["A-101", "A-102", "B-201", "B-202", "C-1002"];

test("matches a flat however the guard's words come through", () => {
  for (const spoken of ["A-101", "a 101", "A101", "a-101 ", "A - 101"]) {
    assert.equal(resolveFlat(spoken, FLATS), "A-101", `failed for "${spoken}"`);
  }
});

test("accepts a bare unit number when only one flat could mean it", () => {
  assert.equal(resolveFlat("1002", FLATS), "C-1002");
  assert.equal(resolveFlat("101", FLATS), "A-101");
});

test("refuses to guess when a bare number is ambiguous", () => {
  const twoWings = ["A-101", "B-101"];
  assert.equal(resolveFlat("101", twoWings), "", "should not pick a wing at random");
});

test("finds the flat inside a longer phrase", () => {
  assert.equal(resolveFlat("wing A flat 101", FLATS), "A-101");
  assert.equal(resolveFlat("", FLATS), "");
  assert.equal(resolveFlat("Z-999", FLATS), "", "an unknown unit stays unmatched");
});

test("parses a natural spoken sentence", () => {
  const f = fallbackParseVisitor("Ramesh Kumar to A-101, delivery, 9876543210", FLATS);
  assert.equal(f.name, "Ramesh Kumar");
  assert.equal(f.flatNo, "A-101");
  assert.equal(f.purpose, "Delivery");
  assert.equal(f.phone, "9876543210");
});

test("parses dictated labels without leaking the label into the value", () => {
  const f = fallbackParseVisitor(
    "Name: Ramesh Kumar, flat: A-101, vehicle no: MH12AB1234, purpose: delivery",
    FLATS
  );
  assert.equal(f.name, "Ramesh Kumar", "the word 'name' must not end up in the name");
  assert.equal(f.flatNo, "A-101");
  assert.equal(f.vehicleNo, "MH12AB1234");
  assert.equal(f.purpose, "Delivery");
});

test("picks up an Indian number plate spoken with spaces", () => {
  const f = fallbackParseVisitor("Suresh, B-201, car MH 12 AB 1234", FLATS);
  assert.equal(f.vehicleNo, "MH12AB1234");
  assert.equal(f.flatNo, "B-201");
});

test("converts Devanagari digits so Hindi speech still resolves a flat", () => {
  const f = fallbackParseVisitor("रमेश A-१०१ डिलिवरी", FLATS);
  assert.equal(f.flatNo, "A-101");
  assert.equal(f.purpose, "Delivery");
});

test("infers the purpose from common wording", () => {
  assert.equal(fallbackParseVisitor("Ola cab for A-102", FLATS).purpose, "Cab");
  assert.equal(fallbackParseVisitor("plumber service B-202", FLATS).purpose, "Service");
  assert.equal(fallbackParseVisitor("guest for A-101", FLATS).purpose, "Guest");
});

test("returns empty fields rather than throwing on silence", () => {
  const f = fallbackParseVisitor("", FLATS);
  assert.deepEqual(f, { name: "", phone: "", vehicleNo: "", flatNo: "", purpose: "" });
});
