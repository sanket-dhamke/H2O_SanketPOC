import { api } from "./api";
import { checkoutOptions } from "./razorpayCheckout";
import { loadPaymentMethods } from "./payMethods";

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

async function openRazorpay(order, methods) {
  await loadCheckoutScript();
  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay({
      ...checkoutOptions(order, methods),
      handler: (response) => resolve(response),
      modal: { ondismiss: () => resolve(null) },
    });
    rzp.on("payment.failed", (resp) =>
      reject(new Error(resp?.error?.description || "Payment failed"))
    );
    rzp.open();
  });
}

// Straight to Razorpay: one sheet, listing the instruments this society's
// account can actually charge.
async function chooseAndCheckout(order) {
  const methods = await loadPaymentMethods();
  const result = await openRazorpay(order, methods);
  if (!result) return { cancelled: true };
  return { result };
}

// Web version of the payment flow: create order -> open Razorpay web checkout
// -> verify signature. Returns { paid, mock }, { cancelled } or throws.
export async function payBill(bill, amount) {
  const order = await api.createOrder(bill.id, amount);

  if (!order.enabled) {
    await api.payBill(bill.id, amount);
    return { paid: true, mock: true };
  }

  const opened = await chooseAndCheckout(order);
  if (opened.cancelled) return { cancelled: true };
  const result = opened.result;

  if (!result) return { cancelled: true };

  await api.verifyPayment(bill.id, {
    razorpay_order_id: result.razorpay_order_id,
    razorpay_payment_id: result.razorpay_payment_id,
    razorpay_signature: result.razorpay_signature,
    amount,
  });
  return { paid: true };
}

// Web version of the booking payment flow (mirrors payBill for amenity bookings).
export async function payBooking(booking) {
  const order = await api.createBookingOrder(booking.id);

  if (!order.enabled) {
    await api.payBooking(booking.id);
    return { paid: true, mock: true };
  }

  const opened = await chooseAndCheckout(order);
  if (opened.cancelled) return { cancelled: true };
  const result = opened.result;

  await api.verifyBookingPayment(booking.id, {
    razorpay_order_id: result.razorpay_order_id,
    razorpay_payment_id: result.razorpay_payment_id,
    razorpay_signature: result.razorpay_signature,
  });
  return { paid: true };
}

// Web version of the GATEZO subscription payment (mirrors payBooking).
export async function paySubscription() {
  const order = await api.createSubscriptionOrder();

  if (!order.enabled) {
    const r = await api.paySubscriptionMock();
    return { paid: true, mock: true, ...r };
  }

  const opened = await chooseAndCheckout(order);
  if (opened.cancelled) return { cancelled: true };
  const result = opened.result;

  const r = await api.verifySubscriptionPayment({
    razorpay_order_id: result.razorpay_order_id,
    razorpay_payment_id: result.razorpay_payment_id,
    razorpay_signature: result.razorpay_signature,
  });
  return { paid: true, ...r };
}
