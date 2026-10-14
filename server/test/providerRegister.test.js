import "dotenv/config";
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/prisma.js";
import {
  normalizeProviderCode,
  cleanProviderSlugs,
  ensureProviderJoinCode,
  rotateProviderJoinCode,
  registerProviderAccount,
  approveProviderAccount,
} from "../src/providerJoin.js";

after(async () => {
  await prisma.$disconnect();
});

test("provider code is separate from a resident code", () => {
  assert.equal(normalizeProviderCode(" sp7k 2qab "), "SP7K2QAB");
  assert.deepEqual(cleanProviderSlugs(["ac", "nope", "cleaning", "ac"]), ["ac", "cleaning"]);
});

test("a professional can self-register with the owner code and waits for approval", async () => {
  const code = await ensureProviderJoinCode();
  assert.match(code, /^SP[A-Z0-9]+$/);

  const wrong = await registerProviderAccount({
    joinCode: "GM7K2Q",
    name: "Wrong Code",
    email: `wrong-${Date.now()}@example.com`,
    phone: "9000000001",
    password: "Password1",
    serviceSlugs: ["ac"],
  });
  assert.equal(wrong.status, 404);

  const email = `pro-${Date.now()}@example.com`;
  const created = await registerProviderAccount({
    joinCode: code.toLowerCase(),
    name: "Ravi AC",
    email,
    phone: "9000000002",
    password: "Password1",
    serviceSlugs: ["ac", "cleaning"],
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.pending, true);

  const user = await prisma.user.findUnique({ where: { email }, include: { serviceProvider: true } });
  assert.equal(user.role, "provider");
  assert.equal(user.pendingApproval, true);
  assert.equal(user.serviceProvider.active, false);
  assert.equal(user.serviceProvider.serviceSlugs, "ac,cleaning");
  assert.equal(user.societyId, null);

  const approved = await approveProviderAccount(user.serviceProvider.id);
  assert.equal(approved.status, 200);
  const signedIn = await prisma.user.findUnique({ where: { email }, include: { serviceProvider: true } });
  assert.equal(signedIn.pendingApproval, false);
  assert.equal(signedIn.serviceProvider.active, true);
  assert.equal(signedIn.serviceProvider.packPaidUntil, null);

  await prisma.user.delete({ where: { id: user.id } });

  const after = await rotateProviderJoinCode();
  assert.notEqual(after, code);
  const stale = await registerProviderAccount({
    joinCode: code,
    name: "Stale",
    email: `stale-${Date.now()}@example.com`,
    phone: "9000000003",
    password: "Password1",
    serviceSlugs: ["salon"],
  });
  assert.equal(stale.status, 404);
  const freshEmail = `fresh-${Date.now()}@example.com`;
  const fresh = await registerProviderAccount({
    joinCode: after,
    name: "Fresh",
    email: freshEmail,
    phone: "9000000004",
    password: "Password1",
    serviceSlugs: ["salon"],
  });
  assert.equal(fresh.status, 201);
  const row = await prisma.user.findUnique({ where: { email: freshEmail } });
  assert.equal(row.pendingApproval, true);
  await prisma.user.delete({ where: { id: row.id } });
});
