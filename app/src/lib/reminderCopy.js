// Text the admin sees after "Remind unpaid residents". The GATEZO home is
// always the dashboard channel. WhatsApp only counts when Meta accepted it.
export function reminderResult(res = {}, labels = {}) {
  const payer = String(labels.payer || "resident").toLowerCase();
  const unit = String(labels.unit || "flat").toLowerCase();
  const lines = [];
  const home = Number(res.dashboard) || 0;
  if (home) {
    lines.push(`Reminder is on the GATEZO home for ${home} ${payer}${home === 1 ? "" : "s"} with dues.`);
  }
  if (res.whatsapp) lines.push(`WhatsApp sent to ${res.whatsapp}.`);
  if (res.whatsappPending) {
    const n = res.whatsappPending;
    lines.push(
      `WhatsApp is not connected on this server, so ${n} mobile number${n === 1 ? "" : "s"} did not get a chat message. The reminder is already on their GATEZO home.`
    );
  }
  if (res.phonesMissing && home) {
    const n = res.phonesMissing;
    lines.push(`${n} ${payer}${n === 1 ? " has" : "s have"} no mobile number, so WhatsApp could not be used for them.`);
  }
  if (res.pushed) lines.push(`Phone notification sent to ${res.pushed}.`);
  if (res.emailed) lines.push(`Email sent to ${res.emailed}.`);
  if (!home) {
    lines.push(
      res.unreachable?.length
        ? `No ${payer} login to remind.`
        : `No ${payer}s to remind — everyone is up to date.`
    );
  }
  if (res.unreachable?.length) {
    const shown = res.unreachable.slice(0, 6).join(", ");
    const more = res.unreachable.length > 6 ? ` and ${res.unreachable.length - 6} more` : "";
    lines.push(`${res.unreachable.length} ${unit}(s) have dues but no resident login: ${shown}${more}.`);
  }
  return lines.join("\n");
}
