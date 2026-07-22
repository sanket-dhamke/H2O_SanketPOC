import { prisma } from "./prisma.js";
import { sendEmail } from "./email.js";

const money = (n) => `INR ${Number(n || 0).toLocaleString("en-IN")}`;
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "-");

// Emails a premium subscription invoice to all admins of a society.
export async function emailPremiumInvoice(societyId, { amount, expiresAt, note } = {}) {
  const society = await prisma.society.findUnique({ where: { id: societyId } });
  if (!society) throw new Error("Society not found");
  const admins = await prisma.user.findMany({ where: { societyId, role: "admin", active: true } });
  const recipients = admins.map((a) => a.email).filter(Boolean);
  if (recipients.length === 0) return { admins: 0, delivered: false, dev: false, message: "No admin email found" };

  const amt = amount ?? society.planAmount ?? 0;
  const exp = expiresAt ?? society.planExpiresAt;
  const invoiceNo = "H2O-INV-" + society.id.replace(/[^a-z0-9]/gi, "").slice(-6).toUpperCase() + "-" + new Date().getFullYear();

  const text =
    `H2O Premium subscription invoice\n\n` +
    `Invoice: ${invoiceNo}\nSociety: ${society.name}\n` +
    `Plan: H2O Premium (yearly)\nAmount: ${money(amt)}\nValid until: ${fmtDate(exp)}\n` +
    (note ? `Note: ${note}\n` : "") +
    `\nThank you for using H2O.`;

  const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1B2B33;margin:0;padding:24px;background:#f4f7f9">
  <div style="max-width:600px;margin:0 auto;border:1px solid #E1E8EC;border-radius:14px;overflow:hidden;background:#fff">
    <div style="background:#0B6E8F;color:#fff;padding:22px 26px;display:flex;justify-content:space-between">
      <div><div style="font-size:20px;font-weight:800">H2O Premium</div><div style="color:#CDE9F2;font-size:12px;margin-top:4px">Subscription invoice</div></div>
      <div style="text-align:right;font-size:12px;color:#CDE9F2">${invoiceNo}<br/>${fmtDate(new Date())}</div>
    </div>
    <div style="padding:24px 26px">
      <p style="margin:0 0 4px;color:#6B7B85;font-size:13px">Billed to</p>
      <p style="margin:0 0 18px;font-weight:700;font-size:16px">${society.name}${society.city ? " · " + society.city : ""}</p>
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="padding:10px 0;border-top:1px solid #EEF2F4;color:#6B7B85">H2O Premium plan (1 year)</td><td style="padding:10px 0;border-top:1px solid #EEF2F4;text-align:right;font-weight:700">${money(amt)}</td></tr>
        <tr><td style="padding:10px 0;border-top:1px solid #EEF2F4;color:#6B7B85">Valid until</td><td style="padding:10px 0;border-top:1px solid #EEF2F4;text-align:right;font-weight:700">${fmtDate(exp)}</td></tr>
        <tr><td style="padding:12px 0;border-top:2px solid #0B6E8F;font-weight:800">Total</td><td style="padding:12px 0;border-top:2px solid #0B6E8F;text-align:right;font-weight:800;font-size:18px;color:#0B6E8F">${money(amt)}</td></tr>
      </table>
      ${note ? `<div style="margin-top:16px;background:#EAF6FA;border-radius:10px;padding:12px 14px;color:#0B6E8F;font-size:13px">${note}</div>` : ""}
      <p style="margin-top:20px;color:#8895A0;font-size:12px">Premium unlocks the vendor venue marketplace, voice AI and more. Thank you for using H2O.</p>
    </div>
  </div></body></html>`;

  let delivered = false;
  let dev = false;
  for (const to of recipients) {
    const r = await sendEmail({ to, subject: `H2O Premium invoice — ${society.name}`, text, html });
    delivered = delivered || r.delivered;
    dev = dev || r.dev;
  }
  return { admins: recipients.length, recipients, delivered, dev, invoiceNo, amount: amt };
}
