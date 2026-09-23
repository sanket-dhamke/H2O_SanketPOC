// Attendance periods follow the society clock in India, Monday to Sunday.

export function indiaYmd(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function addDays(ymd, days) {
  const [year, month, day] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const WEEKDAY = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

export function periodBounds(kind, now = new Date()) {
  const today = indiaYmd(now);
  if (kind === "week") {
    const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", weekday: "short" }).format(now);
    const from = addDays(today, -(WEEKDAY[weekday] ?? 0));
    return { from, to: addDays(from, 6) };
  }
  if (kind === "month") {
    const [year, month] = today.split("-");
    const last = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
    return { from: `${year}-${month}-01`, to: `${year}-${month}-${String(last).padStart(2, "0")}` };
  }
  return { from: today, to: today };
}

export function visitsInPeriod(rows, kind, now = new Date()) {
  const { from, to } = periodBounds(kind, now);
  return (rows || []).filter((row) => row && row.date >= from && row.date <= to);
}

export function summarizeVisits(rows) {
  const days = new Set();
  let minutes = 0;
  let open = 0;
  for (const row of rows || []) {
    if (row?.date) days.add(row.date);
    if (!row?.outAt) {
      open += 1;
      continue;
    }
    const span = new Date(row.outAt) - new Date(row.inAt);
    if (span > 0) minutes += Math.round(span / 60000);
  }
  return { days: days.size, visits: (rows || []).length, minutes, open };
}

export function formatHours(minutes) {
  const total = Math.max(0, Number(minutes) || 0);
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (!hours) return `${rest}m`;
  if (!rest) return `${hours}h`;
  return `${hours}h ${rest}m`;
}
