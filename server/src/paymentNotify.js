import PDFDocument from "pdfkit";
import { prisma } from "./prisma.js";
import { sendEmail } from "./email.js";
import { sendPush } from "./push.js";

const inr = (n) => "INR " + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const fmtDateTime = (d) =>
  d ? new Date(d).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "-";

// ---- amount in words (Indian system) ----
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const two = (n) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? " " + ONES[n % 10] : ""}`);
function rupeesInWords(amount) {
  let n = Math.floor(Number(amount || 0));
  if (n === 0) return "Zero";
  const p = [];
  const cr = Math.floor(n / 10000000); n %= 10000000;
  const lk = Math.floor(n / 100000); n %= 100000;
  const th = Math.floor(n / 1000); n %= 1000;
  const hu = Math.floor(n / 100); const rest = n % 100;
  if (cr) p.push(`${two(cr)} Crore`);
  if (lk) p.push(`${two(lk)} Lakh`);
  if (th) p.push(`${two(th)} Thousand`);
  if (hu) p.push(`${ONES[hu]} Hundred`);
  if (rest) p.push(two(rest));
  return p.join(" ");
}

// Renders a maintenance payment receipt to a PDF Buffer (no Chromium needed).
function buildReceiptPdf({ bill, resident, society, account }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 0 });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const societyName = society?.name || account?.accountHolderName || "H2O Society";
    const isRzp = !!bill.paymentRef && String(bill.paymentRef).startsWith("pay_");
    const method =
      bill.paymentMode === "cash"
        ? "Cash" + (bill.collectedBy ? ` (collected by ${bill.collectedBy})` : "")
        : isRzp
        ? "Razorpay (UPI / Card / Net Banking)"
        : "Online / Test mode";
    const receiptNo = "RCPT-" + String(bill.paymentRef || bill.id).replace(/[^A-Za-z0-9]/g, "").slice(-10).toUpperCase();

    const W = 595; // A4 width in pt
    const L = 50;
    const R = W - 50;

    // Header band
    doc.rect(0, 0, W, 120).fill("#0B6E8F");
    doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(20).text(societyName, L, 34, { width: 380 });
    doc.font("Helvetica").fontSize(11).fillColor("#CDE9F2").text("Maintenance Payment Receipt", L, 62);
    // PAID stamp
    doc.roundedRect(R - 90, 40, 90, 34, 6).lineWidth(2).stroke("#7CF0A6");
    doc.fillColor("#7CF0A6").font("Helvetica-Bold").fontSize(16).text("PAID", R - 90, 49, { width: 90, align: "center" });

    // Amount
    let y = 150;
    doc.fillColor("#0B6E8F").font("Helvetica-Bold").fontSize(30).text(inr(bill.amount), L, y);
    y += 40;
    doc.fillColor("#6B7B85").font("Helvetica-Oblique").fontSize(11).text(`Rupees ${rupeesInWords(bill.amount)} only`, L, y);
    y += 30;

    const rows = [
      ["Receipt no.", receiptNo],
      ["Bill period", bill.period],
      ["Flat", bill.flat?.flatNo || "-"],
      ["Paid by", resident?.name || "-"],
      resident?.email ? ["Email", resident.email] : null,
      ["Payment date", fmtDateTime(bill.paidAt)],
      ["Payment method", method],
      ["Reference", bill.paymentRef || "-"],
    ].filter(Boolean);

    doc.font("Helvetica").fontSize(11);
    for (const [k, v] of rows) {
      doc.moveTo(L, y).lineTo(R, y).lineWidth(1).stroke("#EEF2F4");
      y += 10;
      doc.fillColor("#6B7B85").text(k, L, y, { width: 200 });
      doc.fillColor("#1B2B33").font("Helvetica-Bold").text(String(v), L + 200, y, { width: R - L - 200, align: "right" });
      doc.font("Helvetica");
      y += 20;
    }

    // Bank line
    const bankLine = [account?.bankName, account?.accountNumber ? `A/c ****${String(account.accountNumber).slice(-4)}` : null, account?.upiId ? `UPI ${account.upiId}` : null].filter(Boolean).join("  ·  ");
    if (bankLine) {
      y += 12;
      doc.rect(L, y, R - L, 36).fill("#EAF6FA");
      doc.fillColor("#0B6E8F").font("Helvetica").fontSize(10).text(`Credited to ${societyName}   ${bankLine}`, L + 12, y + 12, { width: R - L - 24 });
      y += 48;
    }

    doc.fillColor("#8895A0").font("Helvetica").fontSize(9).text(
      `This is a system-generated receipt and does not require a signature.  Generated on ${fmtDateTime(new Date())}.`,
      L, 770, { width: R - L, align: "center" }
    );

    doc.end();
  });
}

// Called after a bill is marked paid. Emails the resident a PDF receipt and
// notifies the society's admins (push + email summary). Never throws.
export async function onBillPaid(billId) {
  try {
    const bill = await prisma.bill.findUnique({ where: { id: billId }, include: { flat: true } });
    if (!bill) return;
    const societyId = bill.flat?.societyId;
    const [society, resident, account, admins] = await Promise.all([
      societyId ? prisma.society.findUnique({ where: { id: societyId } }) : null,
      prisma.user.findFirst({ where: { flatId: bill.flatId, role: "resident" } }),
      societyId ? prisma.societyAccount.findFirst({ where: { societyId }, orderBy: { createdAt: "asc" } }) : null,
      societyId ? prisma.user.findMany({ where: { societyId, role: "admin", active: true } }) : [],
    ]);

    const pdf = await buildReceiptPdf({ bill, resident, society, account });
    const flatNo = bill.flat?.flatNo || "flat";
    const filename = `Receipt-${flatNo}-${bill.period}`.replace(/\s+/g, "") + ".pdf";

    // 1) Email the resident their receipt PDF.
    if (resident?.email) {
      const text = `Hi ${resident.name},\n\nThank you! We received your maintenance payment of ${inr(bill.amount)} for ${bill.period} (Flat ${flatNo}). Your receipt is attached.\n\n— ${society?.name || "H2O Society"}`;
      const html = `<p>Hi ${resident.name},</p><p>Thank you! We received your maintenance payment of <b>${inr(bill.amount)}</b> for <b>${bill.period}</b> (Flat ${flatNo}). Your receipt is attached as a PDF.</p><p>— ${society?.name || "H2O Society"}</p>`;
      await sendEmail({
        to: resident.email,
        subject: `Payment receipt — Flat ${flatNo} — ${bill.period}`,
        text,
        html,
        attachments: [{ filename, content: pdf, contentType: "application/pdf" }],
      });
    }

    // 2) Notify admins (push + email summary of the payment).
    const summary = `Flat ${flatNo} paid ${inr(bill.amount)} for ${bill.period} (${bill.paymentMode === "cash" ? "cash" : "online"}).`;
    for (const admin of admins) {
      if (admin.expoPushToken) {
        await sendPush(admin.expoPushToken, "Maintenance payment received", summary, { type: "payment", billId: bill.id, flatNo });
      }
      if (admin.email) {
        await sendEmail({
          to: admin.email,
          subject: `Payment received — Flat ${flatNo} — ${bill.period}`,
          text: `${summary}\nPaid by: ${resident?.name || "-"}\nReference: ${bill.paymentRef || "-"}\nDate: ${fmtDateTime(bill.paidAt)}`,
          html: `<p><b>${summary}</b></p><p>Paid by: ${resident?.name || "-"}<br/>Reference: ${bill.paymentRef || "-"}<br/>Date: ${fmtDateTime(bill.paidAt)}</p>`,
        });
      }
    }
  } catch (e) {
    console.error("[paymentNotify] onBillPaid failed:", e.message);
  }
}
