import { Platform } from "react-native";
import { brand } from "./brand";

// Shared Razorpay Checkout options.
//
// There is exactly one payment screen: Razorpay's. We used to show our own
// "Pay via UPI" sheet first, which listed Google Pay / PhonePe / Paytm even on
// accounts where UPI is switched off — tapping one then landed on a checkout
// with cards and net banking only. `methods` comes from the server (the real
// instruments this Razorpay account can charge) so the sheet that opens is the
// only thing the resident ever sees.

const UPI_APPS = ["google_pay", "phonepe", "paytm", "bhim"];

export function checkoutOptions(order, methods) {
  const digits = String(order.prefill?.contact || order.prefill?.phone || "").replace(/\D/g, "");
  const contact = digits.length >= 10 ? digits.slice(-10) : undefined;
  const upi = methods ? methods.upi !== false : true;

  const prefill = {};
  // Landing straight on UPI only makes sense when the account has UPI.
  if (upi) prefill.method = "upi";
  if (order.prefill?.email) prefill.email = order.prefill.email;
  if (contact) prefill.contact = contact;

  const options = {
    key: order.keyId,
    order_id: order.orderId,
    amount: order.amount,
    currency: order.currency || "INR",
    name: brand.name,
    description: order.description,
    prefill,
    hidden: {
      email: true,
      contact: true,
    },
    method: {
      upi: upi ? 1 : 0,
      card: methods && methods.card === false ? 0 : 1,
      netbanking: methods && methods.netbanking === false ? 0 : 1,
      wallet: methods && methods.wallet ? 1 : 0,
      emi: 0,
      paylater: 0,
    },
    theme: { color: "#0B6E8F" },
  };

  // Desktop checkout buries UPI intent apps unless they are spelled out.
  if (Platform.OS === "web" && upi) {
    const sequence = ["block.upi_apps", "upi"];
    if (options.method.card) sequence.push("card");
    if (options.method.netbanking) sequence.push("netbanking");
    options.config = {
      display: {
        blocks: {
          upi_apps: {
            name: "Pay via UPI",
            instruments: [
              { method: "upi", flows: ["intent"], apps: UPI_APPS },
              { method: "upi", flows: ["qr"] },
            ],
          },
        },
        hide: options.method.wallet ? [] : [{ method: "wallet" }],
        sequence,
        preferences: { show_default_blocks: false },
      },
    };
  }

  return options;
}
