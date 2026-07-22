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
import { communityRouter } from "./routes/community.js";
import { amenitiesRouter } from "./routes/amenities.js";
import { staffRouter } from "./routes/staff.js";
import { tenantRouter } from "./routes/tenant.js";
import { aiRouter } from "./routes/ai.js";
import cron from "node-cron";
import { runMonthlyBackups } from "./backup.js";
import { backfillSlugs } from "./slug.js";

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
app.use("/api", communityRouter);
app.use("/api", amenitiesRouter);
app.use("/api", staffRouter);
app.use("/api", tenantRouter);
app.use("/api/ai", aiRouter);

// Secure endpoint to trigger the monthly backup from an EXTERNAL scheduler
// (Render Cron Job, cron-job.org, GitHub Actions, etc.). This is the reliable
// way to run backups on hosts that sleep. Protected by a shared secret.
app.post("/api/cron/monthly-backup", async (req, res) => {
  const secret = process.env.CRON_SECRET || "";
  const provided = req.headers["x-cron-secret"] || req.query.secret;
  if (!secret || provided !== secret) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  try {
    const result = await runMonthlyBackups();
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// In-process schedule (works whenever the server is awake): every day at 23:30,
// if tomorrow is a new month, run the monthly backups. Disable with
// BACKUP_CRON_ENABLED=false. For sleeping hosts, also wire the external endpoint.
if (process.env.BACKUP_CRON_ENABLED !== "false") {
  cron.schedule("30 23 * * *", async () => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    if (tomorrow.getMonth() !== now.getMonth()) {
      console.log("[backup] last day of month — running monthly backups");
      try {
        await runMonthlyBackups();
      } catch (e) {
        console.error("[backup] monthly run failed:", e.message);
      }
    }
  });
}

const PORT = process.env.PORT || 4000;
// Bind explicitly to IPv4 all-interfaces so phones on the LAN can connect.
app.listen(PORT, "0.0.0.0", () => {
  console.log(`H2O server running on http://0.0.0.0:${PORT}`);
  // Ensure every existing tenant has a branded-login slug (idempotent).
  backfillSlugs()
    .then((n) => n > 0 && console.log(`Backfilled slugs for ${n} societ(y/ies).`))
    .catch((e) => console.error("Slug backfill failed:", e.message));
});
