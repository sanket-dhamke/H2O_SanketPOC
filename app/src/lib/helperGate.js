// Gate attendance for registered helpers. India is the society clock: a maid
// who arrives after midnight there is "today", even when the server is on UTC.

export function indiaDate(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

// Attach today's open visit to each registered helper. A helper with no open
// visit stays on the list so the guard can check them in.
export function mergeHelperDirectory(workers, records) {
  const open = new Map();
  for (const row of records || []) {
    if (row && !row.outAt && row.workerId) open.set(row.workerId, row);
  }
  return (workers || []).map((worker) => {
    const visit = open.get(worker.id) || null;
    const fromList = !visit && worker.inside && worker.attendanceId
      ? { id: worker.attendanceId, inAt: worker.inAt || null }
      : null;
    const row = visit || fromList;
    return {
      ...worker,
      inside: !!row,
      attendanceId: row?.id || null,
      inAt: row?.inAt || null,
    };
  });
}

export function insideVisits(records) {
  return (records || []).filter((row) => row && !row.outAt);
}
