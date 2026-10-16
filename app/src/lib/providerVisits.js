// Accepted work is grouped by the visit date. A job on a later day is upcoming,
// even after the professional has already accepted it.

export function groupActiveVisits(jobs, today) {
  const active = (jobs || []).filter((job) => job.status === "accepted" || job.status === "started");
  const day = String(today || "");
  return {
    today: active.filter((job) => job.scheduledDate === day),
    upcoming: active.filter((job) => !job.scheduledDate || job.scheduledDate > day),
    earlier: active.filter((job) => job.scheduledDate && job.scheduledDate < day),
  };
}
