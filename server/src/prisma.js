import { PrismaClient } from "@prisma/client";
import { openResult, protectQueryArgs } from "./fieldCrypto.js";

// A single shared Prisma client for the whole server process.
// Personal-data columns are sealed on the way in and opened on the way out,
// so route code keeps using plaintext emails and phone numbers.
export const prisma = new PrismaClient();

prisma.$use(async (params, next) => {
  if (params.args) protectQueryArgs(params.args);
  const result = await next(params);
  return openResult(result);
});
