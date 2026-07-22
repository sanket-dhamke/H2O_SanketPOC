import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma.js";
import { placeholderPhoto } from "./storage.js";

// Seeds the platform:
//   - 1 superadmin (H2O owner) that can see every society
//   - 2 demo societies, each with its own admins/guards/residents, flats, bills,
//     visitors and expenses, so the super-admin summary shows real numbers.
// Password for every account: Password123
const PASSWORD = "Password123";
const hoursAgo = (h) => new Date(Date.now() - h * 3600 * 1000);

async function main() {
  const hash = bcrypt.hashSync(PASSWORD, 10);

  // Wipe existing data (order matters for FK constraints).
  await prisma.booking.deleteMany();
  await prisma.amenitySlot.deleteMany();
  await prisma.amenity.deleteMany();
  await prisma.post.deleteMany();
  await prisma.announcement.deleteMany();
  await prisma.visitor.deleteMany();
  await prisma.bill.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.societyAccount.deleteMany();
  await prisma.user.deleteMany();
  await prisma.flat.deleteMany();
  await prisma.society.deleteMany();

  // ---- Platform owner (no society) --------------------------------------
  await prisma.user.create({
    data: {
      name: "H2O Owner",
      email: "owner@h2o.com",
      role: "superadmin",
      passwordHash: hash,
      phone: "90000 00000",
      societyId: null,
    },
  });

  /* ======================= Society 1: Green Valley ======================= */
  const green = await prisma.society.create({
    data: { name: "Green Valley Residency", city: "Pune", address: "Baner Road, Pune 411045" },
  });

  const flatA101 = await prisma.flat.create({
    data: { societyId: green.id, flatNo: "A-101", block: "A", ownerName: "Aarav Sharma" },
  });
  const flatA102 = await prisma.flat.create({
    data: { societyId: green.id, flatNo: "A-102", block: "A", ownerName: "Diya Mehta" },
  });
  const flatB201 = await prisma.flat.create({
    data: { societyId: green.id, flatNo: "B-201", block: "B", ownerName: "Rohan Kapoor" },
  });

  await prisma.user.createMany({
    data: [
      { name: "Society Admin", email: "admin@h2o.com", role: "admin", passwordHash: hash, phone: "99999 00001", societyId: green.id },
      { name: "Committee Head", email: "admin2@h2o.com", role: "admin", passwordHash: hash, phone: "99999 00002", societyId: green.id },
      { name: "Gate Guard - Day", email: "guard@h2o.com", role: "guard", passwordHash: hash, phone: "98888 00001", societyId: green.id },
      { name: "Gate Guard - Night", email: "guard2@h2o.com", role: "guard", passwordHash: hash, phone: "98888 00002", societyId: green.id },
      { name: "Aarav Sharma", email: "resident@h2o.com", role: "resident", passwordHash: hash, phone: "97777 00001", societyId: green.id, flatId: flatA101.id },
      { name: "Ananya Sharma", email: "resident1b@h2o.com", role: "resident", passwordHash: hash, phone: "97777 00002", societyId: green.id, flatId: flatA101.id },
      { name: "Diya Mehta", email: "resident2@h2o.com", role: "resident", passwordHash: hash, phone: "97777 00003", societyId: green.id, flatId: flatA102.id },
      { name: "Rohan Kapoor", email: "resident3@h2o.com", role: "resident", passwordHash: hash, phone: "97777 00004", societyId: green.id, flatId: flatB201.id },
    ],
  });
  const greenGuard = await prisma.user.findUnique({ where: { email: "guard@h2o.com" } });

  await prisma.societyAccount.create({
    data: {
      societyId: green.id,
      accountHolderName: "Green Valley Residency Co-op",
      bankName: "HDFC Bank",
      accountNumber: "50100123456789",
      ifsc: "HDFC0001234",
      upiId: "greenvalley@hdfcbank",
      active: true,
    },
  });

  const months = ["2026-05", "2026-06", "2026-07"];
  for (const flat of [flatA101, flatA102, flatB201]) {
    for (let i = 0; i < months.length; i++) {
      const paid = i < 2;
      await prisma.bill.create({
        data: {
          flatId: flat.id,
          period: months[i],
          amount: 1, // Rs.1 for easy payment testing
          dueDate: `${months[i]}-10`,
          status: paid ? "paid" : "pending",
          paidAt: paid ? new Date() : null,
          paymentRef: paid ? `PAY-SEED${i}` : null,
        },
      });
    }
  }

  const greenVisitors = [
    { name: "Rahul Verma", phone: "98200 11223", purpose: "Guest", vehicleNo: "MH12AB1234", status: "pending", createdAt: hoursAgo(0.05), decidedAt: null },
    { name: "Amazon Delivery", phone: "91000 55667", purpose: "Delivery", vehicleNo: "MH14DL7788", status: "leave_at_gate", createdAt: hoursAgo(5), decidedAt: hoursAgo(4.9) },
    { name: "Priya Nair", phone: "99870 33221", purpose: "Guest", vehicleNo: null, status: "approved", createdAt: hoursAgo(26), decidedAt: hoursAgo(25.9) },
    { name: "Ola Cab Driver", phone: "98111 22334", purpose: "Cab", vehicleNo: "KA05MN4321", status: "approved", createdAt: hoursAgo(74), decidedAt: hoursAgo(73.9) },
  ];
  for (const v of greenVisitors) {
    await prisma.visitor.create({
      data: {
        flatId: flatA101.id,
        name: v.name,
        phone: v.phone,
        vehicleNo: v.vehicleNo,
        purpose: v.purpose,
        photoUrl: placeholderPhoto(v.name),
        guardId: greenGuard?.id || null,
        status: v.status,
        createdAt: v.createdAt,
        decidedAt: v.decidedAt,
      },
    });
  }

  await prisma.expense.createMany({
    data: [
      { societyId: green.id, label: "Lift AMC (July)", amount: 3500, date: hoursAgo(240) },
      { societyId: green.id, label: "Garden maintenance", amount: 1200, date: hoursAgo(120) },
    ],
  });

  // Announcements (admin -> everyone) for Green Valley
  await prisma.announcement.createMany({
    data: [
      { societyId: green.id, title: "Water supply maintenance", body: "Water tanks will be cleaned on Sunday 8am-11am. Please store water in advance.", pinned: true, authorName: "Society Admin", createdAt: hoursAgo(20) },
      { societyId: green.id, title: "Diwali decoration committee", body: "Volunteers needed for the lobby decoration. Meet at the clubhouse this Saturday 6pm.", authorName: "Committee Head", createdAt: hoursAgo(70) },
    ],
  });

  // Community board posts (residents)
  const greenR1 = await prisma.user.findUnique({ where: { email: "resident@h2o.com" } });
  const greenR2 = await prisma.user.findUnique({ where: { email: "resident2@h2o.com" } });
  await prisma.post.createMany({
    data: [
      { societyId: green.id, authorId: greenR1.id, category: "sale", title: "Sofa set for sale", body: "3+2 seater, 2 years old, excellent condition. Pickup from A-101.", price: 12000, createdAt: hoursAgo(6) },
      { societyId: green.id, authorId: greenR2.id, category: "query", title: "Good pediatrician nearby?", body: "New to the society, can anyone recommend a good child doctor around Baner?", createdAt: hoursAgo(30) },
      { societyId: green.id, authorId: greenR1.id, category: "lost_found", title: "Found: house keys near gate", body: "A bunch of keys with a blue tag found near the main gate. Collect from the guard.", createdAt: hoursAgo(48) },
    ],
  });

  // Bookable amenities for Green Valley: Clubhouse (enabled) + a disabled example.
  const clubhouse = await prisma.amenity.create({
    data: {
      societyId: green.id,
      name: "Clubhouse / Party Hall",
      description: "Air-conditioned hall for birthdays, functions and small gatherings (up to 60 guests).",
      enabled: true,
      slots: {
        create: [
          { label: "Morning", startTime: "08:00", endTime: "12:00", price: 1500 },
          { label: "Afternoon", startTime: "12:00", endTime: "17:00", price: 2000 },
          { label: "Evening", startTime: "17:00", endTime: "22:00", price: 3000 },
        ],
      },
    },
    include: { slots: true },
  });
  await prisma.amenity.create({
    data: {
      societyId: green.id,
      name: "Terrace Garden",
      description: "Open terrace for small get-togethers. (Disabled — enable to allow bookings.)",
      enabled: false,
      slots: {
        create: [
          { label: "Morning", startTime: "08:00", endTime: "12:00", price: 500 },
          { label: "Evening", startTime: "17:00", endTime: "21:00", price: 800 },
        ],
      },
    },
  });

  // A couple of demo bookings so residents/admin see the flow end to end.
  const morningSlot = clubhouse.slots.find((s) => s.label === "Morning");
  const eveningSlot = clubhouse.slots.find((s) => s.label === "Evening");
  const dayStr = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
  await prisma.booking.create({
    data: {
      societyId: green.id, amenityId: clubhouse.id, slotId: eveningSlot.id,
      residentId: greenR1.id, flatId: flatA101.id, date: dayStr(6),
      amount: eveningSlot.price, status: "requested", notes: "Birthday party for my daughter",
      createdAt: hoursAgo(2),
    },
  });
  await prisma.booking.create({
    data: {
      societyId: green.id, amenityId: clubhouse.id, slotId: morningSlot.id,
      residentId: greenR2.id, flatId: flatA102.id, date: dayStr(-10),
      amount: morningSlot.price, status: "paid", paidAt: hoursAgo(240),
      paymentRef: "BOOK-DEMO01", decidedAt: hoursAgo(250), createdAt: hoursAgo(260),
    },
  });

  /* ======================= Society 2: Skyline Towers ===================== */
  const sky = await prisma.society.create({
    data: { name: "Skyline Towers", city: "Mumbai", address: "Powai, Mumbai 400076" },
  });

  const flatS101 = await prisma.flat.create({
    data: { societyId: sky.id, flatNo: "S-101", block: "S", ownerName: "Vikram Rao" },
  });
  const flatS102 = await prisma.flat.create({
    data: { societyId: sky.id, flatNo: "S-102", block: "S", ownerName: "Neha Gupta" },
  });

  await prisma.user.createMany({
    data: [
      { name: "Skyline Admin", email: "admin@skyline.com", role: "admin", passwordHash: hash, phone: "99999 10001", societyId: sky.id },
      { name: "Skyline Guard", email: "guard@skyline.com", role: "guard", passwordHash: hash, phone: "98888 10001", societyId: sky.id },
      { name: "Vikram Rao", email: "resident@skyline.com", role: "resident", passwordHash: hash, phone: "97777 10001", societyId: sky.id, flatId: flatS101.id },
      { name: "Neha Gupta", email: "resident2@skyline.com", role: "resident", passwordHash: hash, phone: "97777 10002", societyId: sky.id, flatId: flatS102.id },
    ],
  });
  const skyGuard = await prisma.user.findUnique({ where: { email: "guard@skyline.com" } });

  for (const flat of [flatS101, flatS102]) {
    for (let i = 0; i < months.length; i++) {
      const paid = i < 1; // more dues outstanding here, to differentiate from Green Valley
      await prisma.bill.create({
        data: {
          flatId: flat.id,
          period: months[i],
          amount: 2500,
          dueDate: `${months[i]}-10`,
          status: paid ? "paid" : "pending",
          paidAt: paid ? new Date() : null,
          paymentRef: paid ? `PAY-SKY${i}` : null,
        },
      });
    }
  }

  await prisma.visitor.create({
    data: {
      flatId: flatS101.id,
      name: "Swiggy Delivery",
      phone: "91234 56789",
      vehicleNo: "MH01XY9090",
      purpose: "Delivery",
      photoUrl: placeholderPhoto("Swiggy"),
      guardId: skyGuard?.id || null,
      status: "approved",
      createdAt: hoursAgo(3),
      decidedAt: hoursAgo(2.9),
    },
  });

  await prisma.expense.createMany({
    data: [
      { societyId: sky.id, label: "Security agency (July)", amount: 18000, date: hoursAgo(200) },
      { societyId: sky.id, label: "Water tanker", amount: 4200, date: hoursAgo(60) },
    ],
  });

  console.log("Seed complete. All demo logins use password: " + PASSWORD);
  console.log("  SUPER ADMIN (H2O owner): owner@h2o.com");
  console.log("  Society 1 - Green Valley Residency (Pune):");
  console.log("     admin@h2o.com / admin2@h2o.com, guard@h2o.com / guard2@h2o.com");
  console.log("     resident@h2o.com (A-101), resident2@h2o.com (A-102), resident3@h2o.com (B-201)");
  console.log("  Society 2 - Skyline Towers (Mumbai):");
  console.log("     admin@skyline.com, guard@skyline.com");
  console.log("     resident@skyline.com (S-101), resident2@skyline.com (S-102)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
