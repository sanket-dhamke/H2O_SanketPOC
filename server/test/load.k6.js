// k6 script for later load tests. Free to run locally:
//   k6 run server/test/load.k6.js
// Do not quote these numbers to investors unless this run actually produced them.
import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  vus: Number(__ENV.VUS || 10),
  duration: __ENV.DURATION || "30s",
};

const BASE = __ENV.API_URL || "http://localhost:4000";

export default function () {
  const health = http.get(`${BASE}/api/health`);
  check(health, { "health 200": (r) => r.status === 200 });
  sleep(1);
}
