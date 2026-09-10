import { Platform } from "react-native";
import { brand } from "./brand";

// Shared Razorpay Checkout options. Native ignores web-only `config.display`
// blocks (those were hiding UPI on Android). Web keeps an explicit UPI block.

const UPI_APPS = ["google_pay", "phonepe", "paytm", "bhim"];

export function checkoutOptions(order, preference = {}) {
  const digits = String(order.prefill?.contact || order.prefill?.phone || "").replace(/\D/g, "");
  const contact = digits.length >= 10 ? digits.slice(-10) : undefined;
  const method = preference.method || "upi";
  const apps = preference.app ? [preference.app] : UPI_APPS;

  const prefill = { method };
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
      upi: 1,
      card: 1,
      netbanking: 1,
      wallet: 0,
      emi: 0,
      paylater: 0,
    },
    theme: { color: "#0B6E8F" },
  };

  if (Platform.OS === "web") {
    options.config = {
      display: {
        blocks: {
          upi_apps: {
            name: "Pay via UPI",
            instruments: [
              { method: "upi", flows: ["intent"], apps },
              { method: "upi", flows: ["qr"] },
            ],
          },
        },
        hide: [{ method: "wallet" }],
        sequence: ["block.upi_apps", "upi", "card", "netbanking"],
        preferences: { show_default_blocks: false },
      },
    };
  }

  return options;
}
