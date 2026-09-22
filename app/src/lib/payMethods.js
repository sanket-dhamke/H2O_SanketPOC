import { api } from "./api";

// What the society's Razorpay account can actually charge. Checkout decides
// this server-side, so the app asks once per session and uses the answer both
// for the checkout config and for the "how you can pay" line on the bills tab.
//
// `known: false` means we could not read the account (offline, old server):
// assume the usual UPI + card + net banking rather than hiding anything.
const UNKNOWN = { enabled: true, known: false, upi: true, card: true, netbanking: true, wallet: false };

let cached = null;
let inflight = null;

export function cachedPaymentMethods() {
  return cached;
}

export async function loadPaymentMethods() {
  if (cached) return cached;
  if (!inflight) {
    inflight = api
      .paymentMethods()
      .then((m) => {
        cached = { ...UNKNOWN, ...m };
        return cached;
      })
      .catch(() => UNKNOWN)
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

function listWords(words) {
  if (words.length <= 1) return words[0] || "";
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

// One sentence describing what tapping Pay will show, so the bills tab never
// promises Google Pay on an account where UPI is switched off.
export function payMethodsHint(methods) {
  const m = methods || UNKNOWN;
  if (!m.enabled) return "Payments are in test mode — Pay marks the bill as settled without charging you.";
  if (!m.known) return "Pay opens Razorpay — UPI, card or net banking, depending on what your society has enabled.";

  const rest = listWords([m.card && "card", m.netbanking && "net banking", m.wallet && "wallets"].filter(Boolean));

  if (m.upi) {
    const also = rest ? ` ${rest[0].toUpperCase()}${rest.slice(1)} also work.` : "";
    return `Pay opens Razorpay with UPI first — pick Google Pay, PhonePe, Paytm or a UPI ID and that app opens to approve.${also}`;
  }
  return `UPI is off on your society's payment account, so Pay opens Razorpay with ${rest || "the available options"}. Ask your admin to enable UPI in Razorpay for Google Pay, PhonePe and Paytm.`;
}
