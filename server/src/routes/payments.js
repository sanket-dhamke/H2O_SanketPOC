import { Router } from "express";
import { authRequired } from "../auth.js";
import { razorpayEnabled, getEnabledMethods } from "../razorpay.js";

// What checkout will actually offer for this deployment's Razorpay account.
// The app reads this once per session so the "how you can pay" copy matches the
// sheet Razorpay opens — a key with UPI disabled must not advertise UPI apps.
export const paymentsRouter = Router();

paymentsRouter.get("/payments/methods", authRequired, async (_req, res) => {
  if (!razorpayEnabled) {
    return res.json({ enabled: false, known: false, upi: false, card: false, netbanking: false, wallet: false });
  }
  const methods = await getEnabledMethods();
  if (!methods) {
    // Could not ask Razorpay: assume the usual set rather than hiding options.
    return res.json({ enabled: true, known: false, upi: true, card: true, netbanking: true, wallet: false });
  }
  res.json({ enabled: true, known: true, ...methods });
});
