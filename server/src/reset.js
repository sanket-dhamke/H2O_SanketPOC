import "dotenv/config";
import readline from "readline";
import { prisma } from "./prisma.js";

// Wipes ALL tenant/app data for a clean testing slate, while PRESERVING:
//   - every superadmin (GateMate owner) login
//   - the platform settings singleton (owner contact + bank/UPI details)
//
// Everything else — societies/preschools, flats, admins/guards/residents,
// bills, payments, visitors, bookings, tickets, listings, gate logs, etc. — is
// removed. After running, the owner can log in and build fresh data.
//
// Usage:
//   node src/reset.js            (asks for confirmation)
//   node src/reset.js --yes      (no prompt — for scripts/CI)
//   npm run db:reset -- --yes

// Deleted child-first so foreign keys never block, even without relying on
// cascade. deleteMany on an already-empty table is a harmless no-op.
const DELETE_ORDER = [
  "listingMessage",
  "listing",
  "ticketComment",
  "ticket",
  "booking",
  "amenitySlot",
  "amenity",
  "vehicleEntry",
  "vehicle",
  "gateDevice",
  "gatePass",
  "payment",
  "bill",
  "visitor",
  "staffAttendance",
  "rentAgreement",
  "post",
  "announcement",
  "expense",
  "societyAccount",
  "billingSetting",
  "maintenanceHead",
  "venueBooking",
  "platformPayment",
  "backupLog",
  // users (except superadmins) and then flats/societies are handled explicitly below
];

function confirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a); }));
}

async function main() {
  const auto = process.argv.includes("--yes");

  const superadmins = await prisma.user.findMany({ where: { role: "superadmin" }, select: { email: true } });
  const societies = await prisma.society.count();
  const users = await prisma.user.count();

  console.log("This will DELETE all app data and keep only:");
  console.log(`  - ${superadmins.length} superadmin login(s): ${superadmins.map((s) => s.email).join(", ") || "(none!)"}`);
  console.log("  - platform settings (owner contact / bank details)");
  console.log(`\nAbout to remove: ${societies} societ(y/ies), ${users - superadmins.length} non-owner user(s), and all bills/visitors/bookings/etc.`);
  console.log(`Target DB: ${(process.env.DATABASE_URL || "").replace(/:\/\/.*@/, "://***@")}`);

  if (superadmins.length === 0) {
    console.error("\nAborting: no superadmin found — refusing to wipe (you'd be locked out).");
    process.exit(1);
  }

  if (!auto) {
    const ans = await confirm("\nType 'reset' to permanently wipe: ");
    if (ans.trim() !== "reset") {
      console.log("Aborted.");
      process.exit(0);
    }
  }

  for (const model of DELETE_ORDER) {
    if (!prisma[model]) continue;
    const { count } = await prisma[model].deleteMany();
    if (count) console.log(`  cleared ${model}: ${count}`);
  }

  // Remove all non-superadmin users, then flats, then societies.
  const delUsers = await prisma.user.deleteMany({ where: { role: { not: "superadmin" } } });
  if (delUsers.count) console.log(`  cleared users (non-owner): ${delUsers.count}`);
  const delFlats = await prisma.flat.deleteMany();
  if (delFlats.count) console.log(`  cleared flats: ${delFlats.count}`);
  const delSoc = await prisma.society.deleteMany();
  if (delSoc.count) console.log(`  cleared societies: ${delSoc.count}`);

  const remainingUsers = await prisma.user.count();
  const remainingSoc = await prisma.society.count();
  console.log(`\nDone. Remaining: ${remainingUsers} user(s) (superadmin only), ${remainingSoc} societ(y/ies).`);
  console.log("The testing team can now log in as the owner and create fresh societies/preschools.");
}

main()
  .catch((e) => {
    console.error("Reset failed:", e.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
