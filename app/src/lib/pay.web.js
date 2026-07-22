import { api } from "./api";

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

// Loads Razorpay's browser checkout script once and caches the promise.
let scriptPromise = null;
function loadCheckoutScript() {
  if (window.Razorpay) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = CHECKOUT_SRC;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Razorpay checkout"));
    document.body.appendChild(s);
  });
  return scriptPromise;
}

// Web version of the payment flow: create order -> open Razorpay web checkout
// -> verify signature. Returns { paid, mock }, { cancelled } or throws.
export async function payBill(bill, amount) {
  const order = await api.createOrder(bill.id, amount);

  if (!order.enabled) {
    await api.payBill(bill.id, amount);
    return { paid: true, mock: true };
  }

  await loadCheckoutScript();

  const result = await new Promise((resolve, reject) => {
    const rzp = new window.Razorpay({
      key: order.keyId,
      order_id: order.orderId,
      amount: order.amount,
      currency: order.currency,
      name: order.name,
      description: order.description,
      prefill: {
        name: order.prefill?.name,
        email: order.prefill?.email,
      },
      theme: { color: "#0B6E8F" },
      handler: (response) => resolve(response),
      modal: { ondismiss: () => resolve(null) },
    });
    rzp.on("payment.failed", (resp) =>
      reject(new Error(resp?.error?.description || "Payment failed"))
    );
    rzp.open();
  });

  if (!result) return { cancelled: true };

  await api.verifyPayment(bill.id, {
    razorpay_order_id: result.razorpay_order_id,
    razorpay_payment_id: result.razorpay_payment_id,
    razorpay_signature: result.razorpay_signature,
    amount,
  });
  return { paid: true };
}
