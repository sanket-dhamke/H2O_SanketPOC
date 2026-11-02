import fs from "node:fs";
import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { classifyRead } from "../lib/automation.js";

const MAX_BYTES = 32_000;

export default defineTool({
  description:
    "Read one file in the pytest project. path is relative, for example pages/base_page.py or tests/api/test_health.py.",
  inputSchema: z.object({
    path: z.string().min(1),
  }),
  effect: "read",
  execute({ path }) {
    const gate = classifyRead(path);
    if (!gate.ok) return { ok: false as const, error: gate.error };
    if (!fs.existsSync(gate.absolutePath)) {
      return { ok: false as const, error: `No such file: ${gate.relativePath}` };
    }
    const stat = fs.statSync(gate.absolutePath);
    if (!stat.isFile() || stat.size > MAX_BYTES) {
      return { ok: false as const, error: `Refusing to read ${gate.relativePath}.` };
    }
    return {
      ok: true as const,
      path: gate.relativePath,
      contents: fs.readFileSync(gate.absolutePath, "utf8"),
    };
  },
});
