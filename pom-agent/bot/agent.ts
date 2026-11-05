import { defineAgent } from "@grok/agent-sdk";

export default defineAgent({
  name: "POM test writer",
  description:
    "Turns a plain-language test case into pytest-playwright page objects and Allure-styled tests in the existing automation project.",
  model: {
    id: "grok-4.7",
    params: [
      { id: "reasoning_effort", value: "high" },
      { id: "fast", value: "true" },
    ],
  },
  // No shell and no built-in editor. Writes go through write_automation_file.
  tools: [],
});
