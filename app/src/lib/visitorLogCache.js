import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "./api";
import { listVisitor } from "./visitorWait";

const memory = new Map();
const inflight = new Map();
const keyFor = (userId) => `gatezo.visitorLog.${userId}`;

export function peekVisitors(userId) {
  if (!userId || !memory.has(userId)) return null;
  return memory.get(userId);
}

export async function readCachedVisitors(userId) {
  if (!userId) return null;
  if (memory.has(userId)) return memory.get(userId);
  try {
    const raw = await AsyncStorage.getItem(keyFor(userId));
    const parsed = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed)) return null;
    const rows = parsed.map(listVisitor);
    memory.set(userId, rows);
    return rows;
  } catch {
    return null;
  }
}

export async function rememberVisitors(userId, visitors) {
  const rows = (Array.isArray(visitors) ? visitors : []).map(listVisitor);
  if (userId) {
    memory.set(userId, rows);
    try {
      await AsyncStorage.setItem(keyFor(userId), JSON.stringify(rows));
    } catch {
      /* the in-memory copy is still enough for this session */
    }
  }
  return rows;
}

// One request shared by Home and the gate log, so opening the tab does not
// start a second download of the same list.
export function fetchVisitorLog(userId) {
  if (!userId) return Promise.resolve([]);
  const existing = inflight.get(userId);
  if (existing) return existing;
  const job = api
    .visitors({ limit: 50 })
    .then((res) => rememberVisitors(userId, res?.visitors || []))
    .finally(() => inflight.delete(userId));
  inflight.set(userId, job);
  return job;
}
