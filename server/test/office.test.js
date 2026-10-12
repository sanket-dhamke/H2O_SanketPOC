import test from "node:test";
import assert from "node:assert/strict";
import { moneySplits, collectionMonths, serializeMove, serializeVendorBill } from "../src/office.js";

test("overdue vs pending vs advance splits", () => {
  const now = new Date("2026-10-12T10:00:00Z");
  const bills = [
    { amount: 3000, lateFee: 0, paidAmount: 0, status: "pending", dueDate: "2026-09-10", period: "2026-09" },
    { amount: 3000, lateFee: 0, paidAmount: 0, status: "pending", dueDate: "2026-10-20", period: "2026-10" },
    { amount: 3000, lateFee: 0, paidAmount: 3000, status: "paid", dueDate: "2026-11-10", period: "2026-11" },
  ];
  const s = moneySplits(bills, now);
  assert.equal(s.pending, 6000);
  assert.equal(s.overdue, 3000);
  assert.equal(s.advance, 3000);
  assert.equal(s.collected, 3000);
});

test("collection months include current period", () => {
  const now = new Date("2026-10-12T10:00:00Z");
  const months = collectionMonths(
    [{ amount: 1000, lateFee: 0, paidAmount: 400, status: "partial", period: "2026-10" }],
    now,
    2
  );
  assert.equal(months.length, 2);
  const oct = months.find((m) => m.period === "2026-10");
  assert.equal(oct.invoiced, 1000);
  assert.equal(oct.collected, 400);
  assert.equal(oct.pending, 600);
});

test("serializers keep tenant fields", () => {
  const move = serializeMove(
    {
      id: "m1",
      flatId: "f1",
      kind: "move_in",
      residentName: "Aarav",
      phone: "999",
      email: null,
      date: "2026-10-01",
      notes: null,
      depositAmount: 50000,
      createdAt: new Date("2026-10-01"),
    },
    "A-101"
  );
  assert.equal(move.flatNo, "A-101");
  assert.equal(move.kind, "move_in");
  const v = serializeVendorBill({
    id: "v1",
    vendorName: "SecureCo",
    category: "security",
    description: null,
    amount: 18000,
    dueDate: "2026-10-05",
    status: "unpaid",
    paidAt: null,
    paymentRef: null,
    createdAt: new Date(),
  });
  assert.equal(v.amount, 18000);
  assert.equal(v.status, "unpaid");
});
