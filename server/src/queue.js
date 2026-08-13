// Notification queue for push + email. Goal: get fan-out OFF the request path.
//
// - Default (no REDIS_URL): a bounded in-process async worker drains jobs with
//   limited concurrency and light retries. Non-blocking, no new infrastructure,
//   behaviour-compatible with the old inline sendPush/sendEmail calls.
// - With REDIS_URL: jobs go to a BullMQ queue so they survive restarts and are
//   shared across API instances; a worker (started via startQueueWorkers) runs them.
//
// Either way the public API is the same: enqueuePush / enqueueEmail return
// immediately and never throw into the caller.

import { sendPush } from "./push.js";
import { sendEmail } from "./email.js";

const REDIS_URL = process.env.REDIS_URL || "";
const CONCURRENCY = Number(process.env.QUEUE_CONCURRENCY || 8);
const MAX_INMEM = Number(process.env.QUEUE_MEM_MAX || 10000);

export const queueBackend = REDIS_URL ? "redis" : "memory";

// The actual work for a single job (used by both backends).
async function process_(job) {
  if (job.type === "push") {
    await sendPush(job.token, job.title, job.body, job.data || {});
  } else if (job.type === "email") {
    await sendEmail(job.payload);
  }
}

/* ----------------------------- in-process mode ---------------------------- */
const q = [];
let active = 0;

function pump() {
  while (active < CONCURRENCY && q.length) {
    const job = q.shift();
    active++;
    Promise.resolve()
      .then(() => process_(job))
      .catch(async (e) => {
        // one cheap retry for transient failures
        if ((job._tries || 0) < 1) {
          job._tries = (job._tries || 0) + 1;
          q.push(job);
        } else {
          console.error(`[queue] ${job.type} job failed:`, e?.message || e);
        }
      })
      .finally(() => {
        active--;
        pump();
      });
  }
}

function enqueueMem(job) {
  if (q.length >= MAX_INMEM) {
    // Shed load rather than grow unbounded; a dropped notification is
    // preferable to an OOM. (Set REDIS_URL for durable delivery.)
    console.warn("[queue] in-memory queue full, dropping oldest job");
    q.shift();
  }
  q.push(job);
  pump();
}

/* -------------------------------- redis mode ------------------------------ */
let bullQueue = null;
let bullTried = false;

async function getBullQueue() {
  if (!REDIS_URL) return null;
  if (bullQueue || bullTried) return bullQueue;
  bullTried = true;
  try {
    const { Queue } = await import("bullmq");
    bullQueue = new Queue("notify", { connection: { url: REDIS_URL } });
    return bullQueue;
  } catch (e) {
    console.warn("[queue] bullmq unavailable, using in-memory queue:", e.message);
    return null;
  }
}

async function enqueue(job) {
  const bq = await getBullQueue();
  if (bq) {
    try {
      await bq.add(job.type, job, {
        removeOnComplete: 1000,
        removeOnFail: 500,
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
      });
      return;
    } catch (e) {
      console.warn("[queue] enqueue to redis failed, running in-process:", e.message);
    }
  }
  enqueueMem(job);
}

/* --------------------------------- public --------------------------------- */
// Fire-and-forget: schedule a push; returns immediately.
export function enqueuePush(token, title, body, data = {}) {
  if (!token) return;
  enqueue({ type: "push", token, title, body, data }).catch(() => {});
}

// Fire-and-forget: schedule an email (same payload shape as sendEmail).
export function enqueueEmail(payload) {
  if (!payload?.to) return;
  enqueue({ type: "email", payload }).catch(() => {});
}

// Start the BullMQ worker (only meaningful in redis mode). No-op otherwise, since
// the in-process worker drains as jobs arrive. Call once at server boot.
export async function startQueueWorkers() {
  if (!REDIS_URL) return { started: false, backend: "memory" };
  try {
    const { Worker } = await import("bullmq");
    const worker = new Worker("notify", async (job) => process_(job.data), {
      connection: { url: REDIS_URL },
      concurrency: CONCURRENCY,
    });
    worker.on("failed", (job, err) => console.error(`[queue] job ${job?.id} failed:`, err?.message));
    console.log("[queue] BullMQ worker started (redis)");
    return { started: true, backend: "redis" };
  } catch (e) {
    console.warn("[queue] could not start BullMQ worker:", e.message);
    return { started: false, backend: "memory" };
  }
}
