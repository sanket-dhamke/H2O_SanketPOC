#!/usr/bin/env bash
# Asks for the test account, loads scripts/qa/agent-prompt.txt, runs the
# Playwright suite when the agent has generated one, and prints report.html.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
QA_DIR="$ROOT/scripts/qa"
PROMPT_FILE="$QA_DIR/agent-prompt.txt"
VENV_PY="$QA_DIR/.venv/bin/python"
SKILL="$ROOT/.cursor/skills/web-app-qa"

log() { printf '==> %s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

[[ -f "$PROMPT_FILE" ]] || die "Missing $PROMPT_FILE"

# OUTPUT_DIR= and BASE_URL= lines in the prompt file are for this runner.
# Everything else, after comments are removed, is what we tell the agent.
OUTPUT_DIR="qa-local-qwikgate"
BASE_URL="http://localhost:8090"
while IFS= read -r line || [[ -n "$line" ]]; do
  case "$line" in
    OUTPUT_DIR=*) OUTPUT_DIR="${line#OUTPUT_DIR=}" ;;
    BASE_URL=*) BASE_URL="${line#BASE_URL=}" ;;
  esac
done < "$PROMPT_FILE"
OUTPUT_DIR="${OUTPUT_DIR%/}"
BASE_URL="${BASE_URL%/}"

default_email="${QA_EMAIL:-resident@h2o.com}"
if [[ -t 0 ]]; then
  read -rp "QA_EMAIL [$default_email]: " entered_email || true
  QA_EMAIL="${entered_email:-$default_email}"
  read -rsp "QA_PASSWORD: " QA_PASSWORD || true
  printf '\n'
else
  QA_EMAIL="${QA_EMAIL:-$default_email}"
fi
[[ -n "${QA_EMAIL}" ]] || die "QA_EMAIL is empty."
[[ -n "${QA_PASSWORD:-}" ]] || die "QA_PASSWORD is empty. Enter it when asked, or set QA_PASSWORD in the environment."

agent_message="$(
  QA_EMAIL="$QA_EMAIL" QA_PASSWORD="$QA_PASSWORD" BASE_URL="$BASE_URL" OUTPUT_DIR="$OUTPUT_DIR" \
    python3 - "$PROMPT_FILE" <<'PY'
import os, sys
text = open(sys.argv[1], encoding="utf-8").read().splitlines()
out = []
for line in text:
    stripped = line.strip()
    if stripped.startswith("#"):
        continue
    if stripped.startswith("OUTPUT_DIR=") or stripped.startswith("BASE_URL="):
        continue
    line = line.replace("{{QA_EMAIL}}", os.environ["QA_EMAIL"])
    line = line.replace("{{QA_PASSWORD}}", os.environ["QA_PASSWORD"])
    line = line.replace("{{BASE_URL}}", os.environ["BASE_URL"])
    line = line.replace("{{OUTPUT_DIR}}", os.environ["OUTPUT_DIR"])
    out.append(line)
body = "\n".join(out).strip() + "\n"
sys.stdout.write(body)
PY
)"

OUT="$ROOT/$OUTPUT_DIR"
mkdir -p "$OUT"
INSTRUCTIONS="$OUT/agent-instructions.txt"
printf '%s\n' "$agent_message" > "$INSTRUCTIONS"
chmod 600 "$INSTRUCTIONS"

log "Loaded what to tell the agent from scripts/qa/agent-prompt.txt"
log "Account: $QA_EMAIL"
log "Instructions for the agent (password filled in, file is not committed):"
log "    $INSTRUCTIONS"

SUITE="$OUT/suite"
if [[ ! -f "$SUITE/playwright.config.ts" ]]; then
  cat <<EOF

==> Playwright suite is not in $SUITE yet.
    The agent instructions were loaded automatically from scripts/qa/agent-prompt.txt.
    Open an agent chat in this repo and send:

        Follow the file $OUTPUT_DIR/agent-instructions.txt

    When that finishes, run bash scripts/qa/run.sh again.
    This log will then run the suite and point you at report.html.

EOF
  exit 0
fi

log "Running the Playwright suite in $SUITE"
(
  cd "$SUITE"
  QA_EMAIL="$QA_EMAIL" QA_PASSWORD="$QA_PASSWORD" \
    npx playwright test --project=chromium
) || suite_status=$?
suite_status="${suite_status:-0}"

REPORT="$OUT/report.html"
RESULTS="$SUITE/results/results.json"
if [[ -f "$SKILL/scripts/build_report.py" && -f "$RESULTS" ]]; then
  log "Refreshing report.html with this suite run"
  PY="$VENV_PY"
  [[ -x "$PY" ]] || PY="python3"
  "$PY" "$SKILL/scripts/build_report.py" \
    --out "$OUT" \
    --pw-results "$RESULTS" \
    --title "QA report — QwikGate" || log "Report rebuild failed. The previous report.html is unchanged if it existed."
fi

cat <<EOF

========================================
This is the output.
Check report.html:
    $REPORT
Suite exit code: $suite_status
Instructions used: $INSTRUCTIONS
========================================

EOF

exit "$suite_status"
