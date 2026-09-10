import { validatePassword } from "./passwordPolicy.js";

// CSV bulk-onboarding rules, kept out of the route so they can be unit-tested
// and reused (society admin today, superadmin tenant onboarding later).

export const MAX_IMPORT_ROWS = 3000;

// bcryptjs is pure JavaScript, so hashSync blocks the event loop — at cost 10 a
// 300-member import would freeze the entire API for ~50 seconds. Bulk imports
// hash asynchronously and at a lower cost: a deliberate trade-off, since these
// are generated temporary passwords handed to the admin to distribute, not
// long-lived secrets. Individually created accounts still use the default 10.
export const BULK_HASH_ROUNDS = Number(process.env.BULK_HASH_ROUNDS || 8);

// Compliant temporary password for bulk-created members.
export function tempPassword() {
  return "H2o" + Math.floor(1000 + Math.random() * 9000) + "x!";
}

// Accepted CSV headers, case- and space-insensitive (parseCsv lowercases and
// strips whitespace, so "Flat No" arrives as "flatno"). Every column except the
// unit itself is optional, and one file shape works for societies and preschools.
export const IMPORT_COLUMNS = {
  flatNo: ["flatno", "flat", "flatnumber", "unit", "unitno", "studentname", "student", "rollno", "roll"],
  block: ["block", "wing", "class", "classroom"],
  ownerName: ["ownername", "owner"],
  occupancy: ["occupancy", "ownerortenant"],
  rentMaintenanceAmount: ["rentmaintenanceamount", "rentamount", "rent"],
  memberName: ["membername", "residentname", "resident", "parentname", "name"],
  email: ["email", "owneremail", "memberemail", "residentemail", "parentemail"],
  phone: ["phone", "ownerphone", "mobile", "memberphone", "residentphone"],
  role: ["role", "accounttype"],
  password: ["password", "temppassword"],
  guardianName: ["guardianname", "guardian"],
  guardianPhone: ["guardianphone"],
  guardianEmail: ["guardianemail"],
};

export const IMPORT_ROLES = new Set(["resident", "guard", "admin"]);

// First non-empty value among a column's accepted aliases.
function pick(row, aliases) {
  for (const alias of aliases) {
    const value = row[alias];
    if (value != null && String(value).trim() !== "") return String(value).trim();
  }
  return "";
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Turns raw CSV rows into validated records without touching the DB, so the
// same pass serves both the dry-run preview and the real import.
// Returns { records, errors } where each error is { line, field, message }.
export function normaliseImportRows(rows, { createResidents = true } = {}) {
  const records = [];
  const errors = [];
  const seenEmails = new Set();

  rows.forEach((raw, i) => {
    const row = raw || {};
    // parseCsv records the real spreadsheet line (blank rows are dropped, so a
    // positional guess would drift). Fall back for callers passing plain rows.
    const line = row.__line ?? i + 2;
    const get = (key) => pick(row, IMPORT_COLUMNS[key]);

    const roleRaw = get("role").toLowerCase();
    const role = IMPORT_ROLES.has(roleRaw) ? roleRaw : "resident";
    if (roleRaw && !IMPORT_ROLES.has(roleRaw)) {
      errors.push({ line, field: "role", message: `Row ${line}: unknown role "${roleRaw}" — treated as a resident` });
    }

    const flatNo = get("flatNo");
    // Guards and admins hold no unit, so they may omit it. Residents cannot.
    if (!flatNo && role === "resident") {
      errors.push({ line, field: "flatNo", message: `Row ${line}: missing flat/unit — row skipped` });
      return;
    }

    const email = get("email").toLowerCase();
    if (email && !EMAIL_RE.test(email)) {
      errors.push({ line, field: "email", message: `Row ${line}: "${email}" is not a valid email — row skipped` });
      return;
    }
    if (email && seenEmails.has(email)) {
      errors.push({ line, field: "email", message: `Row ${line}: ${email} appears more than once in this file — only the first is used` });
      return;
    }
    if (email) seenEmails.add(email);

    const password = get("password");
    if (password) {
      const policyError = validatePassword(password);
      if (policyError) {
        errors.push({ line, field: "password", message: `Row ${line}: password rejected (${policyError})` });
        return;
      }
    }

    const occupancyRaw = get("occupancy").toLowerCase();
    const occupancy = ["rented", "rent", "tenant"].includes(occupancyRaw)
      ? "rented"
      : occupancyRaw
        ? "owner"
        : null;

    // Strip only currency formatting — stripping every non-digit would turn a
    // typo like "abc" into an empty string, which Number() reads as a silent ₹0.
    const rentRaw = get("rentMaintenanceAmount");
    const rentCleaned = rentRaw.replace(/[₹,\s]/g, "");
    const rentAmount = rentCleaned === "" ? NaN : Number(rentCleaned);
    if (rentRaw && !Number.isFinite(rentAmount)) {
      errors.push({ line, field: "rentMaintenanceAmount", message: `Row ${line}: "${rentRaw}" is not a number — rent ignored` });
    }

    records.push({
      line,
      flatNo,
      block: get("block") || null,
      ownerName: get("ownerName") || null,
      occupancy,
      rentMaintenanceAmount: Number.isFinite(rentAmount) ? rentAmount : null,
      guardianName: get("guardianName") || null,
      guardianPhone: get("guardianPhone") || null,
      guardianEmail: get("guardianEmail") || null,
      role,
      email: createResidents ? email : "",
      memberName: get("memberName") || get("ownerName") || null,
      phone: get("phone") || null,
      password,
    });
  });

  return { records, errors };
}

// A ready-to-fill CSV so admins never have to guess the column names.
export function importTemplate(orgType) {
  if (orgType === "preschool") {
    return [
      "studentName,class,guardianName,guardianPhone,email,phone",
      "Aarav Sharma,Jr KG,Meera Sharma,9876543210,meera@example.com,9876543210",
      "Diya Patel,Nursery,Rohit Patel,9812345678,rohit@example.com,9812345678",
      "Kabir Nair,Sr KG,Anita Nair,9800011122,,",
    ].join("\n");
  }
  return [
    "flatNo,block,ownerName,occupancy,rentMaintenanceAmount,memberName,email,phone,role",
    "A-101,A,Ravi Kumar,owner,,Ravi Kumar,ravi@example.com,9876543210,resident",
    "A-102,A,Sneha Rao,rented,3500,Priya Shah,priya@example.com,9811111111,resident",
    "B-201,B,Imran Shaikh,owner,,,,9812345678,",
    ",,,,,Ramesh Yadav,ramesh@example.com,9800000000,guard",
  ].join("\n");
}
