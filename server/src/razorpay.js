import Razorpay from "razorpay";

// Razorpay is optional: if keys are not set, the app falls back to a mock
// "mark as paid" so the demo still works without a payment account.
export const RZP_KEY_ID = process.env.RAZORPAY_KEY_ID || "";
export const RZP_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || "";
export const razorpayEnabled = Boolean(RZP_KEY_ID && RZP_KEY_SECRET);

export const razorpay = razorpayEnabled
  ? new Razorpay({ key_id: RZP_KEY_ID, key_secret: RZP_KEY_SECRET })
  : null;

// Which instruments this Razorpay account can actually charge. Checkout only
// offers what the account has enabled, so a key with UPI switched off shows
// Cards/Netbanking/Wallet only. Asking Razorpay up front lets the app describe
// the real options instead of promising Google Pay and then not showing it.
const METHODS_URL = "https://api.razorpay.com/v1/methods";
const METHODS_TTL_MS = 10 * 60 * 1000;
let methodsCache = { at: 0, value: null };

// Razorpay answers with either a boolean or a map of instruments per method
// (e.g. netbanking: { HDFC: "HDFC Bank" }). Treat a non-empty map as enabled.
function enabled(value) {
  if (typeof value === "boolean") return value;
  if (value && typeof value === "object") return Object.values(value).some(Boolean);
  return false;
}

export async function getEnabledMethods() {
  if (!razorpayEnabled) return null;
  if (methodsCache.value && Date.now() - methodsCache.at < METHODS_TTL_MS) {
    return methodsCache.value;
  }
  try {
    const res = await fetch(`${METHODS_URL}?key_id=${encodeURIComponent(RZP_KEY_ID)}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const value = {
      upi: enabled(data.upi),
      card: enabled(data.card),
      netbanking: enabled(data.netbanking),
      wallet: enabled(data.wallet),
    };
    // An account with nothing enabled means we read it wrong (or the key is not
    // activated yet). Reporting that would leave checkout with no instruments,
    // so treat it as unknown and let Razorpay decide.
    if (!Object.values(value).some(Boolean)) return null;
    methodsCache = { at: Date.now(), value };
    return value;
  } catch (err) {
    // Unknown is not the same as disabled: the caller falls back to showing
    // every method rather than hiding one Razorpay would have accepted.
    console.warn("[razorpay] could not read enabled methods:", err.message);
    return null;
  }
}
