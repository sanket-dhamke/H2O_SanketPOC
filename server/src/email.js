import nodemailer from "nodemailer";

// Provider-agnostic email sender. Configure ONE of the following via env:
//   EMAIL_PROVIDER=resend  RESEND_API_KEY=re_xxx  EMAIL_FROM="H2O <no-reply@yourdomain.com>"
//   EMAIL_PROVIDER=smtp    SMTP_HOST=... SMTP_PORT=587 SMTP_USER=... SMTP_PASS=... EMAIL_FROM=...
// If nothing is configured, we run in DEV mode: the email is logged to the
// server console (and the OTP is returned by the API) so the flow is testable
// without any provider.
const PROVIDER = (process.env.EMAIL_PROVIDER || "").toLowerCase();
const FROM = process.env.EMAIL_FROM || "H2O <onboarding@resend.dev>";

export const emailConfigured =
  (PROVIDER === "resend" && !!process.env.RESEND_API_KEY) ||
  (PROVIDER === "smtp" && !!process.env.SMTP_HOST);

let smtpTransport = null;
function getSmtpTransport() {
  if (!smtpTransport) {
    smtpTransport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE || "").toLowerCase() === "true",
      auth:
        process.env.SMTP_USER || process.env.SMTP_PASS
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
    });
  }
  return smtpTransport;
}

// attachments: [{ filename, content (utf-8 string), contentType }]
async function sendViaResend({ to, subject, text, html, attachments }) {
  const body = { from: FROM, to: [to], subject, text, html };
  if (attachments?.length) {
    body.attachments = attachments.map((a) => ({
      filename: a.filename,
      content: Buffer.from(a.content).toString("base64"),
    }));
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`Resend error ${res.status}: ${errBody}`);
  }
}

// Returns { delivered: boolean, dev: boolean }. Never throws in DEV mode.
export async function sendEmail({ to, subject, text, html, attachments }) {
  if (!emailConfigured) {
    const names = (attachments || []).map((a) => a.filename).join(", ");
    console.log(
      `\n[email:DEV] No email provider configured — would send to ${to}\n` +
        `  Subject: ${subject}\n  ${text}\n` +
        (names ? `  Attachments: ${names}\n` : "")
    );
    return { delivered: false, dev: true };
  }
  try {
    if (PROVIDER === "resend") {
      await sendViaResend({ to, subject, text, html, attachments });
    } else if (PROVIDER === "smtp") {
      await getSmtpTransport().sendMail({
        from: FROM,
        to,
        subject,
        text,
        html,
        attachments: (attachments || []).map((a) => ({
          filename: a.filename,
          content: Buffer.from(a.content),
          contentType: a.contentType,
        })),
      });
    }
    return { delivered: true, dev: false };
  } catch (e) {
    console.error("[email] send failed:", e.message);
    // Surface as not delivered; caller decides how to respond.
    return { delivered: false, dev: false, error: e.message };
  }
}
