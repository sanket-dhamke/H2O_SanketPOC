import { defineEval, includes } from "@grok/agent-sdk/evals";

export default defineEval({
  tags: ["smoke"],
  description: "A UI case is written as an Allure pytest file under tests/, not as a new framework.",
  async test(t) {
    await t.send(
      "Test case: Open the home page and confirm the Welcome heading is visible. Add this as a UI pytest test in the existing project, using the page object model and Allure feature, story, severity, and title. Do not create a new framework. No base URL override.",
    );
    t.succeeded();
    t.calledTool("list_automation_files");
    t.calledTool("write_automation_file", {
      status: "completed",
      input: (value) => {
        if (!value || typeof value !== "object") return false;
        const record = value as { path?: unknown; contents?: unknown };
        const filePath = String(record.path ?? "");
        const contents = String(record.contents ?? "");
        return (
          /^tests\/test_[a-z0-9_]+\.py$/.test(filePath) &&
          contents.includes("import allure") &&
          contents.includes("@allure.feature") &&
          contents.includes("@allure.title")
        );
      },
      output: (value) => {
        if (!value || typeof value !== "object") return false;
        const result = value as { ok?: unknown; persisted?: unknown };
        return result.ok === true && result.persisted === false;
      },
    });
    t.maxToolCalls(8);
    t.check(t.reply, includes(/pytest/i));
    t.check(t.reply, includes(/allure/i));
  },
});
