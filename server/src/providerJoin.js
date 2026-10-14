import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma.js";
import { validatePassword } from "./passwordPolicy.js";
import { HOME_SERVICES } from "./homeServicesCatalog.js";
import { sendPush } from "./push.js";

// Separate from the society resident code (those start with "GM"). A professional
// types an "SP…" code the GATEZO owner shares, the same way a resident types a
// society join code.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const SLUGS = new Set(HOME_SERVICES.map((s) => s.slug));

export function normalizeProviderCode(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function providerServiceChoices() {
  return HOME_SERVICES.map((s) => ({ slug: s.slug, name: s.name }));
}

export function cleanProviderSlugs(value) {
  const list = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(list.map((s) => String(s).trim()).filter((s) => SLUGS.has(s)))];
}

function randomCode(len = 6) {
  let s = "";
  const bytes = crypto.randomBytes(len);
  for (let i = 0; i < len; i++) s += ALPHABET[bytes[i] % ALPHABET.length];
  return `SP${s}`;
}

export async function generateUniqueProviderCode() {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = randomCode();
    const [usedHere, usedBySociety] = await Promise.all([
      prisma.platformSetting.findFirst({ where: { providerJoinCode: code }, select: { id: true } }),
      prisma.society.findUnique({ where: { joinCode: code }, select: { id: true } }),
    ]);
    if (!usedHere && !usedBySociety) return code;
  }
  return randomCode(8);
}

export async function ensureProviderJoinCode() {
  const existing = await prisma.platformSetting.findUnique({ where: { id: "platform" } });
  if (existing?.providerJoinCode) return existing.providerJoinCode;
  const providerJoinCode = await generateUniqueProviderCode();
  if (existing) {
    await prisma.platformSetting.update({ where: { id: "platform" }, data: { providerJoinCode } });
  } else {
    await prisma.platformSetting.create({ data: { id: "platform", providerJoinCode } });
  }
  return providerJoinCode;
}

export async function rotateProviderJoinCode() {
  const providerJoinCode = await generateUniqueProviderCode();
  await prisma.platformSetting.upsert({
    where: { id: "platform" },
    update: { providerJoinCode },
    create: { id: "platform", providerJoinCode },
  });
  return providerJoinCode;
}

async function notifyOwner(name) {
  try {
    const owners = await prisma.user.findMany({
      where: { role: "superadmin", active: true, expoPushToken: { not: null } },
      select: { expoPushToken: true },
    });
    for (const owner of owners) {
      await sendPush(
        owner.expoPushToken,
        "New service professional",
        `${name} is waiting for approval.`,
        { type: "provider-approval" }
      );
    }
  } catch (e) {
    console.error("provider-approval push failed:", e.message);
  }
}

// Public self-registration. The account cannot sign in until the owner approves
// it, and it stays off the job list until that approval (and the annual pack).
export async function registerProviderAccount(body = {}) {
  const code = normalizeProviderCode(body.joinCode);
  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const phone = String(body.phone || "").trim();
  const password = String(body.password || "");
  const slugs = cleanProviderSlugs(body.serviceSlugs);
  if (!code || !name || !email || !phone || !password) {
    return { status: 400, body: { message: "Provider code, name, email, phone and password are required." } };
  }
  if (!slugs.length) {
    return { status: 400, body: { message: "Pick at least one service you can do." } };
  }
  const policyError = validatePassword(password);
  if (policyError) return { status: 400, body: { message: policyError } };

  const setting = await prisma.platformSetting.findUnique({ where: { id: "platform" } });
  if (!setting?.providerJoinCode || setting.providerJoinCode !== code) {
    return {
      status: 404,
      body: { message: "Invalid provider code. Ask the GATEZO owner for the service professional code." },
    };
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { status: 409, body: { message: "An account with this email already exists. Try signing in or reset your password." } };
  }

  const user = await prisma.user.create({
    data: {
      name,
      email,
      phone,
      role: "provider",
      passwordHash: bcrypt.hashSync(password, 10),
      active: true,
      pendingApproval: true,
    },
  });
  await prisma.serviceProvider.create({
    data: {
      userId: user.id,
      phone,
      serviceSlugs: slugs.join(","),
      active: false,
      packAmount: 4999,
    },
  });
  await notifyOwner(name);
  return {
    status: 201,
    body: {
      ok: true,
      pending: true,
      message: "Request sent. You'll be able to sign in once the GATEZO owner approves your professional account.",
    },
  };
}

export async function approveProviderAccount(id) {
  const row = await prisma.serviceProvider.findUnique({ where: { id }, include: { user: true, packPayments: true } });
  if (!row) return { status: 404, body: { message: "Professional not found" } };
  if (!row.user?.pendingApproval) return { status: 409, body: { message: "This professional is already approved." } };
  await prisma.user.update({ where: { id: row.userId }, data: { pendingApproval: false, active: true } });
  const updated = await prisma.serviceProvider.update({
    where: { id: row.id },
    data: { active: true },
    include: { user: true, packPayments: true },
  });
  return { status: 200, row: updated };
}

export async function rejectProviderAccount(id) {
  const row = await prisma.serviceProvider.findUnique({ where: { id }, include: { user: true } });
  if (!row) return { status: 404, body: { message: "Professional not found" } };
  if (!row.user?.pendingApproval) {
    return { status: 409, body: { message: "Only a waiting registration can be declined. Use Remove for an active professional." } };
  }
  try {
    await prisma.user.delete({ where: { id: row.userId } });
  } catch {
    await prisma.user.update({ where: { id: row.userId }, data: { active: false, pendingApproval: false } });
    await prisma.serviceProvider.update({ where: { id: row.id }, data: { active: false } });
  }
  return { status: 200, body: { ok: true } };
}
