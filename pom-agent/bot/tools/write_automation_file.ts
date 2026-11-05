import fs from "node:fs";
import nodePath from "node:path";
import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { checkContents, classifyWrite } from "../lib/automation.js";

type WriteResult = {
  ok: boolean;
  persisted: boolean;
  path?: string;
  kind?: string;
  bytes?: number;
  error?: string;
  reason?: string;
};

export default defineTool({
  description:
    "Create or replace one page object or pytest file in the existing automation project. Refuses any other path, locators inside tests, missing Allure decorators, and hardcoded secrets. path is relative (pages/home_page.py, tests/test_home.py, tests/api/test_health.py, or conftest.py).",
  inputSchema: z.object({
    path: z.string().min(1),
    contents: z.string(),
  }),
  effect: "write",
  dryRunResult: ({ path }): WriteResult => ({
    ok: true,
    persisted: false,
    path,
    reason: "dry-run",
  }),
  execute({ path, contents }, ctx): WriteResult {
    const gate = classifyWrite(path);
    if (!gate.ok) return { ok: false, persisted: false, error: gate.error };
    const content = checkContents(gate.kind, contents);
    if (!content.ok) {
      return { ok: false, persisted: false, path: gate.relativePath, error: content.error };
    }
    if (ctx.session.purpose === "eval") {
      return {
        ok: true,
        persisted: false,
        path: gate.relativePath,
        kind: gate.kind,
        bytes: Buffer.byteLength(contents, "utf8"),
        reason: "eval",
      };
    }
    fs.mkdirSync(nodePath.dirname(gate.absolutePath), { recursive: true });
    fs.writeFileSync(gate.absolutePath, contents.endsWith("\n") ? contents : `${contents}\n`, "utf8");
    return {
      ok: true,
      persisted: true,
      path: gate.relativePath,
      kind: gate.kind,
      bytes: Buffer.byteLength(contents, "utf8"),
    };
  },
});
