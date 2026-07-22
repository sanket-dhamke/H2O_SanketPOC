import RazorpayCheckout from "react-native-razorpay";
import { api } from "./api";

// Runs the full payment flow on a real device (iOS/Android dev build):
// 1) ask backend to create an order, 2) open the native Razorpay sheet,
// 3) verify the signature on the backend. Returns { paid, mock } or throws.
export async function payBill(bill, amount) {
  const order = await api.createOrder(bill.id, amount);

  // No Razorpay keys on the server -> fall back to the mock pay flow.
  if (!order.enabled) {
    await api.payBill(bill.id, amount);
    return { paid: true, mock: true };
  }

  const options = {
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
  };

  let result;
  try {
    result = await RazorpayCheckout.open(options);
  } catch (err) {
    // User closed the sheet or payment failed.
    if (err?.code === 0 || /cancel/i.test(err?.description || "")) {
      return { cancelled: true };
    }
    throw new Error(err?.description || "Payment failed");
  }

  await api.verifyPayment(bill.id, {
    razorpay_order_id: result.razorpay_order_id,
    razorpay_payment_id: result.razorpay_payment_id,
    razorpay_signature: result.razorpay_signature,
    amount,
  });
  return { paid: true };
}
