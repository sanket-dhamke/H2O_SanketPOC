// Society books: Indian financial year, invoice numbers, Tally XML, and the
// three office reports. Dates are calendar days (YYYY-MM-DD), not timestamps.

export const LEDGERS = ["Bank", "Cash", "Maintenance income", "Vendor expense", "Security deposit", "Advance"];

export function financialYear(date = new Date()) {
  const y = date.getFullYear();
  const startYear = date.getMonth() + 1 >= 4 ? y : y - 1;
  return {
    label: `FY ${startYear}-${startYear + 1}`,
    start: `${startYear}-04-01`,
    end: `${startYear + 1}-03-31`,
  };
}

export function dateLocked(day, lockedThrough) {
  if (!lockedThrough) return false;
  return String(day || "").slice(0, 10) <= String(lockedThrough).slice(0, 10);
}

export function nextInvoiceNo(prefix, seq, year) {
  const n = String(Math.max(1, Number(seq) || 1)).padStart(4, "0");
  const head = String(prefix || "INV").replace(/[^A-Za-z0-9-]/g, "").slice(0, 12) || "INV";
  return `${head}-${year}-${n}`;
}

export function ageingDays(createdAt, now = Date.now()) {
  const t = new Date(createdAt).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((now - t) / 864e5));
}

export function ledgerBalance(vouchers) {
  let n = 0;
  for (const v of vouchers || []) {
    const amt = Number(v.amount) || 0;
    n += v.kind === "expense" ? -amt : amt;
  }
  return Math.round(n * 100) / 100;
}

export function reconcile(statementBalance, ledger) {
  const statement = Number(statementBalance) || 0;
  const book = Number(ledger) || 0;
  return {
    statementBalance: Math.round(statement * 100) / 100,
    ledgerBalance: Math.round(book * 100) / 100,
    difference: Math.round((statement - book) * 100) / 100,
  };
}

const INSIDE = new Set(["approved", "allowed_by_guard", "leave_at_gate"]);

export function visitorsInside(visitors) {
  return (visitors || []).filter((v) => v && !v.exitAt && INSIDE.has(v.status));
}

export function emptyFlatVisits(visitors, occupiedFlatIds) {
  const occupied = new Set(occupiedFlatIds || []);
  return (visitors || []).filter((v) => v?.flatId && !occupied.has(v.flatId));
}

export function duplicateHelpers(workers) {
  const byPhone = new Map();
  const byName = new Map();
  const flagged = [];
  for (const w of workers || []) {
    const phone = String(w.phone || "").replace(/\D/g, "").slice(-10);
    const name = String(w.name || "").trim().toLowerCase();
    if (phone && byPhone.has(phone)) flagged.push({ reason: "same phone", name: w.name, phone, other: byPhone.get(phone) });
    else if (phone) byPhone.set(phone, w.name);
    if (name && byName.has(name)) flagged.push({ reason: "same name", name: w.name, phone: w.phone || "", other: byName.get(name) });
    else if (name) byName.set(name, w.phone || w.name);
  }
  return flagged;
}

export function monthReport(bills, period) {
  const rows = (bills || []).filter((b) => !period || b.period === period);
  const invoiced = rows.reduce((s, b) => s + (Number(b.amount) || 0) + (Number(b.lateFee) || 0), 0);
  const collected = rows.reduce((s, b) => s + (Number(b.paid) || 0), 0);
  const pending = rows.reduce((s, b) => s + Math.max(0, (Number(b.amount) || 0) + (Number(b.lateFee) || 0) - (Number(b.paid) || 0)), 0);
  const pct = invoiced > 0 ? Math.round((collected / invoiced) * 1000) / 10 : 0;
  return {
    period: period || "all",
    invoiced: Math.round(invoiced),
    collected: Math.round(collected),
    pending: Math.round(pending),
    collectedPct: pct,
    count: rows.length,
  };
}

export function duesRows(bills, flats) {
  const byFlat = new Map();
  for (const b of bills || []) {
    const due = Math.max(0, (Number(b.amount) || 0) + (Number(b.lateFee) || 0) - (Number(b.paid) || 0));
    if (due <= 0.5) continue;
    const cur = byFlat.get(b.flatId) || { flatId: b.flatId, pending: 0, bills: 0 };
    cur.pending += due;
    cur.bills += 1;
    byFlat.set(b.flatId, cur);
  }
  const flatById = new Map((flats || []).map((f) => [f.id, f]));
  return [...byFlat.values()]
    .map((row) => {
      const flat = flatById.get(row.flatId);
      return {
        flatNo: flat?.flatNo || row.flatId,
        block: flat?.block || "",
        bills: row.bills,
        pending: Math.round(row.pending),
      };
    })
    .sort((a, b) => b.pending - a.pending);
}

function csvCell(value) {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows, columns) {
  const head = columns.map((c) => csvCell(c)).join(",");
  const body = (rows || []).map((row) => columns.map((c) => csvCell(row[c])).join(","));
  return [head, ...body].join("\n");
}

function tallyDate(day) {
  return String(day || "").replace(/-/g, "").slice(0, 8);
}

export function tallyXml(vouchers, societyName = "Society") {
  const blocks = (vouchers || []).map((v) => {
    const amount = Number(v.amount) || 0;
    const signed = v.kind === "expense" ? -amount : amount;
    const type = v.kind === "expense" ? "Payment" : "Receipt";
    return `    <TALLYMESSAGE xmlns:UDF="TallyUDF">
      <VOUCHER VCHTYPE="${type}" ACTION="Create">
        <DATE>${tallyDate(v.date)}</DATE>
        <NARRATION>${escapeXml(v.narration || v.ledger || "")}</NARRATION>
        <VOUCHERTYPENAME>${type}</VOUCHERTYPENAME>
        <PARTYLEDGERNAME>${escapeXml(societyName)}</PARTYLEDGERNAME>
        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>${escapeXml(v.ledger || "Bank")}</LEDGERNAME>
          <ISDEEMEDPOSITIVE>${v.kind === "expense" ? "Yes" : "No"}</ISDEEMEDPOSITIVE>
          <AMOUNT>${signed}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>
      </VOUCHER>
    </TALLYMESSAGE>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>${escapeXml(societyName)}</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC>
      <REQUESTDATA>
${blocks.join("\n")}
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>
`;
}

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
