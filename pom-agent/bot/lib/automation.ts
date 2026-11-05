// Path and content gates for the one pytest project at <repo>/automation.
// The model chooses the test text. This module decides what may be written.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const libDir = path.dirname(fileURLToPath(import.meta.url));

export type FileKind = "page" | "ui_test" | "api_test" | "conftest";

export type GateOk = {
  ok: true;
  kind: FileKind;
  relativePath: string;
  absolutePath: string;
};

export type GateNo = {
  ok: false;
  error: string;
};

const PAGE_NAME = /^pages\/[a-z][a-z0-9]*(_[a-z0-9]+)*_page\.py$/;
const UI_TEST_NAME = /^tests\/test_[a-z][a-z0-9]*(_[a-z0-9]+)*\.py$/;
const API_TEST_NAME = /^tests\/api\/test_[a-z][a-z0-9]*(_[a-z0-9]+)*\.py$/;

const SECRET_ASSIGNMENT =
  /\b(password|passwd|secret|api[_-]?key|access[_-]?token)\b\s*[:=]\s*["'`][^"'`]{3,}["'`]/i;
const ALLURE_DECORATOR = /@allure\.(feature|story|severity|title)\b/;
const PROTECTED = new Set(["pages/base_page.py", "tests/test_report_wiring.py"]);
const LOCATOR_CALL =
  /\b(get_by_[a-z_]+|locator|query_selector|query_selector_all)\s*\(/;
const PAGE_ACTION =
  /\bpage\.(click|fill|press|goto|type|check|uncheck|select_option|set_input_files)\s*\(/;
const PLAYWRIGHT_IMPORT = /^\s*(import|from)\s+playwright\b/m;
const PAGES_IMPORT = /^\s*(from\s+pages\b|import\s+pages\b)/m;

const READABLE_ROOT_FILES = new Set(["requirements.txt", "pytest.ini", "conftest.py"]);

export function automationRoot(): string {
  const fromEnv = process.env.AUTOMATION_ROOT?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.resolve(libDir, "../../../automation");
}

export function normalizeRelative(input: string): string | null {
  const trimmed = input.trim().replace(/\\/g, "/").replace(/^\.\//, "");
  if (!trimmed || trimmed.startsWith("/")) return null;
  const parts = trimmed.split("/");
  if (parts.some((part) => part === ".." || part === "." || part === "")) return null;
  return parts.join("/");
}

function insideRoot(relativePath: string): GateOk | GateNo {
  const root = automationRoot();
  const absolutePath = path.resolve(root, relativePath);
  const fromRoot = path.relative(root, absolutePath);
  if (fromRoot.startsWith("..") || path.isAbsolute(fromRoot)) {
    return { ok: false, error: "Path escapes the automation project." };
  }
  return {
    ok: true,
    kind: "conftest",
    relativePath,
    absolutePath,
  };
}

export function classifyWrite(inputPath: string): GateOk | GateNo {
  const relative = normalizeRelative(inputPath);
  if (!relative) {
    return {
      ok: false,
      error: "Path must be relative to the automation project and must not contain '..'.",
    };
  }

  if (PROTECTED.has(relative)) {
    return {
      ok: false,
      error: `${relative} is part of the framework. Add a new page or test file instead.`,
    };
  }

  let kind: FileKind;
  if (relative === "conftest.py") kind = "conftest";
  else if (PAGE_NAME.test(relative)) kind = "page";
  else if (API_TEST_NAME.test(relative)) kind = "api_test";
  else if (UI_TEST_NAME.test(relative)) kind = "ui_test";
  else {
    return {
      ok: false,
      error:
        "Write only pages/<screen>_page.py, tests/test_<name>.py, tests/api/test_<name>.py, or conftest.py. Do not add a new framework.",
    };
  }

  const located = insideRoot(relative);
  if (!located.ok) return located;
  return { ...located, kind };
}

export function classifyRead(inputPath: string): GateOk | GateNo {
  const relative = normalizeRelative(inputPath);
  if (!relative) {
    return {
      ok: false,
      error: "Path must be relative to the automation project and must not contain '..'.",
    };
  }
  const allowed =
    READABLE_ROOT_FILES.has(relative) ||
    (relative.startsWith("pages/") && relative.endsWith(".py")) ||
    (relative.startsWith("tests/") && relative.endsWith(".py"));
  if (!allowed) {
    return {
      ok: false,
      error: "That file is outside the pytest project this agent is allowed to read.",
    };
  }
  const located = insideRoot(relative);
  if (!located.ok) return located;
  const kind: FileKind =
    relative === "conftest.py"
      ? "conftest"
      : relative.startsWith("pages/")
        ? "page"
        : relative.startsWith("tests/api/")
          ? "api_test"
          : "ui_test";
  return { ...located, kind };
}

export function checkContents(kind: FileKind, source: string): { ok: true } | GateNo {
  if (!source.trim()) return { ok: false, error: "File is empty." };
  if (source.includes("\0")) return { ok: false, error: "File contains a null byte." };
  if (Buffer.byteLength(source, "utf8") > 32_000) {
    return { ok: false, error: "File is larger than 32 KB. Shorten it or split the case." };
  }
  if (SECRET_ASSIGNMENT.test(source)) {
    return {
      ok: false,
      error:
        "Hardcoded secrets are rejected. Signed-in tests use the credentials fixture (TEST_EMAIL and TEST_PASSWORD).",
    };
  }
  if (kind === "page") {
    if (!/^class\s+[A-Za-z_]\w*/m.test(source)) {
      return { ok: false, error: "A page file needs a page class." };
    }
    if (!source.includes("BasePage") && !source.includes("allure.step")) {
      return {
        ok: false,
        error: "Page actions must use BasePage or allure.step so the Allure report shows steps.",
      };
    }
    return { ok: true };
  }
  if (kind === "conftest") {
    if (!source.includes("pytest_runtest_makereport") || !source.includes("allure")) {
      return {
        ok: false,
        error: "conftest.py must keep the Allure screenshot hook (pytest_runtest_makereport).",
      };
    }
  }
  if (LOCATOR_CALL.test(source) || PAGE_ACTION.test(source)) {
    return {
      ok: false,
      error: "Locators and browser actions belong in pages/, not in tests or conftest.py.",
    };
  }
  if ((kind === "ui_test" || kind === "api_test") && PLAYWRIGHT_IMPORT.test(source)) {
    return {
      ok: false,
      error: "Tests must not import Playwright. Call a page object, or use the api fixture for HTTP.",
    };
  }
  if (kind === "api_test" && PAGES_IMPORT.test(source)) {
    return { ok: false, error: "API tests do not use page objects." };
  }
  if ((kind === "ui_test" || kind === "api_test") && (!/^\s*import\s+allure\b/m.test(source) || !ALLURE_DECORATOR.test(source))) {
    return {
      ok: false,
      error:
        "Tests need import allure and @allure.feature, @allure.story, @allure.severity, or @allure.title.",
    };
  }
  return { ok: true };
}

export function listProjectFiles(): string[] {
  const root = automationRoot();
  const found: string[] = [];
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (
        entry.name === "__pycache__" ||
        entry.name === ".pytest_cache" ||
        entry.name === ".venv" ||
        entry.name === "allure-results" ||
        entry.name === "allure-report"
      ) {
        continue;
      }
      const absolute = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        walk(absolute);
        continue;
      }
      const relative = path.relative(root, absolute).split(path.sep).join("/");
      const gate = classifyRead(relative);
      if (gate.ok) found.push(gate.relativePath);
    }
  };
  walk(root);
  found.sort();
  return found;
}
