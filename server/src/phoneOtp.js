// Sign-in and reset codes go to the mobile saved on the account.
// The code is never included in the returned object, so a route cannot
// accidentally hand it back to the login page.

import { normalizePhone, whatsappEnabled } from "./whatsapp.js";

export function phoneTail(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : "";
}

// "" clears the number. null means the typed value is not an Indian mobile.
export function normalizeIndianMobile(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  const last10 = digits.slice(-10);
  if (!/^[6-9]\d{9}$/.test(last10)) return null;
  return last10;
}

function twilioReady() {
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM);
}

function exotelReady() {
  return !!(process.env.EXOTEL_SID && process.env.EXOTEL_TOKEN && process.env.EXOTEL_FROM);
}

function whatsappOtpReady() {
  return whatsappEnabled && !!process.env.WHATSAPP_OTP_TEMPLATE;
}

export function phoneOtpReady() {
  return twilioReady() || exotelReady() || whatsappOtpReady();
}

async function sendTwilio(to, text) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const auth = Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
  const body = new URLSearchParams({ To: `+${to}`, From: process.env.TWILIO_FROM, Body: text });
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`twilio_${res.status}`);
}

async function sendExotel(to, text) {
  const sid = process.env.EXOTEL_SID;
  const auth = Buffer.from(`${process.env.EXOTEL_KEY || sid}:${process.env.EXOTEL_TOKEN}`).toString("base64");
  const body = new URLSearchParams({ From: process.env.EXOTEL_FROM, To: to, Body: text });
  const res = await fetch(`https://api.exotel.com/v1/Accounts/${sid}/Sms/send.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`exotel_${res.status}`);
}

async function sendWhatsappTemplate(to, code) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const version = process.env.WHATSAPP_GRAPH_VERSION || "v20.0";
  const res = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: process.env.WHATSAPP_OTP_TEMPLATE,
        language: { code: process.env.WHATSAPP_LANG || "en" },
        components: [{ type: "body", parameters: [{ type: "text", text: code }] }],
      },
    }),
  });
  if (!res.ok) throw new Error(`whatsapp_${res.status}`);
}

// Returns { delivered, reason, phoneTail, channel? }. Never returns the code.
export async function sendPhoneCode({ toPhone, code }) {
  const to = normalizePhone(toPhone);
  const tail = phoneTail(to);
  if (!to || tail.length < 4) return { delivered: false, reason: "no_phone", phoneTail: "" };
  if (!phoneOtpReady()) return { delivered: false, reason: "not_configured", phoneTail: tail };
  const text = `Your GATEZO code is ${code}. It expires in 10 minutes. Do not share it.`;
  try {
    if (twilioReady()) {
      await sendTwilio(to, text);
      return { delivered: true, channel: "sms", phoneTail: tail };
    }
    if (exotelReady()) {
      await sendExotel(to, text);
      return { delivered: true, channel: "sms", phoneTail: tail };
    }
    await sendWhatsappTemplate(to, String(code));
    return { delivered: true, channel: "whatsapp", phoneTail: tail };
  } catch (e) {
    console.error("[phone-otp] send failed:", e.message);
    return { delivered: false, reason: "send_failed", phoneTail: tail };
  }
}
