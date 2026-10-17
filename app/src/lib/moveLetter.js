// Society letters for an owner or tenant moving in or out.
// Exit uses a no-objection certificate. Entry uses a shifting permission.
// Both name the service-lift fee for moving household goods.

function prettyDay(ymd) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd || ""));
  if (!match) return ymd || "—";
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${Number(match[3])} ${names[Number(match[2]) - 1] || match[2]} ${match[1]}`;
}

const rupee = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;

export function buildMoveLetter({ societyName, move, issuedOn }) {
  const exit = move?.kind === "move_out";
  const who = move?.occupantType === "owner" ? "owner" : "tenant";
  const society = societyName || "the society";
  const flat = [move?.flatNo ? `Flat ${move.flatNo}` : "the flat", move?.block ? `Wing ${move.block}` : ""]
    .filter(Boolean)
    .join(", ");
  const title = exit ? "No objection certificate" : "Shifting permission";
  const subject = exit
    ? `Exit of ${move?.residentName || "the resident"} from ${flat}`
    : `Entry of ${move?.residentName || "the resident"} into ${flat}`;
  const lift = move?.liftCharge > 0
    ? `${rupee(move.liftCharge)} for the service lift, ${move.chargePaid ? "paid" : "still due"}.`
    : "No service-lift charge is recorded for this move.";
  const dues = exit
    ? Number(move?.dues) > 0
      ? `Maintenance still outstanding on this flat: ${rupee(move.dues)}.`
      : "Maintenance on this flat is clear."
    : "";
  const body = exit
    ? `This is to certify that ${move?.residentName || "the resident"}, ${who} of ${flat}, is leaving ${society} on ${prettyDay(move?.date)}. The society has no objection to this ${who} moving their household goods out, using the service lift, once the amounts below are settled.`
    : `This permits ${move?.residentName || "the resident"}, ${who} of ${flat}, to move into ${society} on ${prettyDay(move?.date)} and to use the service lift for household goods.`;
  const when = prettyDay(issuedOn || new Date().toISOString().slice(0, 10));
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${title}</title>
<style>
  body { font-family: Georgia, serif; color: #1B2B33; margin: 40px; }
  h1 { font-size: 22px; margin-bottom: 0; }
  .society { color: #0B6E8F; font-weight: 700; letter-spacing: 0.4px; }
  .rule { border: none; border-top: 2px solid #0B6E8F; margin: 16px 0; }
  p { line-height: 1.5; }
  .box { border: 1px solid #D6DEE3; border-radius: 8px; padding: 12px 16px; margin-top: 16px; }
  .sign { margin-top: 48px; }
</style></head><body>
  <div class="society">${society}</div>
  <h1>${title}</h1>
  <div>Date: ${when}</div>
  <hr class="rule">
  <p><strong>Subject:</strong> ${subject}</p>
  <p>${body}</p>
  <div class="box">
    <div>Person: ${move?.residentName || "—"} · ${who}</div>
    <div>Flat: ${flat}</div>
    <div>${exit ? "Leaving" : "Moving in"}: ${prettyDay(move?.date)}</div>
    <div>Service lift: ${lift}</div>
    ${dues ? `<div>${dues}</div>` : ""}
    ${move?.depositAmount ? `<div>Security deposit on record: ${rupee(move.depositAmount)}.</div>` : ""}
  </div>
  <p>Security may allow the shifting vehicle and crew on this letter. Household goods should use the service lift, and common areas should be left clear.</p>
  <div class="sign">
    <div>For ${society}</div>
    <div style="margin-top:28px">Society office</div>
  </div>
</body></html>`;
  const slug = String(move?.flatNo || "flat").replace(/\s+/g, "");
  const filename = exit ? `NOC-${slug}` : `Shifting-${slug}`;
  return { html, filename, title };
}
