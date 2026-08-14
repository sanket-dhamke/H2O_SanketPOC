import crypto from "crypto";

// ---------------------------------------------------------------------------
// IVR visitor-approval fallback (Twilio / Exotel).
//
// For residents without a smartphone (typically the elderly), we can place an
// automated phone call when a visitor is logged: "Press 1 to allow, 2 to deny".
// The telephony provider is intentionally STUBBED for now — set the env vars
// below to wire a real provider later. Everything else (webhook handling,
// signed callbacks, decision application) already works end-to-end.
//
// Enable with:
//   IVR_PROVIDER=twilio|exotel
//   IVR_SECRET=<random string>          (signs webhook callbacks)
//   PUBLIC_BASE_URL=https://api.gatemate.app
//   TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM   (for twilio)
//   EXOTEL_SID / EXOTEL_TOKEN / EXOTEL_FROM                (for exotel)
// ---------------------------------------------------------------------------

const PROVIDER = (process.env.IVR_PROVIDER || "").toLowerCase();
const SECRET = process.env.IVR_SECRET || process.env.JWT_SECRET || "gatemate-ivr";

export function ivrConfigured() {
  if (PROVIDER === "twilio") {
    return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM);
  }
  if (PROVIDER === "exotel") {
    return !!(process.env.EXOTEL_SID && process.env.EXOTEL_TOKEN && process.env.EXOTEL_FROM);
  }
  return false;
}

export function publicBaseUrl() {
  return (process.env.PUBLIC_BASE_URL || process.env.SERVER_URL || "").replace(/\/+$/, "");
}

// A short signed token so the provider's webhook callbacks can't be spoofed.
export function signVisitorToken(visitorId) {
  return crypto.createHmac("sha256", SECRET).update(String(visitorId)).digest("hex").slice(0, 24);
}
export function verifyVisitorToken(visitorId, token) {
  const expected = signVisitorToken(visitorId);
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(token || "")));
  } catch {
    return false;
  }
}

// Places the outbound approval call. Returns {placed, stub, reason} and never
// throws — visitor logging must succeed even if telephony is down.
export async function placeApprovalCall({ visitor, toPhone }) {
  const phone = String(toPhone || "").replace(/[^\d+]/g, "");
  if (!phone) return { placed: false, reason: "no_phone" };
  const base = publicBaseUrl();
  if (!base) return { placed: false, reason: "no_public_url" };
  const token = signVisitorToken(visitor.id);
  const voiceUrl = `${base}/api/ivr/visitor/${visitor.id}/voice?t=${token}`;

  if (!ivrConfigured()) {
    // Stub: log what WOULD be dialled so it can be verified in QA without a
    // paid telephony account.
    console.log(`[IVR stub] would call ${phone} → ${voiceUrl} (visitor ${visitor.name} for ${visitor.flat?.flatNo || "?"})`);
    return { placed: false, stub: true, reason: "provider_not_configured", voiceUrl };
  }

  try {
    if (PROVIDER === "twilio") {
      const sid = process.env.TWILIO_ACCOUNT_SID;
      const auth = Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
      const body = new URLSearchParams({ To: phone, From: process.env.TWILIO_FROM, Url: voiceUrl });
      const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json`, {
        method: "POST",
        headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      if (!r.ok) return { placed: false, reason: `twilio_${r.status}` };
      return { placed: true, provider: "twilio" };
    }
    if (PROVIDER === "exotel") {
      // Exotel Connect-to-app-flow (App URL points at our voiceUrl equivalent).
      const sid = process.env.EXOTEL_SID;
      const auth = Buffer.from(`${process.env.EXOTEL_KEY || sid}:${process.env.EXOTEL_TOKEN}`).toString("base64");
      const body = new URLSearchParams({ From: phone, CallerId: process.env.EXOTEL_FROM, Url: voiceUrl });
      const r = await fetch(`https://api.exotel.com/v1/Accounts/${sid}/Calls/connect.json`, {
        method: "POST",
        headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      if (!r.ok) return { placed: false, reason: `exotel_${r.status}` };
      return { placed: true, provider: "exotel" };
    }
  } catch (err) {
    console.error("placeApprovalCall failed:", err.message);
    return { placed: false, reason: err.message };
  }
  return { placed: false, reason: "unknown_provider" };
}
