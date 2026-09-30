// JSON logs so a free host (Render) or a later log drain can grep by level,
// request id, and society. Never log passwords, tokens, or card data.

function safeMeta(meta) {
  if (!meta || typeof meta !== "object") return {};
  const out = { ...meta };
  for (const key of ["password", "token", "authorization", "secret", "apiKey", "card"]) {
    if (key in out) out[key] = "[redacted]";
  }
  return out;
}

function write(level, msg, meta) {
  const line = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...safeMeta(meta),
  };
  const text = JSON.stringify(line);
  if (level === "error") console.error(text);
  else if (level === "warn") console.warn(text);
  else console.log(text);
}

export const log = {
  info: (msg, meta) => write("info", msg, meta),
  warn: (msg, meta) => write("warn", msg, meta),
  error: (msg, meta) => write("error", msg, meta),
};
