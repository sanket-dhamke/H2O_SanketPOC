import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { listProjectFiles } from "../lib/automation.js";

export default defineTool({
  description:
    "List the pytest files in the existing automation project (pages, tests, conftest, requirements, pytest.ini). Call this before writing.",
  inputSchema: z.object({}),
  effect: "read",
  execute() {
    return { ok: true as const, files: listProjectFiles() };
  },
});
