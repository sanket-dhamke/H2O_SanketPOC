import { FIELD_KIND, fieldEncryptionEnabled, isSealed, sealField } from "./fieldCrypto.js";

// Columns sealed at rest. Model names match the Prisma client. Table names
// match Prisma's default Postgres names. Adding a column here is enough for
// the boot job; the query middleware uses FIELD_KIND for reads and writes.
export const ENCRYPTED_COLUMNS = [
  { model: "user", table: "User", fields: ["email", "phone"] },
  { model: "flat", table: "Flat", fields: ["guardianEmail", "guardianPhone"] },
  { model: "visitor", table: "Visitor", fields: ["phone", "vehicleNo"] },
  { model: "staffAttendance", table: "StaffAttendance", fields: ["phone"] },
  { model: "rentAgreement", table: "RentAgreement", fields: ["tenantEmail", "tenantPhone", "ownerPhone"] },
  { model: "gatePass", table: "GatePass", fields: ["guestPhone", "vehicleNo"] },
  { model: "societyAccount", table: "SocietyAccount", fields: ["accountNumber", "ifsc", "upiId", "razorpayAccountId"] },
  { model: "bill", table: "Bill", fields: ["orderId", "paymentRef", "collectorPhone"] },
  { model: "payment", table: "Payment", fields: ["ref", "collectorPhone"] },
  { model: "booking", table: "Booking", fields: ["orderId", "paymentRef"] },
  { model: "platformSetting", table: "PlatformSetting", fields: ["contactEmail", "accountNumber", "ifsc", "upiId"] },
  { model: "platformPayment", table: "PlatformPayment", fields: ["orderId", "paymentRef"] },
  { model: "serviceContact", table: "ServiceContact", fields: ["phone", "altPhone"] },
  { model: "serviceProvider", table: "ServiceProvider", fields: ["phone"] },
  { model: "serviceBooking", table: "ServiceBooking", fields: ["startOtp", "completeOtp"] },
  { model: "worker", table: "Worker", fields: ["phone", "idProof"] },
  { model: "occupancyMove", table: "OccupancyMove", fields: ["email", "phone"] },
  { model: "vendorBill", table: "VendorBill", fields: ["paymentRef"] },
  { model: "venueBooking", table: "VenueBooking", fields: ["vendorEmail", "vendorPhone", "paymentRef", "paymentLinkId"] },
];

function ident(name) {
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name)) throw new Error(`Unsafe identifier ${name}`);
  return `"${name}"`;
}

// Seals plaintext personal data already in the database. Encrypted rows are
// left untouched. Safe to run on every boot and safe to re-run after a restore.
// Does not delete or rewrite passwords.
export async function encryptStoredSecrets(client) {
  if (!fieldEncryptionEnabled()) return 0;
  let changed = 0;
  for (const spec of ENCRYPTED_COLUMNS) {
    if (!client[spec.model]) continue;
    const fields = spec.fields.filter((name) => FIELD_KIND[name]);
    if (!fields.length) continue;
    const where = fields
      .map((name) => `(${ident(name)} IS NOT NULL AND ${ident(name)} <> '' AND ${ident(name)} NOT LIKE 'enc:v1:%')`)
      .join(" OR ");
    let rows;
    try {
      rows = await client.$queryRawUnsafe(
        `SELECT ${ident("id")}, ${fields.map(ident).join(", ")} FROM ${ident(spec.table)} WHERE ${where}`
      );
    } catch (e) {
      console.error(`[security] skip ${spec.table}: ${e.message}`);
      continue;
    }
    for (const row of rows) {
      const data = {};
      for (const name of fields) {
        const value = row[name];
        if (typeof value !== "string" || !value || isSealed(value)) continue;
        data[name] = sealField(name, value);
      }
      if (!Object.keys(data).length) continue;
      await client[spec.model].update({ where: { id: row.id }, data });
      changed += Object.keys(data).length;
    }
  }
  return changed;
}
