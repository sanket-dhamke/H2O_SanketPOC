// Builds a printable HTML wing/society report from the admin report payload.
// Rendered to PDF via the shared downloadReceipt() helper (web + native).

function inr(n) {
  return `\u20B9${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}
function fmtDate(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
function esc(s) {
  return String(s ?? "-").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function fmtTime(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}
function fmtDateTime(iso) {
  if (!iso) return "-";
  return `${fmtDate(iso)} ${fmtTime(iso)}`;
}

const VSTATUS = {
  pending: "Waiting",
  approved: "Approved",
  rejected: "Rejected",
  leave_at_gate: "Left at gate",
};

// Preschool report: visitor entries/exits + staff attendance history.
export function buildSchoolReportHtml(report) {
  const t = report.totals || {};
  const visitorRows = (report.visitors || [])
    .map(
      (v) => `<tr>
        <td>${esc(v.name)}</td>
        <td>${esc(v.flatNo)}</td>
        <td>${esc(v.purpose)}</td>
        <td>${esc(v.phone)}</td>
        <td>${esc(fmtDateTime(v.createdAt))}</td>
        <td>${v.exitAt ? esc(fmtTime(v.exitAt)) : '<span class="due">Inside</span>'}</td>
        <td>${esc(VSTATUS[v.status] || v.status)}</td>
      </tr>`
    )
    .join("");

  const staffRows = (report.staff || [])
    .map(
      (s) => `<tr>
        <td>${esc(s.name)}</td>
        <td>${esc(s.role)}</td>
        <td>${esc(s.date)}</td>
        <td>${esc(fmtTime(s.inAt))}</td>
        <td>${s.outAt ? esc(fmtTime(s.outAt)) : '<span class="due">On premise</span>'}</td>
      </tr>`
    )
    .join("");

  const filename = `GateMate-${esc(report.societyName).replace(/[^A-Za-z0-9]/g, "")}-school-report`;

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(report.societyName)} — School report</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1B2B33; margin: 0; padding: 24px; background: #fff; }
  .wrap { max-width: 900px; margin: 0 auto; }
  .head { background: #0B6E8F; color: #fff; padding: 22px 26px; border-radius: 14px; }
  .society { font-size: 22px; font-weight: 800; }
  .subtitle { color: #CDE9F2; font-size: 13px; margin-top: 4px; }
  .cards { display: flex; gap: 12px; margin: 18px 0; flex-wrap: wrap; }
  .kpi { flex: 1; min-width: 120px; border: 1px solid #E1E8EC; border-radius: 12px; padding: 14px 16px; }
  .kpi .l { color: #6B7B85; font-size: 12px; }
  .kpi .v { font-size: 20px; font-weight: 800; margin-top: 4px; }
  h2 { font-size: 15px; margin: 24px 0 8px; color: #0B6E8F; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; background: #EAF4F7; color: #0B6E8F; padding: 9px 10px; font-size: 11px; text-transform: uppercase; letter-spacing: .4px; }
  td { padding: 9px 10px; border-bottom: 1px solid #EEF2F4; vertical-align: top; }
  .due { color: #C2571A; font-weight: 700; }
  .footer { color: #8895A0; font-size: 11px; text-align: center; margin-top: 22px; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <div class="wrap">
    <div class="head">
      <div class="society">${esc(report.societyName)}</div>
      <div class="subtitle">Visitors & staff attendance · last ${esc(report.days)} days</div>
      <div class="subtitle">Generated ${esc(fmtDate(report.generatedAt))}</div>
    </div>

    <div class="cards">
      <div class="kpi"><div class="l">Visitors (total)</div><div class="v">${t.visitorsTotal ?? 0}</div></div>
      <div class="kpi"><div class="l">Visitors today</div><div class="v">${t.visitorsToday ?? 0}</div></div>
      <div class="kpi"><div class="l">Inside now</div><div class="v">${t.insideNow ?? 0}</div></div>
      <div class="kpi"><div class="l">Staff on premise</div><div class="v">${t.staffOnPremise ?? 0}</div></div>
    </div>

    <h2>Visitor log</h2>
    <table>
      <thead><tr><th>Name</th><th>Student</th><th>Purpose</th><th>Phone</th><th>Entry</th><th>Exit</th><th>Status</th></tr></thead>
      <tbody>${visitorRows || `<tr><td colspan="7">No visitors.</td></tr>`}</tbody>
    </table>

    <h2>Staff attendance</h2>
    <table>
      <thead><tr><th>Name</th><th>Role</th><th>Date</th><th>In</th><th>Out</th></tr></thead>
      <tbody>${staffRows || `<tr><td colspan="5">No staff attendance records.</td></tr>`}</tbody>
    </table>

    <div class="footer">System-generated report. For preschool records & backup.</div>
  </div>
</body>
</html>`;

  return { html, filename };
}

export function buildWingReportHtml(report) {
  const { society, wing, totals } = report;
  const flatRows = (report.flats || [])
    .map((f) => {
      const names = (f.residents || []).map((r) => esc(r.name)).join(", ") || "-";
      const status = f.pending > 0 ? `<span class="due">${inr(f.pending)} due</span>` : `<span class="ok">Cleared</span>`;
      return `<tr>
        <td>${esc(f.flatNo)}</td>
        <td>${esc(f.ownerName)}</td>
        <td>${names}</td>
        <td class="r">${inr(f.paid)}</td>
        <td class="r">${status}</td>
      </tr>`;
    })
    .join("");

  const dueRows = (report.dues || [])
    .map((d) => `<tr><td>${esc(d.flatNo)}</td><td>${esc(d.ownerName)}</td><td class="r due">${inr(d.pending)}</td></tr>`)
    .join("");

  const paymentRows = (report.payments || [])
    .slice(0, 200)
    .map(
      (p) =>
        `<tr><td>${esc(p.flatNo)}</td><td>${esc(p.period)}</td><td>${esc(p.mode)}</td><td>${esc(fmtDate(p.paidAt))}</td><td class="r">${inr(p.amount)}</td></tr>`
    )
    .join("");

  const filename = `H2O-${esc(society?.name).replace(/[^A-Za-z0-9]/g, "")}-${String(wing).replace(/[^A-Za-z0-9]/g, "")}-report`;

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(society?.name)} — ${esc(wing)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1B2B33; margin: 0; padding: 24px; background: #fff; }
  .wrap { max-width: 900px; margin: 0 auto; }
  .head { background: #0B6E8F; color: #fff; padding: 22px 26px; border-radius: 14px; display: flex; justify-content: space-between; align-items: flex-start; }
  .society { font-size: 22px; font-weight: 800; }
  .subtitle { color: #CDE9F2; font-size: 13px; margin-top: 4px; }
  .wing { text-align: right; }
  .wing .label { color: #CDE9F2; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; }
  .wing .val { font-size: 20px; font-weight: 800; }
  .cards { display: flex; gap: 12px; margin: 18px 0; flex-wrap: wrap; }
  .kpi { flex: 1; min-width: 130px; border: 1px solid #E1E8EC; border-radius: 12px; padding: 14px 16px; }
  .kpi .l { color: #6B7B85; font-size: 12px; }
  .kpi .v { font-size: 20px; font-weight: 800; margin-top: 4px; }
  .green { color: #2E9E52; } .orange { color: #C2571A; }
  h2 { font-size: 15px; margin: 24px 0 8px; color: #0B6E8F; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; background: #EAF4F7; color: #0B6E8F; padding: 9px 10px; font-size: 11px; text-transform: uppercase; letter-spacing: .4px; }
  td { padding: 9px 10px; border-bottom: 1px solid #EEF2F4; vertical-align: top; }
  td.r, th.r { text-align: right; }
  .due { color: #C2571A; font-weight: 700; }
  .ok { color: #2E9E52; font-weight: 700; }
  .footer { color: #8895A0; font-size: 11px; text-align: center; margin-top: 22px; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <div class="wrap">
    <div class="head">
      <div>
        <div class="society">${esc(society?.name)}</div>
        <div class="subtitle">${esc(society?.address || society?.city || "")}</div>
        <div class="subtitle">Generated ${esc(fmtDate(report.generatedAt))}</div>
      </div>
      <div class="wing">
        <div class="label">Report scope</div>
        <div class="val">${esc(wing)}</div>
      </div>
    </div>

    <div class="cards">
      <div class="kpi"><div class="l">Flats</div><div class="v">${totals?.flats ?? 0}</div></div>
      <div class="kpi"><div class="l">Residents</div><div class="v">${totals?.residents ?? 0}</div></div>
      <div class="kpi"><div class="l">Collected</div><div class="v green">${inr(totals?.collected)}</div></div>
      <div class="kpi"><div class="l">Pending dues</div><div class="v orange">${inr(totals?.pending)}</div></div>
    </div>

    <h2>Flats & residents</h2>
    <table>
      <thead><tr><th>Flat</th><th>Owner</th><th>Residents</th><th class="r">Paid</th><th class="r">Status</th></tr></thead>
      <tbody>${flatRows || `<tr><td colspan="5">No flats.</td></tr>`}</tbody>
    </table>

    ${
      dueRows
        ? `<h2>Outstanding dues</h2>
    <table>
      <thead><tr><th>Flat</th><th>Owner</th><th class="r">Pending</th></tr></thead>
      <tbody>${dueRows}</tbody>
    </table>`
        : ""
    }

    ${
      paymentRows
        ? `<h2>Payments received</h2>
    <table>
      <thead><tr><th>Flat</th><th>Period</th><th>Mode</th><th>Date</th><th class="r">Amount</th></tr></thead>
      <tbody>${paymentRows}</tbody>
    </table>`
        : ""
    }

    <div class="footer">System-generated by H2O. For society records & backup.</div>
  </div>
</body>
</html>`;

  return { html, filename };
}
