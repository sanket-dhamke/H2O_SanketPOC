import crypto from "crypto";
import { prisma } from "./prisma.js";

// Human-friendly code: no ambiguous chars (0/O, 1/I/L). Prefixed "GM" so it's
// recognisably a GATEZO join code when shared over WhatsApp.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function randomCode(len = 6) {
  let s = "";
  const bytes = crypto.randomBytes(len);
  for (let i = 0; i < len; i++) s += ALPHABET[bytes[i] % ALPHABET.length];
  return `GM${s}`;
}

// Generates a code that isn't already used by another society.
export async function generateUniqueJoinCode() {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = randomCode();
    const clash = await prisma.society.findUnique({ where: { joinCode: code } });
    if (!clash) return code;
  }
  // Extremely unlikely; widen the space as a fallback.
  return randomCode(8);
}

// Returns the society's join code, creating one on first use.
export async function ensureJoinCode(societyId) {
  const society = await prisma.society.findUnique({ where: { id: societyId } });
  if (!society) return null;
  if (society.joinCode) return society.joinCode;
  const joinCode = await generateUniqueJoinCode();
  await prisma.society.update({ where: { id: societyId }, data: { joinCode } });
  return joinCode;
}
