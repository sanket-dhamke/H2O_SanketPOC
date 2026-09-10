import test from "node:test";
import assert from "node:assert/strict";
import { parseCsv } from "../src/csv.js";
import { normaliseImportRows, importTemplate } from "../src/importCsv.js";

const run = (csv, opts) => normaliseImportRows(parseCsv(csv), opts);
const messages = (errors) => errors.map((e) => e.message).join(" | ");

test("reads the documented society template", () => {
  const { records, errors } = run(importTemplate("society"));
  assert.equal(records.length, 4);
  assert.equal(errors.length, 0);

  const [owner, tenant, noLogin, guard] = records;
  assert.equal(owner.flatNo, "A-101");
  assert.equal(owner.block, "A");
  assert.equal(owner.email, "ravi@example.com");
  assert.equal(owner.role, "resident");
  assert.equal(owner.occupancy, "owner");

  assert.equal(tenant.occupancy, "rented");
  assert.equal(tenant.rentMaintenanceAmount, 3500);
  assert.equal(tenant.memberName, "Priya Shah");

  assert.equal(noLogin.email, "", "a row with no email creates a unit but no login");
  assert.equal(noLogin.flatNo, "B-201");

  assert.equal(guard.role, "guard");
  assert.equal(guard.flatNo, "", "staff rows carry no unit");
});

test("reads the preschool template with guardian columns", () => {
  const { records, errors } = run(importTemplate("preschool"));
  assert.equal(errors.length, 0);
  assert.equal(records.length, 3);
  assert.equal(records[0].flatNo, "Aarav Sharma");
  assert.equal(records[0].block, "Jr KG");
  assert.equal(records[0].guardianName, "Meera Sharma");
  assert.equal(records[0].guardianPhone, "9876543210");
  assert.equal(records[0].email, "meera@example.com");
});

test("accepts spaced, capitalised and aliased headers", () => {
  const { records, errors } = run(
    ["Flat No,Wing,Owner Name,Owner Email,Mobile", "C-303,C,Asha Menon,ASHA@Example.COM ,9876500000"].join("\n")
  );
  assert.equal(errors.length, 0);
  assert.equal(records[0].flatNo, "C-303");
  assert.equal(records[0].block, "C");
  assert.equal(records[0].ownerName, "Asha Menon");
  assert.equal(records[0].email, "asha@example.com", "emails are trimmed and lowercased");
  assert.equal(records[0].phone, "9876500000");
});

test("keeps quoted commas inside a single field", () => {
  const { records } = run(['flatNo,ownerName', 'D-404,"Rao, Sneha"'].join("\n"));
  assert.equal(records[0].ownerName, "Rao, Sneha");
});

test("rejects a resident row with no unit but allows staff without one", () => {
  const { records, errors } = run(
    ["flatNo,email,role", ",nounit@example.com,resident", ",guard@example.com,guard", ",boss@example.com,admin"].join("\n")
  );
  assert.equal(records.length, 2);
  assert.deepEqual(records.map((r) => r.role), ["guard", "admin"]);
  assert.equal(errors.length, 1);
  assert.match(messages(errors), /Row 2: missing flat\/unit/);
});

test("flags a duplicate email inside the same file only once", () => {
  const { records, errors } = run(
    ["flatNo,email", "A-1,dup@example.com", "A-2,dup@example.com"].join("\n")
  );
  assert.equal(records.length, 1);
  assert.equal(records[0].flatNo, "A-1");
  assert.match(messages(errors), /Row 3: dup@example.com appears more than once/);
});

test("rejects a malformed email rather than creating a broken login", () => {
  const { records, errors } = run(["flatNo,email", "A-1,not-an-email"].join("\n"));
  assert.equal(records.length, 0);
  assert.match(messages(errors), /is not a valid email/);
});

test("enforces the password policy on supplied passwords", () => {
  const { records, errors } = run(["flatNo,email,password", "A-1,a@example.com,weak"].join("\n"));
  assert.equal(records.length, 0);
  assert.match(messages(errors), /password rejected/);

  const ok = run(["flatNo,email,password", "A-1,a@example.com,Str0ngPass"].join("\n"));
  assert.equal(ok.errors.length, 0);
  assert.equal(ok.records[0].password, "Str0ngPass");
});

test("treats an unknown role as a resident and says so", () => {
  const { records, errors } = run(["flatNo,email,role", "A-1,a@example.com,chairman"].join("\n"));
  assert.equal(records[0].role, "resident");
  assert.match(messages(errors), /unknown role "chairman"/);
});

test("parses rent amounts with currency formatting and flags junk", () => {
  const { records, errors } = run(
    ["flatNo,occupancy,rentAmount", "A-1,tenant,\"₹3,500\"", "A-2,owner,abc"].join("\n")
  );
  assert.equal(records[0].occupancy, "rented");
  assert.equal(records[0].rentMaintenanceAmount, 3500);
  assert.equal(records[1].rentMaintenanceAmount, null);
  assert.match(messages(errors), /"abc" is not a number/);
});

test("createResidents:false imports units without any logins", () => {
  const { records } = run(["flatNo,email", "A-1,a@example.com"].join("\n"), { createResidents: false });
  assert.equal(records.length, 1);
  assert.equal(records[0].email, "");
});

test("line numbers point at the spreadsheet row the admin sees", () => {
  const { errors } = run(["flatNo,email", "A-1,ok@example.com", ",,", "A-3,bad-email"].join("\n"));
  // Row 3 is blank and dropped by the CSV parser, so the bad email is row 4.
  assert.match(messages(errors), /Row 4/);
});

test("handles a few hundred rows without duplicate or dropped records", () => {
  const rows = Array.from({ length: 400 }, (_, i) => `A-${i + 1},A,Owner ${i + 1},owner${i + 1}@example.com`);
  const { records, errors } = run(["flatNo,block,ownerName,email", ...rows].join("\n"));
  assert.equal(records.length, 400);
  assert.equal(errors.length, 0);
  assert.equal(new Set(records.map((r) => r.email)).size, 400);
});
