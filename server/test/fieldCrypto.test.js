import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";

process.env.DATA_ENCRYPTION_KEY = "test-only-field-key";

import {
  encryptionKey,
  fieldEncryptionEnabled,
  open,
  openValue,
  protectQueryArgs,
  sealField,
  sealValue,
} from "../src/fieldCrypto.js";

const key = encryptionKey();

test("a key enables field encryption", () => {
  assert.equal(fieldEncryptionEnabled(), true);
  assert.equal(key?.length, 32);
});

test("emails seal deterministically and open back to the same address", () => {
  const a = sealField("email", "resident@h2o.com");
  const b = sealField("email", "resident@h2o.com");
  assert.equal(a, b);
  assert.ok(a.startsWith("enc:v1:"));
  assert.equal(open(a), "resident@h2o.com");
  assert.notEqual(sealField("phone", "resident@h2o.com"), a);
});

test("payment references are sealed with a fresh IV each time", () => {
  const a = sealField("paymentRef", "pay_demo_123");
  const b = sealField("paymentRef", "pay_demo_123");
  assert.notEqual(a, b);
  assert.equal(open(a), "pay_demo_123");
  assert.equal(open(b), "pay_demo_123");
});

test("legacy plaintext is still readable and blank values stay blank", () => {
  assert.equal(open("resident@h2o.com"), "resident@h2o.com");
  assert.equal(sealField("email", ""), "");
  assert.equal(sealField("phone", null), null);
  assert.equal(sealValue("resident@h2o.com", "email", null), "resident@h2o.com");
});

test("login lookup seals the email and leaves a partial search alone", () => {
  const args = {
    where: {
      OR: [
        { email: { contains: "gate", mode: "insensitive" } },
        { email: "resident@h2o.com" },
        { phone: { not: "" } },
        { phone: { in: ["9811110001", ""] } },
      ],
    },
    orderBy: { email: "asc" },
  };
  protectQueryArgs(args);
  assert.equal(args.where.OR[0].email.contains, "gate");
  assert.equal(open(args.where.OR[1].email), "resident@h2o.com");
  assert.equal(args.where.OR[2].phone.not, "");
  assert.equal(open(args.where.OR[3].phone.in[0]), "9811110001");
  assert.equal(args.where.OR[3].phone.in[1], "");
  assert.equal(args.orderBy.email, "asc");
});

test("passwords stay a bcrypt hash and are not reversible", () => {
  const hash = bcrypt.hashSync("Password123", 10);
  const args = {
    data: {
      email: "resident@h2o.com",
      phone: "97777 00001",
      passwordHash: hash,
      resetOtpHash: hash,
    },
  };
  protectQueryArgs(args);
  assert.equal(args.data.passwordHash, hash);
  assert.equal(args.data.resetOtpHash, hash);
  assert.ok(args.data.passwordHash.startsWith("$2"));
  assert.equal(open(hash), hash);
  assert.equal(bcrypt.compareSync("Password123", args.data.passwordHash), true);
  assert.equal(open(args.data.email), "resident@h2o.com");
  assert.equal(open(args.data.phone), "97777 00001");
  assert.throws(() => openValue(args.data.email, Buffer.alloc(32)), /unable to authenticate|Unsupported state/i);
});

test("nested writes seal contact fields and leave receipt JSON alone", () => {
  const args = {
    data: {
      user: { create: { email: "admin@h2o.com", name: "Society Admin" } },
      breakdown: [{ head: "Maintenance", email: "not-a-column@h2o.com" }],
      accountNumber: "50100123456789",
    },
  };
  protectQueryArgs(args);
  assert.equal(open(args.data.user.create.email), "admin@h2o.com");
  assert.equal(args.data.user.create.name, "Society Admin");
  assert.equal(args.data.breakdown[0].email, "not-a-column@h2o.com");
  assert.equal(open(args.data.accountNumber), "50100123456789");
});
