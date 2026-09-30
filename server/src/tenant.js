// Application-level tenant checks. Superadmin may see any society. Everyone
// else must match JWT societyId. Row-level security in Postgres is a later,
// paid-ops upgrade — this helper is the free layer we can test without a DB.

export function canAccessSociety(user, societyId) {
  if (!user) return false;
  if (user.role === "superadmin") return true;
  return Boolean(societyId) && user.societyId === societyId;
}

export function assertSociety(user, societyId) {
  if (canAccessSociety(user, societyId)) return;
  const err = new Error("Not allowed for this society");
  err.status = 403;
  throw err;
}

export function scopedSocietyId(user) {
  if (!user) return "__none__";
  if (user.role === "superadmin") return user.societyId || null;
  return user.societyId || "__none__";
}
