import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "./api";
import { indiaDate } from "./helperGate";

const memory = new Map();
const inflight = new Map();
const keyFor = (userId) => `gatezo.gateDirectory.${userId}`;

// A camera picture stored inline makes the list slow to download and draw.
function listPhoto(url) {
  if (typeof url !== "string" || !url) return null;
  if (/^https?:\/\//.test(url)) return url;
  return null;
}

export function slimWorker(worker) {
  if (!worker?.id) return null;
  return {
    id: worker.id,
    name: worker.name,
    phone: worker.phone || null,
    category: worker.category || null,
    subtype: worker.subtype || null,
    photoUrl: listPhoto(worker.photoUrl),
    inside: !!worker.inside,
    attendanceId: worker.attendanceId || null,
    inAt: worker.inAt || null,
  };
}

export function peekDirectory(userId) {
  if (!userId || !memory.has(userId)) return null;
  return memory.get(userId);
}

export async function readCachedDirectory(userId) {
  if (!userId) return null;
  if (memory.has(userId)) return memory.get(userId);
  try {
    const raw = await AsyncStorage.getItem(keyFor(userId));
    const parsed = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed)) return null;
    const rows = parsed.map(slimWorker).filter(Boolean);
    memory.set(userId, rows);
    return rows;
  } catch {
    return null;
  }
}

export async function rememberDirectory(userId, workers) {
  const rows = (Array.isArray(workers) ? workers : []).map(slimWorker).filter(Boolean);
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

// Names only. Who is inside is a second, slower question and must not block this.
export function fetchDirectory(userId) {
  if (!userId) return Promise.resolve([]);
  const existing = inflight.get(userId);
  if (existing) return existing;
  const job = api
    .workers()
    .then((res) => rememberDirectory(userId, res?.workers || []))
    .finally(() => inflight.delete(userId));
  inflight.set(userId, job);
  return job;
}

// One list when the gate server has it. Otherwise each person's own log, after
// the names are already on screen.
export async function fetchGateAttendance(workers) {
  const date = indiaDate();
  try {
    return await api.workerAttendanceToday(date);
  } catch (e) {
    const missing = /404|failed \(404\)|Cannot GET/i.test(e.message || "");
    if (!missing) return { date, records: [], onPremise: 0, total: 0 };
    const lists = [];
    const queue = (workers || []).slice(0, 40);
    const next = async () => {
      const worker = queue.shift();
      if (!worker) return;
      try {
        const res = await api.workerAttendance(worker.id);
        lists.push(
          ...(res.attendance || [])
            .filter((row) => row.date === date)
            .map((row) => ({
              id: row.id,
              workerId: worker.id,
              inAt: row.inAt,
              outAt: row.outAt,
              inPhotoUrl: row.inPhotoUrl || null,
            }))
        );
      } catch {
        /* a missing log does not hide the person */
      }
      await next();
    };
    await Promise.all([next(), next(), next(), next()]);
    const records = lists.flat();
    return {
      date,
      records,
      onPremise: records.filter((row) => !row.outAt).length,
      total: records.length,
    };
  }
}
