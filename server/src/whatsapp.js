// WhatsApp reminder sender.
//
// Automated sending uses the official WhatsApp Business Platform (Cloud API).
// You need, from a verified Meta Business account, a phone number registered to
// the Cloud API (the display number is e.g. +91 78418 89241), plus an approved
// message TEMPLATE for business-initiated messages. Set these in the server env:
//   WHATSAPP_TOKEN            permanent access token
//   WHATSAPP_PHONE_NUMBER_ID  the Cloud API phone-number id (NOT the raw number)
//   WHATSAPP_TEMPLATE         approved template name (default "fee_reminder")
//   WHATSAPP_LANG             template language code (default "en")
//   WHATSAPP_BUSINESS_NUMBER  display number, e.g. 917841889241 (for wa.me links)
//
// Until credentials are present we run in "dev" mode: nothing is sent to Meta,
// the intended message is logged, and the caller can fall back to a wa.me link.

const TOKEN = process.env.WHATSAPP_TOKEN || "";
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
const TEMPLATE = process.env.WHATSAPP_TEMPLATE || "fee_reminder";
const LANG = process.env.WHATSAPP_LANG || "en";
const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || "v20.0";

export const whatsappEnabled = Boolean(TOKEN && PHONE_NUMBER_ID);
export const WHATSAPP_BUSINESS_NUMBER = process.env.WHATSAPP_BUSINESS_NUMBER || "917841889241";

// Normalizes an Indian mobile to E.164 digits (adds 91 if a bare 10-digit).
export function normalizePhone(raw) {
  if (!raw) return "";
  let d = String(raw).replace(/[^\d]/g, "");
  if (d.length === 10) d = "91" + d;
  if (d.startsWith("0") && d.length === 11) d = "91" + d.slice(1);
  return d;
}

// Builds a click-to-send wa.me link (works with no API/credentials at all).
export function waLink(toPhone, text) {
  const to = normalizePhone(toPhone);
  return `https://wa.me/${to}?text=${encodeURIComponent(text || "")}`;
}

// Plain-text reminder body used for logs, wa.me fallback, and (optionally) as a
// non-template message inside the 24h customer-service window.
export function buildReminderText({ orgName, guardian, student, amount, dueDate }) {
  const who = guardian ? `Dear ${guardian},` : "Dear Parent,";
  const rupee = `₹${Number(amount || 0).toLocaleString("en-IN")}`;
  return (
    `${who}\n\nThis is a fee reminder from ${orgName || "your school"}.\n` +
    `Student: ${student || "-"}\nAmount due: ${rupee}\nDue date: ${dueDate || "-"}\n\n` +
    `Please pay at your earliest convenience. Thank you.`
  );
}

// Sends a reminder. Returns { sent, dev, id?, error?, link } — `link` is always a
// wa.me fallback the caller can surface if automated sending is off/failed.
export async function sendFeeReminder({ toPhone, orgName, guardian, student, amount, dueDate }) {
  const to = normalizePhone(toPhone);
  const text = buildReminderText({ orgName, guardian, student, amount, dueDate });
  const link = waLink(to, text);

  if (!to) return { sent: false, dev: !whatsappEnabled, error: "No guardian phone on file", link };
  if (!whatsappEnabled) {
    console.log(`[whatsapp:dev] would send to ${to}: ${text.replace(/\n/g, " | ")}`);
    return { sent: false, dev: true, link };
  }

  // Business-initiated → must use an approved template with body parameters.
  const body = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: TEMPLATE,
      language: { code: LANG },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: String(guardian || "Parent") },
            { type: "text", text: String(orgName || "School") },
            { type: "text", text: String(student || "-") },
            { type: "text", text: `₹${Number(amount || 0).toLocaleString("en-IN")}` },
            { type: "text", text: String(dueDate || "-") },
          ],
        },
      ],
    },
  };

  try {
    const resp = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const error = data?.error?.message || `HTTP ${resp.status}`;
      console.error("[whatsapp] send failed:", error);
      return { sent: false, dev: false, error, link };
    }
    return { sent: true, dev: false, id: data?.messages?.[0]?.id || null, link };
  } catch (e) {
    console.error("[whatsapp] send error:", e.message);
    return { sent: false, dev: false, error: e.message, link };
  }
}
