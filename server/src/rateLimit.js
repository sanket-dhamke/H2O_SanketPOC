import rateLimit from "express-rate-limit";

// Rate limiting to protect the API from abuse/spikes. In-memory store (per
// instance) by default — good enough for a single or few instances; move to a
// shared Redis store when running many instances. Disable entirely with
// RATE_LIMIT_ENABLED=false. Generous defaults so normal usage is never touched.

const enabled = process.env.RATE_LIMIT_ENABLED !== "false";

// Paths that must never be throttled: health checks, external cron triggers,
// the payment webhook, and the high-frequency gate scanner endpoints (a busy
// lane can legitimately burst). These authenticate by their own secrets.
function isExempt(req) {
  const p = req.path || "";
  return (
    p === "/api/health" ||
    p === "/api/razorpay/webhook" ||
    p.startsWith("/api/cron/") ||
    p.startsWith("/api/gate/") ||
    p === "/api/verify" || // gate device verify (mounted under /api)
    p === "/api/whitelist"
  );
}

// Broad limiter for the whole API. ~600 req/min per IP by default.
export const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX || 600),
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => !enabled || isExempt(req),
  message: { message: "Too many requests, please slow down." },
});

// Tight limiter for credential endpoints (login, forgot/reset password) to blunt
// brute-force + OTP guessing. ~40 attempts / 15 min per IP.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT_MAX || 40),
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => !enabled,
  message: { message: "Too many attempts. Please try again in a few minutes." },
});

// Moderate limiter for the AI assistant (protects the upstream LLM quota/cost).
export const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.AI_RATE_LIMIT_MAX || 30),
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => !enabled,
  message: { message: "You're sending messages too fast. Please wait a moment." },
});
