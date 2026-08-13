import { Expo } from "expo-server-sdk";

const expo = new Expo();

// Sends an Expo push notification. Silently ignores users without a valid
// registered device token (e.g. running in a simulator without push).
//
// Delivery is a TWO-step process: Expo first returns a "ticket" (accepted) and
// later a "receipt" (actually delivered by FCM/APNs). Android delivery ONLY
// works if FCM credentials are configured in EAS — otherwise Expo accepts the
// message but FCM rejects it and it never reaches the phone. We now log any
// ticket/receipt errors so that misconfiguration (e.g. missing FCM key,
// DeviceNotRegistered) is visible in the server logs instead of failing
// silently. Set PUSH_DEBUG=true to also log successful sends.
const PUSH_DEBUG = process.env.PUSH_DEBUG === "true";

export async function sendPush(pushToken, title, body, data = {}) {
  if (!pushToken || !Expo.isExpoPushToken(pushToken)) {
    if (PUSH_DEBUG) console.warn("[push] skipped — invalid/absent token:", pushToken);
    return { ok: false, reason: "invalid-token" };
  }
  try {
    const messages = [
      {
        to: pushToken,
        sound: "default",
        priority: "high", // heads-up popup on Android
        channelId: "default",
        title,
        body,
        data,
      },
    ];
    const chunks = expo.chunkPushNotifications(messages);
    const tickets = [];
    for (const chunk of chunks) {
      const chunkTickets = await expo.sendPushNotificationsAsync(chunk);
      tickets.push(...chunkTickets);
    }

    // Surface immediate ticket errors (these usually mean FCM isn't set up, the
    // token is stale, etc.). The Expo error code is the fastest way to diagnose.
    for (const t of tickets) {
      if (t.status === "error") {
        console.error(
          "[push] ticket error:",
          t.message,
          t.details?.error ? `(code=${t.details.error})` : ""
        );
      }
    }

    // Best-effort receipt check a moment later so DELIVERY failures (as opposed
    // to acceptance) also show up in the logs. Non-blocking.
    const receiptIds = tickets.filter((t) => t.id).map((t) => t.id);
    if (receiptIds.length) checkReceiptsLater(receiptIds);

    if (PUSH_DEBUG) console.log("[push] sent:", title, "->", pushToken);
    return { ok: true, tickets };
  } catch (err) {
    console.error("[push] send failed:", err.message);
    return { ok: false, reason: err.message };
  }
}

// Polls Expo for delivery receipts ~5s after sending and logs any errors. This
// is where FCM-level failures ("MismatchSenderId", "InvalidCredentials",
// "DeviceNotRegistered") surface — the single best signal that Android push
// credentials need attention.
function checkReceiptsLater(receiptIds) {
  setTimeout(async () => {
    try {
      const chunks = expo.chunkPushNotificationReceiptIds(receiptIds);
      for (const chunk of chunks) {
        const receipts = await expo.getPushNotificationReceiptsAsync(chunk);
        for (const [id, receipt] of Object.entries(receipts)) {
          if (receipt.status === "error") {
            console.error(
              "[push] receipt error:",
              receipt.message,
              receipt.details?.error ? `(code=${receipt.details.error})` : "",
              `receiptId=${id}`
            );
          }
        }
      }
    } catch (err) {
      console.error("[push] receipt check failed:", err.message);
    }
  }, 5000);
}
