import "dotenv/config";
import express from "express";
import cors from "cors";
import { createHmac } from "crypto";
import { prisma } from "./prisma.js";
import { razorpayEnabled } from "./razorpay.js";
import { storageEnabled } from "./storage.js";
import { aiEnabled } from "./ai.js";
import { authRouter } from "./routes/auth.js";
import { maintenanceRouter } from "./routes/maintenance.js";
import { visitorsRouter } from "./routes/visitors.js";
import { adminRouter } from "./routes/admin.js";
import { superadminRouter } from "./routes/superadmin.js";
import { aiRouter } from "./routes/ai.js";

const app = express();
app.use(cors());

// Razorpay webhook needs the RAW body to verify the signature, so it must be
// registered before the JSON body parser.
app.post("/api/razorpay/webhook", express.raw({ type: "*/*" }), async (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET || "";
  if (!secret) return res.status(503).json({ message: "Webhook not configured" });
  const signature = req.headers["x-razorpay-signature"];
  const expected = createHmac("sha256", secret).update(req.body).digest("hex");
  if (signature !== expected) {
    return res.status(400).json({ message: "Invalid webhook signature" });
  }
  const event = JSON.parse(req.body.toString());
  if (event.event === "payment.captured" || event.event === "order.paid") {
    const orderId =
      event.payload?.payment?.entity?.order_id || event.payload?.order?.entity?.id;
    const bill = orderId ? await prisma.bill.findFirst({ where: { orderId } }) : null;
    if (bill && bill.status !== "paid") {
      await prisma.bill.update({
        where: { id: bill.id },
        data: {
          status: "paid",
          paidAt: new Date(),
          paymentRef: event.payload?.payment?.entity?.id || bill.paymentRef,
        },
      });
    }
  }
  res.json({ ok: true });
});

// Visitor photos are sent as base64, so allow a larger JSON body.
app.use(express.json({ limit: "12mb" }));

app.get("/api/health", (_req, res) =>
  res.json({ ok: true, name: "H2O", razorpay: razorpayEnabled, storage: storageEnabled, ai: aiEnabled })
);

app.use("/api", authRouter);
app.use("/api", maintenanceRouter);
app.use("/api", visitorsRouter);
app.use("/api/admin", adminRouter);
app.use("/api/superadmin", superadminRouter);
app.use("/api/ai", aiRouter);

const PORT = process.env.PORT || 4000;
// Bind explicitly to IPv4 all-interfaces so phones on the LAN can connect.
app.listen(PORT, "0.0.0.0", () => {
  console.log(`H2O server running on http://0.0.0.0:${PORT}`);
});
