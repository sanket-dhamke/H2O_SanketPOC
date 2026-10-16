import bcrypt from "bcryptjs";
import { prisma } from "./prisma.js";

// Demo logins for the hosted app. This only creates accounts that are missing.
// It never deletes societies, residents, or payments that are already there.
const PASSWORD = "Password123";

const PROS = [
  { name: "Ravi Kulkarni", email: "ac.ravi@gatezo.com", phone: "98111 10001", slugs: "ac", rating: 4.9 },
  { name: "Meera Joshi", email: "ac.meera@gatezo.com", phone: "98111 10002", slugs: "ac", rating: 4.6 },
  { name: "Anil Deshmukh", email: "clean.anil@gatezo.com", phone: "98111 10003", slugs: "cleaning,pest,laundry", rating: 4.7 },
  { name: "Priya Nair", email: "salon.priya@gatezo.com", phone: "98111 10004", slugs: "salon", rating: 4.8 },
  { name: "Imran Shaikh", email: "trades.imran@gatezo.com", phone: "98111 10005", slugs: "trades,instant,painting", rating: 4.5 },
  { name: "Neha Kapoor", email: "move.neha@gatezo.com", phone: "98111 10006", slugs: "movers,legal,interiors", rating: 4.7 },
  {
    name: "GATEZO Desk",
    email: "desk@gatezo.com",
    phone: "98111 10000",
    slugs: "instant,cleaning,movers,ac,trades,painting,legal,interiors,salon,pest,laundry",
    rating: 4.8,
    fallback: true,
  },
];

function ymd(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

export async function ensureDemoAccounts() {
  const hash = bcrypt.hashSync(PASSWORD, 10);
  const until = new Date();
  until.setFullYear(until.getFullYear() + 1);
  const created = [];

  for (const p of PROS) {
    let user = await prisma.user.findUnique({ where: { email: p.email } });
    if (user && user.role !== "provider") continue;
    if (!user) {
      user = await prisma.user.create({
        data: {
          name: p.name,
          email: p.email,
          phone: p.phone,
          role: "provider",
          passwordHash: hash,
          active: true,
          pendingApproval: false,
        },
      });
      created.push(p.email);
    }
    let provider = await prisma.serviceProvider.findUnique({ where: { userId: user.id } });
    if (!provider) {
      provider = await prisma.serviceProvider.create({
        data: {
          userId: user.id,
          phone: p.phone,
          serviceSlugs: p.slugs,
          fallback: !!p.fallback,
          active: true,
          packAmount: p.fallback ? 0 : 4999,
          packPaidUntil: p.fallback ? null : until,
          ratingAvg: p.rating,
          ratingCount: 12,
        },
      });
    }
    if (!p.fallback) {
      const payments = await prisma.providerPackPayment.count({ where: { providerId: provider.id } });
      if (payments === 0) {
        const amount = provider.packAmount || 4999;
        if (provider.packPaidUntil == null) {
          await prisma.serviceProvider.update({
            where: { id: provider.id },
            data: { packPaidUntil: until, packAmount: amount },
          });
        }
        await prisma.providerPackPayment.create({
          data: { providerId: provider.id, amount, paidOn: ymd(), note: "Annual pack" },
        });
      }
    }
  }

  const resident = await prisma.user.findUnique({ where: { email: "resident@h2o.com" } });
  if (!resident) {
    const society = await prisma.society.create({
      data: {
        name: "GATEZO Demo",
        city: "Pune",
        address: "Demo society for service bookings",
        slug: "gatezo-demo",
        active: true,
      },
    });
    const flat = await prisma.flat.create({
      data: { societyId: society.id, flatNo: "A-101", block: "A", ownerName: "Aarav Sharma" },
    });
    await prisma.user.createMany({
      data: [
        { name: "Society Admin", email: "admin@h2o.com", role: "admin", passwordHash: hash, phone: "99999 00001", societyId: society.id, active: true },
        { name: "Gate Guard", email: "guard@h2o.com", role: "guard", passwordHash: hash, phone: "98888 00001", societyId: society.id, active: true },
        { name: "Aarav Sharma", email: "resident@h2o.com", role: "resident", passwordHash: hash, phone: "97777 00001", societyId: society.id, flatId: flat.id, active: true },
      ],
    });
    created.push("resident@h2o.com", "admin@h2o.com", "guard@h2o.com");
  }

  if (created.length) console.log(`[demo] created ${created.join(", ")}`);
  return created;
}
