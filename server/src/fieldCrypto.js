import crypto from "crypto";

// Field encryption for personal data stored in Postgres.
//
// Passwords are NOT encrypted here. passwordHash and resetOtpHash are bcrypt
// one-way hashes; a reversible cipher would make a database copy usable as a
// password list. Card numbers are not stored at all — Razorpay holds those.
//
// Emails, phone numbers and Razorpay order ids are sealed with deterministic
// AES-256-GCM so login and other exact lookups still match. Bank accounts,
// UPI ids, payment references and visit codes use a random IV, because nothing
// searches them by value. The key is DATA_ENCRYPTION_KEY on the server only.
// It is never sent to the app. Rows written before the key was set stay
// readable (no enc:v1: prefix) and are sealed on the next boot.

export const PREFIX = "enc:v1:";

// lookup: same plaintext always produces the same ciphertext (exact match).
// secret: a new IV every write (not used in SQL equality filters).
export const FIELD_KIND = {
  email: "lookup",
  guardianEmail: "lookup",
  vendorEmail: "lookup",
  tenantEmail: "lookup",
  contactEmail: "lookup",
  phone: "lookup",
  guardianPhone: "lookup",
  vendorPhone: "lookup",
  tenantPhone: "lookup",
  ownerPhone: "lookup",
  altPhone: "lookup",
  collectorPhone: "lookup",
  guestPhone: "lookup",
  orderId: "lookup",
  accountNumber: "secret",
  ifsc: "secret",
  upiId: "secret",
  razorpayAccountId: "secret",
  paymentRef: "secret",
  paymentLinkId: "secret",
  ref: "secret",
  vehicleNo: "secret",
  idProof: "secret",
  startOtp: "secret",
  completeOtp: "secret",
};

// Prisma JSON columns. Never walk into these — a nested "email" key inside a
// receipt breakdown is not a column we seal.
const JSON_COLUMNS = new Set(["breakdown", "moveInChecks", "moveOutChecks", "meta"]);

export function fieldEncryptionEnabled() {
  return !!(process.env.DATA_ENCRYPTION_KEY || "").trim();
}

export function encryptionKey() {
  const secret = (process.env.DATA_ENCRYPTION_KEY || "").trim();
  if (!secret) return null;
  return crypto.createHash("sha256").update(`gatezo-field-v1\0${secret}`).digest();
}

export function isSealed(value) {
  return typeof value === "string" && value.startsWith(PREFIX);
}

function lookupIv(key, field, plain) {
  return crypto.createHmac("sha256", key).update(`lookup\0${field}\0${plain}`).digest().subarray(0, 12);
}

export function sealValue(plain, field, key, { random = false } = {}) {
  if (plain == null) return plain;
  const text = String(plain);
  if (!text || isSealed(text) || !key) return text;
  const iv = random ? crypto.randomBytes(12) : lookupIv(key, field, text);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ct]).toString("base64url");
}

export function openValue(value, key) {
  if (value == null || typeof value !== "string" || !isSealed(value)) return value;
  if (!key) {
    const err = new Error("DATA_ENCRYPTION_KEY is required to read encrypted data");
    err.code = "FIELD_KEY_MISSING";
    throw err;
  }
  const raw = Buffer.from(value.slice(PREFIX.length), "base64url");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ct = raw.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

export function sealField(field, plain) {
  const kind = FIELD_KIND[field];
  if (!kind) return plain;
  return sealValue(plain, field, encryptionKey(), { random: kind === "secret" });
}

export function open(value) {
  return openValue(value, encryptionKey());
}

function isPlain(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (value instanceof Date || Buffer.isBuffer(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function sealLookupFilter(field, value) {
  if (typeof value === "string") return sealField(field, value);
  if (Array.isArray(value)) {
    return value.map((item) => (typeof item === "string" ? sealField(field, item) : item));
  }
  if (!isPlain(value)) return value;
  // contains / startsWith cannot match ciphertext. Leave those clauses as the
  // caller wrote them. Exact equals / in are sealed so login still works.
  const out = { ...value };
  if (typeof out.equals === "string") out.equals = sealField(field, out.equals);
  if (Array.isArray(out.in)) out.in = out.in.map((item) => (typeof item === "string" ? sealField(field, item) : item));
  if (Array.isArray(out.notIn)) {
    out.notIn = out.notIn.map((item) => (typeof item === "string" ? sealField(field, item) : item));
  }
  if (typeof out.not === "string") out.not = sealField(field, out.not);
  else if (out.not && typeof out.not === "object") out.not = sealLookupFilter(field, out.not);
  return out;
}

export function sealWhere(node) {
  if (Array.isArray(node)) {
    node.forEach(sealWhere);
    return;
  }
  if (!isPlain(node)) return;
  for (const [key, value] of Object.entries(node)) {
    if (FIELD_KIND[key] === "lookup") node[key] = sealLookupFilter(key, value);
    else if (value && typeof value === "object") sealWhere(value);
  }
}

export function sealData(node) {
  if (Array.isArray(node)) {
    node.forEach(sealData);
    return;
  }
  if (!isPlain(node)) return;
  for (const [key, value] of Object.entries(node)) {
    if (typeof value === "string" && FIELD_KIND[key]) {
      node[key] = sealField(key, value);
      continue;
    }
    if (value == null || typeof value !== "object" || JSON_COLUMNS.has(key)) continue;
    if (key === "where") {
      sealWhere(value);
      continue;
    }
    sealData(value);
  }
}

export function protectQueryArgs(args) {
  if (!args || typeof args !== "object") return args;
  if (args.where) sealWhere(args.where);
  if (args.data) sealData(args.data);
  if (args.create) sealData(args.create);
  if (args.update) sealData(args.update);
  return args;
}

export function openResult(value) {
  if (Array.isArray(value)) return value.map(openResult);
  if (!isPlain(value)) return value;
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string" && FIELD_KIND[key]) value[key] = open(item);
    else if (item && typeof item === "object" && !JSON_COLUMNS.has(key)) openResult(item);
  }
  return value;
}
