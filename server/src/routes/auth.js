import { Router } from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../prisma.js";
import { signToken, authRequired } from "../auth.js";
import { publicUser } from "../serializers.js";
import { validatePassword } from "../passwordPolicy.js";
import { sendPush } from "../push.js";
import { normalizeIndianMobile, phoneTail, sendPhoneCode } from "../phoneOtp.js";
import { providerServiceChoices, registerProviderAccount } from "../providerJoin.js";

export const authRouter = Router();

authRouter.post("/auth/login", async (req, res) => {
  const { email, password } = req.body || {};
  // Emails are stored lowercased, so normalize the input for a case-insensitive match.
  const user = await prisma.user.findUnique({
    where: { email: String(email || "").trim().toLowerCase() },
    include: { flat: true, society: true },
  });
  if (!user || !user.active || !(await bcrypt.compare(password || "", user.passwordHash))) {
    return res.status(401).json({ message: "Invalid email or password" });
  }
  // Block login when the user's society has been deactivated by the superadmin.
  if (user.role !== "superadmin" && user.society && !user.society.active) {
    const org = user.society.orgType === "preschool" ? "preschool" : "society";
    return res.status(403).json({ message: `This ${org} is currently inactive. Contact GATEZO support.` });
  }
  // Self-registered residents wait for a society admin. Self-registered
  // professionals wait for the GATEZO owner. Neither can sign in until then.
  if (user.pendingApproval) {
    const who = user.role === "provider" ? "the GATEZO owner" : "your admin";
    return res.status(403).json({
      message: `Your account is awaiting approval from ${who}. You'll be able to sign in once it is approved.`,
    });
  }
  res.json({ token: signToken(user), user: publicUser(user) });
});

// PUBLIC self-registration. A resident enters the society join code + their
// flat number and sets their own name/email/password. They land in a
// pending-approval state (cannot log in) until an admin approves them — so an
// admin never has to hand-create 500 logins.
authRouter.post("/auth/register", async (req, res) => {
  const { joinCode, flatNo, name, email, phone, password } = req.body || {};
  if (!joinCode || !flatNo || !name || !email || !password) {
    return res.status(400).json({ message: "Join code, flat, name, email and password are required." });
  }
  const society = await prisma.society.findUnique({
    where: { joinCode: String(joinCode).trim().toUpperCase() },
  });
  if (!society || !society.active) {
    return res.status(404).json({ message: "Invalid join code. Please check it with your admin." });
  }
  const flat = await prisma.flat.findFirst({
    where: { societyId: society.id, flatNo: String(flatNo).trim() },
  });
  if (!flat) {
    return res.status(404).json({ message: `Flat "${String(flatNo).trim()}" was not found in ${society.name}. Check the exact flat number with your admin.` });
  }
  const policyError = validatePassword(password);
  if (policyError) return res.status(400).json({ message: policyError });

  const normalizedEmail = String(email).trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) return res.status(409).json({ message: "An account with this email already exists. Try signing in or reset your password." });

  await prisma.user.create({
    data: {
      name: String(name).trim(),
      email: normalizedEmail,
      phone: phone ? String(phone).trim() : null,
      role: "resident",
      societyId: society.id,
      flatId: flat.id,
      passwordHash: bcrypt.hashSync(password, 10),
      pendingApproval: true,
    },
  });

  // Notify society admins (push) so they can approve quickly.
  try {
    const admins = await prisma.user.findMany({
      where: { societyId: society.id, role: "admin", active: true, expoPushToken: { not: null } },
      select: { expoPushToken: true },
    });
    for (const a of admins) {
      await sendPush(
        a.expoPushToken,
        "New resident request",
        `${String(name).trim()} (${flat.flatNo}) is waiting for approval.`,
        { type: "resident-approval" }
      );
    }
  } catch (e) {
    console.error("resident-approval push failed:", e.message);
  }

  res.status(201).json({
    ok: true,
    pending: true,
    societyName: society.name,
    message: `Request sent to ${society.name}. You'll be able to sign in once an admin approves your account.`,
  });
});

// Service catalogue for the public professional registration form.
authRouter.get("/auth/provider-services", (_req, res) => {
  res.json({ services: providerServiceChoices() });
});

// PUBLIC self-registration for service professionals. They use the owner's
// provider code (not a society resident code) and wait for owner approval.
authRouter.post("/auth/register-provider", async (req, res) => {
  const result = await registerProviderAccount(req.body || {});
  res.status(result.status).json(result.body);
});

function codeFailureMessage(reason, tail) {
  if (reason === "no_phone") {
    return "This account has no mobile number saved. Ask your admin to add one. The code is never shown on this page.";
  }
  if (reason === "not_configured") {
    return "Phone codes are not turned on for this server yet.";
  }
  return tail
    ? `We could not text a code to the mobile ending ${tail}.`
    : "We could not text a code.";
}

async function issueLoginCode(email) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.active || user.pendingApproval) return { ok: true, sent: false };
  const tail = phoneTail(user.phone);
  if (!tail) return { ok: true, sent: true, delivered: false, reason: "no_phone" };
  const otp = String(crypto.randomInt(100000, 1000000));
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await prisma.loginCode.deleteMany({ where: { email } });
  await prisma.loginCode.create({
    data: { email, codeHash: bcrypt.hashSync(otp, 8), expiresAt },
  });
  const sent = await sendPhoneCode({ toPhone: user.phone, code: otp });
  if (!sent.delivered) {
    await prisma.loginCode.deleteMany({ where: { email } });
    return { ok: true, sent: true, delivered: false, reason: sent.reason, phoneTail: tail };
  }
  return {
    ok: true,
    sent: true,
    delivered: true,
    message: `Code sent to the mobile ending ${tail}.`,
    phoneTail: tail,
  };
}

// Sign-in code is texted to the mobile saved on the account. It is never returned.
authRouter.post("/auth/login-code", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!email) return res.status(400).json({ message: "Email is required" });
  const result = await issueLoginCode(email);
  if (!result.sent) {
    return res.json({ ok: true, message: "If that email is registered, a sign-in code has been sent." });
  }
  if (!result.delivered) {
    return res.status(503).json({ message: codeFailureMessage(result.reason, result.phoneTail) });
  }
  res.json({
    ok: true,
    message: result.message,
    phoneTail: result.phoneTail || null,
  });
});

authRouter.post("/auth/login-code/verify", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const code = String(req.body?.code || "").trim();
  if (!email || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ message: "Email and a 6-digit code are required" });
  }
  const row = await prisma.loginCode.findFirst({ where: { email }, orderBy: { createdAt: "desc" } });
  if (!row || row.expiresAt < new Date() || row.attempts >= 5) {
    return res.status(400).json({ message: "That code has expired. Send a new one." });
  }
  const ok = await bcrypt.compare(code, row.codeHash);
  if (!ok) {
    await prisma.loginCode.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
    return res.status(401).json({ message: "That code does not match." });
  }
  const user = await prisma.user.findUnique({
    where: { email },
    include: { flat: true, society: true },
  });
  if (!user || !user.active || user.pendingApproval) {
    return res.status(401).json({ message: "This account cannot sign in yet." });
  }
  if (user.role !== "superadmin" && user.society && !user.society.active) {
    return res.status(403).json({ message: "This society is currently inactive." });
  }
  await prisma.loginCode.deleteMany({ where: { email } });
  res.json({ token: signToken(user), user: publicUser(user) });
});

authRouter.get("/me", authRequired, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: { flat: true, society: true },
  });
  if (!user) return res.status(404).json({ message: "User not found" });
  res.json({ user: publicUser(user) });
});

// Self-service password reset — step 1: text a code to the saved mobile.
// Unknown emails get the same reply. The code is never returned.
authRouter.post("/auth/forgot-password", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!email) return res.status(400).json({ message: "Email is required" });
  const generic = { ok: true, message: "If that account has a mobile number, a reset code has been sent." };

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.active) return res.json(generic);
  const tail = phoneTail(user.phone);
  if (!tail) return res.status(503).json({ message: codeFailureMessage("no_phone") });

  const otp = String(crypto.randomInt(100000, 1000000));
  await prisma.user.update({
    where: { id: user.id },
    data: {
      resetOtpHash: bcrypt.hashSync(otp, 10),
      resetOtpExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
      resetOtpAttempts: 0,
    },
  });

  const sent = await sendPhoneCode({ toPhone: user.phone, code: otp });
  if (!sent.delivered) {
    await prisma.user.update({
      where: { id: user.id },
      data: { resetOtpHash: null, resetOtpExpiresAt: null, resetOtpAttempts: 0 },
    });
    return res.status(503).json({ message: codeFailureMessage(sent.reason, tail) });
  }
  res.json({ ...generic, message: `Reset code sent to the mobile ending ${tail}.`, phoneTail: tail });
});

// Self-service password reset — step 2: verify OTP and set a new password.
authRouter.post("/auth/reset-password", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const { otp, newPassword } = req.body || {};
  if (!email || !otp || !newPassword) {
    return res.status(400).json({ message: "Email, code and new password are required" });
  }
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.resetOtpHash || !user.resetOtpExpiresAt) {
    return res.status(400).json({ message: "Invalid or expired code. Request a new one." });
  }
  if (user.resetOtpExpiresAt.getTime() < Date.now()) {
    await prisma.user.update({ where: { id: user.id }, data: { resetOtpHash: null, resetOtpExpiresAt: null, resetOtpAttempts: 0 } });
    return res.status(400).json({ message: "Code expired. Request a new one." });
  }
  if (user.resetOtpAttempts >= 5) {
    await prisma.user.update({ where: { id: user.id }, data: { resetOtpHash: null, resetOtpExpiresAt: null } });
    return res.status(429).json({ message: "Too many attempts. Request a new code." });
  }
  const ok = await bcrypt.compare(String(otp), user.resetOtpHash);
  if (!ok) {
    await prisma.user.update({ where: { id: user.id }, data: { resetOtpAttempts: user.resetOtpAttempts + 1 } });
    return res.status(400).json({ message: "Incorrect code. Please check and try again." });
  }
  const policyError = validatePassword(newPassword);
  if (policyError) return res.status(400).json({ message: policyError });

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: bcrypt.hashSync(newPassword, 10),
      resetOtpHash: null,
      resetOtpExpiresAt: null,
      resetOtpAttempts: 0,
    },
  });
  res.json({ ok: true });
});

// Any signed-in user can change their own password (verifies the current one).
authRouter.post("/me/password", authRequired, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: "Current and new password are required" });
  }
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) return res.status(404).json({ message: "User not found" });
  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) return res.status(400).json({ message: "Current password is incorrect" });
  const policyError = validatePassword(newPassword);
  if (policyError) return res.status(400).json({ message: policyError });
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: bcrypt.hashSync(newPassword, 10) },
  });
  res.json({ ok: true });
});

// Register the device's Expo push token so we can notify this user.
// Honors the user's notification preference: if they've turned notifications off,
// we never store a token (so no pushes are sent) even if the app tries to register.
authRouter.post("/push-token", authRequired, async (req, res) => {
  const { token } = req.body || {};
  const me = await prisma.user.findUnique({ where: { id: req.user.id }, select: { notifyEnabled: true } });
  await prisma.user.update({
    where: { id: req.user.id },
    data: { expoPushToken: me?.notifyEnabled === false ? null : token || null },
  });
  res.json({ ok: true });
});

// Update the user's own preferences: notifications, directory visibility, and
// the mobile number sign-in codes are texted to.
authRouter.patch("/me/preferences", authRequired, async (req, res) => {
  const { notifyEnabled, sharePhone, phone } = req.body || {};
  const data = {};
  if (notifyEnabled !== undefined) {
    data.notifyEnabled = Boolean(notifyEnabled);
    if (!data.notifyEnabled) data.expoPushToken = null;
  }
  if (sharePhone !== undefined) data.sharePhone = Boolean(sharePhone);
  if (phone !== undefined) {
    const mobile = normalizeIndianMobile(phone);
    if (mobile === null) {
      return res.status(400).json({ message: "Enter a 10-digit Indian mobile number." });
    }
    data.phone = mobile || null;
  }
  const user = await prisma.user.update({
    where: { id: req.user.id },
    data,
    include: { flat: true, society: true },
  });
  res.json({ user: publicUser(user) });
});

// Flat list for pickers (guards choose a flat when logging a visitor).
// Scoped to the caller's society.
authRouter.get("/flats", authRequired, async (req, res) => {
  const societyId = req.user.societyId || "__none__";
  const flats = await prisma.flat.findMany({
    where: { societyId },
    orderBy: { flatNo: "asc" },
  });
  // Count active residents per flat so the guard picker can flag flats that
  // have no resident account yet (those can't receive a visitor to approve).
  const groups = await prisma.user.groupBy({
    by: ["flatId"],
    where: { societyId, role: "resident", active: true, flatId: { not: null } },
    _count: { _all: true },
  });
  const countByFlat = new Map(groups.map((g) => [g.flatId, g._count._all]));
  res.json({
    flats: flats.map((f) => ({
      id: f.id,
      flatNo: f.flatNo,
      block: f.block,
      residentCount: countByFlat.get(f.id) || 0,
    })),
  });
});

// Non-sensitive society payee info so residents can see where maintenance goes.
authRouter.get("/bank-account", authRequired, async (req, res) => {
  const account = await prisma.societyAccount.findFirst({
    where: { societyId: req.user.societyId || "__none__" },
    orderBy: { createdAt: "asc" },
  });
  if (!account || !account.active) return res.json({ account: null });
  const acct = account.accountNumber || "";
  res.json({
    account: {
      accountHolderName: account.accountHolderName,
      bankName: account.bankName,
      last4: acct ? acct.slice(-4) : null,
      upiId: account.upiId,
      routed: Boolean(account.razorpayAccountId),
    },
  });
});
