import { PrismaClient } from "@prisma/client";

// Cap Prisma connections so one API box cannot exhaust Supabase's pool.
// Override with DB_CONNECTION_LIMIT. If DATABASE_URL already has
// connection_limit (pgBouncer URLs), we leave it alone.
function databaseUrl() {
  const raw = process.env.DATABASE_URL || "";
  if (!raw || /[?&]connection_limit=/.test(raw)) return raw;
  const n = String(process.env.DB_CONNECTION_LIMIT || 10);
  return raw.includes("?") ? `${raw}&connection_limit=${n}` : `${raw}?connection_limit=${n}`;
}

export const prisma = new PrismaClient({
  datasources: { db: { url: databaseUrl() } },
});
