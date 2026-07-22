// Tenant slug helpers. A slug is a URL-friendly unique handle for a society /
// preschool, used to build branded login links & QR codes (e.g. ?t=<slug>).
import { prisma } from "./prisma.js";

export function slugify(name) {
  const base = String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || "org";
}

// One-off/idempotent: give every society without a slug a unique one. Safe to
// call on every boot; only touches rows with a null slug.
export async function backfillSlugs() {
  const missing = await prisma.society.findMany({ where: { slug: null } });
  for (const s of missing) {
    const slug = await ensureUniqueSlug(s.name, s.id);
    await prisma.society.update({ where: { id: s.id }, data: { slug } });
  }
  return missing.length;
}

// Returns a slug based on `name` that is guaranteed unique across societies.
// Optionally pass `ignoreId` to allow a society to keep its own slug on update.
export async function ensureUniqueSlug(name, ignoreId = null) {
  const base = slugify(name);
  let candidate = base;
  let n = 1;
  // Loop until we find a free slug (bounded in practice by number of collisions).
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existing = await prisma.society.findUnique({ where: { slug: candidate } });
    if (!existing || existing.id === ignoreId) return candidate;
    n += 1;
    candidate = `${base}-${n}`;
  }
}
