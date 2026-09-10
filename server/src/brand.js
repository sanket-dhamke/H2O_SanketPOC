import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const pack = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../app/src/lib/brandPack.json"), "utf8")
);

export const brand = pack.profiles[pack.active] || pack.profiles.gatemate;

export function withBrand(text) {
  return String(text).replace(/GateMate/g, brand.name);
}
