// Shared Razorpay Checkout options so UPI (GPay, PhonePe, Paytm, UPI ID)
// is the first method on web and native, with card / netbanking still available.

const UPI_APPS = ["google_pay", "phonepe", "paytm", "bhim"];

export function checkoutOptions(order, preference = {}) {
  const digits = String(order.prefill?.contact || order.prefill?.phone || "").replace(/\D/g, "");
  const contact = digits.length >= 10 ? digits.slice(-10) : undefined;
  const method = preference.method || "upi";
  const apps = preference.app ? [preference.app] : UPI_APPS;

  return {
    key: order.keyId,
    order_id: order.orderId,
    amount: order.amount,
    currency: order.currency || "INR",
    name: order.name,
    description: order.description,
    prefill: {
      name: order.prefill?.name || "",
      email: order.prefill?.email || "",
      ...(contact ? { contact } : null),
      method,
    },
    method: {
      upi: true,
      card: true,
      netbanking: true,
      wallet: true,
      emi: false,
      paylater: false,
    },
    config: {
      display: {
        blocks: {
          upi_apps: {
            name: "Pay via UPI",
            instruments: [
              { method: "upi", flows: ["intent"], apps },
              { method: "upi", flows: ["collect"] },
              { method: "upi", flows: ["qr"] },
            ],
          },
        },
        sequence: ["block.upi_apps", "upi", "card", "netbanking", "wallet"],
        preferences: { show_default_blocks: true },
      },
    },
    notes: {
      method_hint: "upi",
    },
    theme: { color: "#0B6E8F" },
  };
}
