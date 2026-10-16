// Society dates are read on the India calendar. A notice that names a day
// which has already passed leaves "Needs your attention" on the next morning.

const MONTH = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const MONTH_WORD = "january|february|march|april|june|july|august|september|sept|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec";

export function calendarDay(now = Date.now()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(now));
  const get = (type) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function ymd(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// Dates written in a title or body: "2 Oct", "2nd October 2026", "October 15, 2026", "2026-10-02".
export function eventDatesIn(text, today) {
  const source = String(text || "");
  const year = Number(String(today || "").slice(0, 4)) || Number(calendarDay().slice(0, 4));
  const found = [];
  const push = (value) => {
    if (value && !found.includes(value)) found.push(value);
  };
  for (const match of source.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g)) {
    push(ymd(match[1], match[2], match[3]));
  }
  const dayFirst = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+of)?\\s+(${MONTH_WORD})(?:\\s*,?\\s*(20\\d{2}))?\\b`, "gi");
  for (const match of source.matchAll(dayFirst)) {
    push(ymd(match[3] || year, MONTH[match[2].toLowerCase()], match[1]));
  }
  const monthFirst = new RegExp(`\\b(${MONTH_WORD})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*,?\\s*(20\\d{2}))?\\b`, "gi");
  for (const match of source.matchAll(monthFirst)) {
    push(ymd(match[3] || year, MONTH[match[1].toLowerCase()], match[2]));
  }
  return found;
}

// True when the text names at least one calendar day and every one of those days is before today.
export function eventDatePassed(text, now = Date.now()) {
  const today = calendarDay(now);
  const dates = eventDatesIn(text, today);
  if (!dates.length) return false;
  return dates.every((day) => day < today);
}

export function withoutPassedDates(summary, now = Date.now()) {
  if (!summary) return summary;
  return {
    ...summary,
    pending: (summary.pending || []).filter((row) => !eventDatePassed(`${row.label || ""} ${row.detail || ""}`, now)),
  };
}
