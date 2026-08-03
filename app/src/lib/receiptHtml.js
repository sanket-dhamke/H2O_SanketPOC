// Builds a detailed, printable HTML payment receipt. Shared by web and native
// download helpers (see receipt.web.js / receipt.native.js).

// Formats a number using the Indian grouping system (e.g. 1,23,456).
function inr(n) {
  const num = Number(n || 0);
  return num.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n) {
  if (n < 20) return ONES[n];
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? " " + ONES[n % 10] : ""}`;
}

// Converts an integer amount (up to crores) into Indian-style words.
function rupeesInWords(amount) {
  let n = Math.floor(Number(amount || 0));
  if (n === 0) return "Zero";
  const parts = [];
  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  if (crore) parts.push(`${twoDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (hundred) parts.push(`${ONES[hundred]} Hundred`);
  if (rest) parts.push(twoDigits(rest));
  return parts.join(" ");
}

function fmtDateTime(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function esc(s) {
  return String(s ?? "-").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );
}

// Returns { html, filename } for the given paid bill.
export function buildReceipt({ bill, user, payee }) {
  const societyName = payee?.accountHolderName || "GateMate Society";
  const isRazorpay = !!bill?.paymentRef && String(bill.paymentRef).startsWith("pay_");
  const method = isRazorpay ? "Razorpay (UPI / Card / Net Banking)" : "Manual / Test mode";
  const receiptNo =
    "RCPT-" + String(bill?.paymentRef || bill?.id || "").replace(/[^A-Za-z0-9]/g, "").slice(-10).toUpperCase();

  const bankLine = [
    payee?.bankName,
    payee?.last4 ? `A/c ••••${esc(payee.last4)}` : null,
    payee?.upiId ? `UPI ${esc(payee.upiId)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const rows = [
    ["Receipt no.", esc(receiptNo)],
    ["Bill period", esc(bill?.period)],
    ["Flat", esc(bill?.flatNo)],
    ["Paid by", esc(user?.name)],
    user?.email ? ["Email", esc(user.email)] : null,
    ["Payment date", esc(fmtDateTime(bill?.paidAt))],
    ["Payment method", esc(method)],
    ["Payment ID", esc(bill?.paymentRef)],
  ].filter(Boolean);

  const filename = `Receipt-${(bill?.flatNo || "flat")}-${(bill?.period || "")}`.replace(/\s+/g, "");

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(receiptNo)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1B2B33; margin: 0; padding: 24px; background: #fff; }
  .card { max-width: 640px; margin: 0 auto; border: 1px solid #E1E8EC; border-radius: 14px; overflow: hidden; }
  .head { background: #0B6E8F; color: #fff; padding: 24px 28px; display: flex; justify-content: space-between; align-items: flex-start; }
  .society { font-size: 20px; font-weight: 800; }
  .subtitle { color: #CDE9F2; font-size: 12px; margin-top: 4px; }
  .stamp { border: 2px solid #7CF0A6; color: #7CF0A6; padding: 6px 12px; border-radius: 8px; font-weight: 800; letter-spacing: 1px; font-size: 13px; }
  .body { padding: 24px 28px; }
  .amount { font-size: 34px; font-weight: 800; color: #0B6E8F; }
  .words { color: #6B7B85; font-size: 13px; margin-top: 2px; font-style: italic; }
  table { width: 100%; border-collapse: collapse; margin-top: 20px; }
  td { padding: 10px 0; border-top: 1px solid #EEF2F4; font-size: 14px; vertical-align: top; }
  td.k { color: #6B7B85; width: 42%; }
  td.v { color: #1B2B33; font-weight: 600; text-align: right; word-break: break-word; }
  .bank { margin-top: 20px; background: #EAF6FA; border-radius: 10px; padding: 12px 14px; color: #0B6E8F; font-size: 12px; }
  .footer { padding: 16px 28px 24px; color: #8895A0; font-size: 11px; text-align: center; }
  @media print { body { padding: 0; } .card { border: none; } }
</style>
</head>
<body>
  <div class="card">
    <div class="head">
      <div>
        <div class="society">${esc(societyName)}</div>
        <div class="subtitle">Maintenance Payment Receipt</div>
      </div>
      <div class="stamp">PAID</div>
    </div>
    <div class="body">
      <div class="amount">₹${inr(bill?.amount)}</div>
      <div class="words">Rupees ${esc(rupeesInWords(bill?.amount))} only</div>
      <table>
        ${rows.map(([k, v]) => `<tr><td class="k">${k}</td><td class="v">${v}</td></tr>`).join("")}
      </table>
      ${bankLine ? `<div class="bank">Credited to <b>${esc(societyName)}</b> · ${bankLine}</div>` : ""}
    </div>
    <div class="footer">
      This is a system-generated receipt and does not require a signature.<br/>
      Generated on ${esc(fmtDateTime(new Date().toISOString()))}.
    </div>
  </div>
</body>
</html>`;

  return { html, filename };
}
