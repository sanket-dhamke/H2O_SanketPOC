import test from "node:test";
import assert from "node:assert/strict";
import {
  financialYear,
  dateLocked,
  nextInvoiceNo,
  ageingDays,
  ledgerBalance,
  reconcile,
  visitorsInside,
  emptyFlatVisits,
  duplicateHelpers,
  monthReport,
  duesRows,
  toCsv,
  tallyXml,
} from "../src/books.js";

test("the Indian financial year starts in April", () => {
  assert.equal(financialYear(new Date("2026-10-29T00:00:00+05:30")).label, "FY 2026-2027");
  assert.equal(financialYear(new Date("2026-03-01T00:00:00+05:30")).label, "FY 2025-2026");
});

test("a locked year refuses earlier vouchers and keeps later ones", () => {
  assert.equal(dateLocked("2026-03-31", "2026-03-31"), true);
  assert.equal(dateLocked("2026-04-01", "2026-03-31"), false);
  assert.equal(dateLocked("2026-04-01", null), false);
});

test("invoice numbers climb and tally lists each voucher", () => {
  assert.equal(nextInvoiceNo("INV", 7, 2026), "INV-2026-0007");
  const xml = tallyXml([{ kind: "expense", amount: 500, date: "2026-10-02", ledger: "Vendor expense", narration: "Security" }], "Paritosh");
  assert.match(xml, /<DATE>20261002<\/DATE>/);
  assert.match(xml, /<AMOUNT>-500<\/AMOUNT>/);
  assert.match(xml, /Paritosh/);
});

test("bank reconciliation is statement minus the voucher book", () => {
  const book = ledgerBalance([
    { kind: "income", amount: 1000 },
    { kind: "expense", amount: 250 },
  ]);
  assert.equal(book, 750);
  assert.deepEqual(reconcile(800, book), { statementBalance: 800, ledgerBalance: 750, difference: 50 });
});

test("a complaint's age is whole days since it was raised", () => {
  const created = new Date("2026-10-01T00:00:00.000Z").getTime();
  const now = new Date("2026-10-29T00:00:00.000Z").getTime();
  assert.equal(ageingDays(created, now), 28);
});

test("gate reports keep people still inside and visits to empty flats", () => {
  const visitors = [
    { id: "a", status: "approved", exitAt: null, flatId: "empty" },
    { id: "b", status: "approved", exitAt: "2026-10-02", flatId: "lived" },
    { id: "c", status: "rejected", exitAt: null, flatId: "empty" },
  ];
  assert.deepEqual(visitorsInside(visitors).map((v) => v.id), ["a"]);
  assert.deepEqual(emptyFlatVisits(visitors, ["lived"]).map((v) => v.id), ["a", "c"]);
});

test("duplicate helpers and the month's dues report", () => {
  const dupes = duplicateHelpers([
    { name: "Rani", phone: "9876543210" },
    { name: "Rani", phone: "9000000000" },
  ]);
  assert.equal(dupes[0].reason, "same name");
  const report = monthReport(
    [{ period: "2026-10", amount: 1000, lateFee: 0, paid: 700 }],
    "2026-10"
  );
  assert.equal(report.pending, 300);
  assert.equal(report.collectedPct, 70);
  const dues = duesRows(
    [{ flatId: "f1", amount: 400, lateFee: 0, paid: 0 }],
    [{ id: "f1", flatNo: "A-101", block: "A" }]
  );
  assert.equal(dues[0].flatNo, "A-101");
  assert.match(toCsv(dues, ["flatNo", "pending"]), /A-101,400/);
});
