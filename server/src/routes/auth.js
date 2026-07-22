import { Router } from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../prisma.js";
import { signToken, authRequired } from "../auth.js";
import { publicUser } from "../serializers.js";
import { validatePassword } from "../passwordPolicy.js";
import { sendEmail } from "../email.js";

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
    return res.status(403).json({ message: "This society is currently inactive. Contact H2O support." });
  }
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

// Self-service password reset — step 1: request an emailed OTP code.
// Always responds success (never reveals whether the email exists).
authRouter.post("/auth/forgot-password", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!email) return res.status(400).json({ message: "Email is required" });
  const generic = { ok: true, message: "If that email is registered, a reset code has been sent." };

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.active) return res.json(generic);

  const otp = String(crypto.randomInt(100000, 1000000)); // 6-digit
  await prisma.user.update({
    where: { id: user.id },
    data: {
      resetOtpHash: bcrypt.hashSync(otp, 10),
      resetOtpExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
      resetOtpAttempts: 0,
    },
  });

  const text =
    `Hi ${user.name},\n\nYour H2O password reset code is ${otp}.\n` +
    `It expires in 15 minutes. If you didn't request this, you can ignore this email.`;
  const html =
    `<p>Hi ${user.name},</p><p>Your H2O password reset code is ` +
    `<b style="font-size:22px;letter-spacing:2px">${otp}</b>.</p>` +
    `<p>It expires in 15 minutes. If you didn't request this, please ignore this email.</p>`;
  const result = await sendEmail({ to: email, subject: "Your H2O password reset code", text, html });

  const payload = { ...generic };
  // DEV mode (no provider configured): return the OTP so it's testable now.
  if (result.dev) payload.devOtp = otp;
  if (result.error) payload.deliveryWarning = "We couldn't deliver the email right now. Please try again or contact your admin.";
  res.json(payload);
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
authRouter.post("/push-token", authRequired, async (req, res) => {
  const { token } = req.body || {};
  await prisma.user.update({
    where: { id: req.user.id },
    data: { expoPushToken: token || null },
  });
  res.json({ ok: true });
});

// Flat list for pickers (guards choose a flat when logging a visitor).
// Scoped to the caller's society.
authRouter.get("/flats", authRequired, async (req, res) => {
  const flats = await prisma.flat.findMany({
    where: { societyId: req.user.societyId || "__none__" },
    orderBy: { flatNo: "asc" },
  });
  res.json({ flats: flats.map((f) => ({ id: f.id, flatNo: f.flatNo, block: f.block })) });
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
