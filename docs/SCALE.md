# GATEZO scale path — now (₹0 extra) vs later (paid infra)

This is the engineering answer to “can we support millions?”

**Do not tell investors the platform already supports 1–5 million concurrent users.**  
Do tell them: the product is a production-oriented MVP; it is already multi-tenant; this branch adds free seams (logs, metrics, pooling, signed uploads, CI, lockout, a worker entrypoint). Paid scale is a later ops job on the **same codebase**.

Pitch in one line: *AI-first OS for societies and preschools — gate + money + community + services — not “another MyGate.”*

---

## Already on `main` (do not rebuild)

| Piece | Status |
|---|---|
| Postgres + Prisma | In use |
| Node/Express REST | In use |
| Expo one app Android/iOS/web | In use |
| `societyId` on almost every query | In use |
| Optional `REDIS_URL` → cache + BullMQ | In use (`cache.js`, `queue.js`) |
| Razorpay webhook as source of truth + idempotent `recordPayment` | In use |
| Local-first AI resolver | In the product branches; Groq optional |
| In-process queue if no Redis | In use |
| Rate limits | In use |
| Encrypted platform backup | In use |

Throwing this away for Kubernetes/Kafka **now** is the mistake.

---

## NOW — no new paid product (this branch)

Code and GitHub Actions only. Uses the same Render Free + Supabase Free you already have.

| Change | Why |
|---|---|
| JSON request logs + `x-request-id` | You can grep incidents without Datadog |
| `GET /api/metrics` | p50/p95, error counts, hot paths — quote **measured** numbers later |
| Prisma `connection_limit` (default 10) | One box cannot exhaust the DB |
| Login lockout (email+IP, in-memory) | Stops cheap password stuffing on a single instance |
| `POST /api/uploads/sign` | Phone can PUT photos to storage instead of 12 MB JSON **when** Supabase storage env is set (keys you may already have) |
| `node src/worker.js` | When you **later** add Redis, API enqueues and this process drains |
| Tenant helper + tests | Proves society A cannot assert society B |
| GitHub Actions: `prisma validate` + `npm test` | Free CI |
| `k6` script stub | Run locally when you want numbers; do not invent them |

**Not done here (product, not infra):** AI “Pay it / book clubhouse / publish announcement” action loop, cutting the investor pitch to 3 pillars, MFA, RLS, load-test evidence. Those are next product/QA work.

**Still true:** visitor photos *can* still arrive as base64 so the current app does not break if storage is off.

### How to verify on this branch

```bash
cd server
npm test
# with a local API:
curl -s localhost:4000/api/health   # includes queueStats
curl -s localhost:4000/api/metrics
```

Load test later (install k6 yourself):

```bash
k6 run server/test/load.k6.js
```

---

## NEXT — small bill (after first paying societies)

Typical order of magnitude: **tens to low hundreds of USD / month**, not a rewrite.

1. Render **always-on** (Starter/Standard) so the API does not sleep.  
2. Supabase **Pro** (backups / PITR, more disk).  
3. **Redis** (`REDIS_URL`) — shared cache, durable queue; run `npm run worker` as a second process (Render Background Worker).  
4. Turn on `SUPABASE_*` and migrate guards to signed uploads; then lower `JSON_BODY_LIMIT`.  
5. 2–4 API copies behind Render/AWS load balancer; `RUN_QUEUE_WORKER=false` on API if workers are separate.  
6. Quote k6/Locust: login, home, visitors, pay webhook, AI — **real p95**, not a slide fiction.  
7. Postgres read replica when read traffic is the bottleneck (prove with `/api/metrics` + slow query log).

---

## LATER — only when traffic is real

Kubernetes/ECS, DB partitioning/sharding, Kafka, multi-region, WAF, Grafana/Prometheus, MFA/refresh tokens/session store in Redis, Postgres RLS, dedicated AI workers, CDN in front of photos.

Kafka is not step 1. Event bus = Redis/BullMQ until independent consumers and volume justify more.

---

## AI cost trap (keep the local resolver)

Do not send every “how much do I owe?” to Groq.

1. Deterministic assistant (already the design)  
2. Cached facts  
3. DB tools  
4. LLM last  

Paid Groq/OpenAI when daily questions exceed the free tier. Cap spend.

---

## Investor wording (use this)

“The current platform is a production-oriented MVP on a single API service and managed PostgreSQL. The app is already multi-tenant and has Redis/queue, object-storage and horizontal-scaling seams. Scale moves stateless API instances behind a load balancer, shared Redis/BullMQ workers, direct uploads, replicas/partitioning and CDN. We will validate each stage with load tests before increasing tenant volume.”
