// Amenity payments follow the India calendar. A slot whose day has passed
// can stay in history, but it is no longer something to pay.

export function indiaToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function bookingDatePassed(date, today = indiaToday()) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(date || "")) && String(date) < today;
}
