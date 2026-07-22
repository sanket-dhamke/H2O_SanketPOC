// Minimal RFC-4180-ish CSV parser (handles quoted fields, escaped quotes,
// commas and newlines inside quotes). Returns an array of row-objects keyed by
// the header row. No external dependency.
export function parseCsv(text) {
  const rows = [];
  let field = "";
  let row = [];
  let inQuotes = false;
  const s = String(text || "").replace(/\r\n?/g, "\n");

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  // flush last field/row
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Drop fully-empty rows.
  const clean = rows.filter((r) => r.some((c) => String(c).trim() !== ""));
  if (clean.length === 0) return [];

  const headers = clean[0].map((h) => String(h).trim().toLowerCase().replace(/\s+/g, ""));
  return clean.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = (r[idx] ?? "").trim();
    });
    return obj;
  });
}
