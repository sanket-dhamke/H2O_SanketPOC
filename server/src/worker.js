import "dotenv/config";
import { startQueueWorkers, queueBackend } from "./queue.js";
import { log } from "./log.js";

// Separate process: `node src/worker.js`. Only useful when REDIS_URL is set so
// the API can enqueue and this process drains. Without Redis, jobs already
// drain inside the API — do not run two copies of that in-memory queue.

const result = await startQueueWorkers();
if (!result.started) {
  log.warn("worker idle", {
    backend: queueBackend,
    hint: "Set REDIS_URL to drain BullMQ in this process. Until then the API drains jobs in-memory.",
  });
  process.exit(0);
}

log.info("worker running", { backend: result.backend });
