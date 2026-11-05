#!/usr/bin/env bash
# Steps 1 and 2 for a local QwikGate QA run.
#   1. QA tester skill, Python virtualenv, Playwright, Chromium
#   2. Local Postgres, API on :4000, web app on :8090
# Safe to re-run. Does not print passwords. Does not overwrite server/.env.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
QA_DIR="$ROOT/scripts/qa"
SKILL="$ROOT/.cursor/skills/web-app-qa"
VENV="$QA_DIR/.venv"
LOG_DIR="$QA_DIR/logs"
SKILL_REPO="https://github.com/Aswinellath/web_app_testing.git"
mkdir -p "$LOG_DIR"

log() { printf '==> %s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing '$1'. Install it, then re-run scripts/qa/setup.sh."
}

node_major() {
  node -v | sed 's/^v//' | cut -d. -f1
}

log "Step 1 — QA tester and dependencies"
need_cmd node
need_cmd npm
need_cmd python3
need_cmd git
need_cmd curl

major="$(node_major)"
if [[ "$major" -lt 18 ]]; then
  die "Node 18+ is required (found $(node -v))."
fi
log "Node $(node -v)    Python $(python3 --version 2>&1 | awk '{print $2}')"

if [[ ! -d "$SKILL/.git" ]]; then
  mkdir -p "$ROOT/.cursor/skills"
  log "Cloning the QA tester into .cursor/skills/web-app-qa"
  git clone --depth 1 "$SKILL_REPO" "$SKILL"
else
  log "QA tester already present at .cursor/skills/web-app-qa"
fi

if [[ ! -x "$VENV/bin/python" ]]; then
  log "Creating Python virtualenv at scripts/qa/.venv"
  python3 -m venv "$VENV"
fi
log "Installing Pillow into the virtualenv (report thumbnails)"
"$VENV/bin/pip" install --disable-pip-version-check -q pillow

log "Installing Playwright and axe-core for the tester"
if [[ ! -f "$SKILL/package.json" ]]; then
  (cd "$SKILL" && npm init -y >/dev/null)
fi
(cd "$SKILL" && npm install --no-audit --no-fund --loglevel=error playwright axe-core)
(cd "$SKILL" && npx playwright install chromium)

log "Step 2 — local QwikGate (Postgres, API :4000, web :8090)"

ensure_postgres() {
  if command -v pg_isready >/dev/null 2>&1 && pg_isready -h localhost -q; then
    log "Postgres is already accepting connections"
    return 0
  fi
  case "$(uname -s)" in
    Linux)
      if command -v pg_ctlcluster >/dev/null 2>&1; then
        local ver
        ver="$(ls /etc/postgresql 2>/dev/null | sort -n | tail -1 || true)"
        if [[ -n "$ver" ]]; then
          log "Starting Postgres $ver"
          sudo pg_ctlcluster "$ver" main start || true
        fi
      fi
      if ! command -v psql >/dev/null 2>&1; then
        log "Installing PostgreSQL"
        sudo apt-get update -q
        sudo apt-get install -y -q postgresql
      fi
      if command -v pg_ctlcluster >/dev/null 2>&1; then
        local ver
        ver="$(ls /etc/postgresql 2>/dev/null | sort -n | tail -1 || true)"
        [[ -n "$ver" ]] && sudo pg_ctlcluster "$ver" main start || true
      fi
      ;;
    Darwin)
      if command -v brew >/dev/null 2>&1; then
        log "Starting Postgres with Homebrew"
        brew services start postgresql@16 || brew services start postgresql || true
      fi
      ;;
  esac
  if command -v pg_isready >/dev/null 2>&1 && pg_isready -h localhost -q; then
    return 0
  fi
  die "Postgres is not running on localhost. Start it, then re-run scripts/qa/setup.sh."
}

ensure_database() {
  need_cmd psql
  if ! sudo -u postgres psql -tAc "SELECT 1" >/dev/null 2>&1; then
    die "Cannot run psql as the postgres user. Create database 'gatezo' (user postgres, password postgres) and re-run."
  fi
  sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';" >/dev/null
  if [[ "$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='gatezo'")" != "1" ]]; then
    log "Creating database gatezo"
    sudo -u postgres psql -c "CREATE DATABASE gatezo;" >/dev/null
  else
    log "Database gatezo already exists"
  fi
}

ensure_postgres
ensure_database

if [[ ! -f "$ROOT/server/.env" ]]; then
  log "Writing server/.env for local Postgres"
  cat > "$ROOT/server/.env" <<'EOF'
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/gatezo
JWT_SECRET=devsecret
PORT=4000
EOF
else
  log "Keeping existing server/.env"
  if ! grep -q 'localhost:5432/gatezo' "$ROOT/server/.env"; then
    printf 'WARNING: server/.env DATABASE_URL is not postgresql://postgres:postgres@localhost:5432/gatezo\n' >&2
    printf '         localhost:8090 calls the API on port 4000, which uses that DATABASE_URL.\n' >&2
  fi
fi

log "Installing API dependencies"
(
  cd "$ROOT/server"
  if [[ -f package-lock.json ]]; then npm ci --no-audit --no-fund --loglevel=error; else npm install --no-audit --no-fund --loglevel=error; fi
  npx prisma generate
  npx prisma db push
)

user_count="$(
  cd "$ROOT/server"
  node --input-type=module -e "import { prisma } from './src/prisma.js'; const n = await prisma.user.count(); console.log(n); await prisma.\$disconnect();"
)"
if [[ "${user_count:-0}" == "0" ]]; then
  log "Seeding demo accounts (password is the standard local demo password)"
  (cd "$ROOT/server" && node src/seed.js)
else
  log "Database already has ${user_count} users — leaving data in place"
fi

if curl -sf --max-time 3 http://localhost:4000/api/health >/dev/null; then
  log "API is already up at http://localhost:4000"
else
  log "Starting API (logs: scripts/qa/logs/api.log)"
  (
    cd "$ROOT/server"
    nohup node src/index.js >> "$LOG_DIR/api.log" 2>&1 &
    echo $! > "$LOG_DIR/api.pid"
  )
  ready=0
  for _ in $(seq 1 40); do
    if curl -sf --max-time 2 http://localhost:4000/api/health >/dev/null; then
      ready=1
      break
    fi
    sleep 1
  done
  [[ "$ready" == "1" ]] || die "API did not become healthy. See scripts/qa/logs/api.log"
fi

log "Installing web app dependencies"
(
  cd "$ROOT/app"
  if [[ -f package-lock.json ]]; then npm ci --no-audit --no-fund --loglevel=error; else npm install --no-audit --no-fund --loglevel=error; fi
)

if curl -sf --max-time 3 -o /dev/null http://localhost:8090; then
  log "Web app is already up at http://localhost:8090"
else
  log "Starting web app (logs: scripts/qa/logs/web.log)"
  (
    cd "$ROOT/app"
    CI=1 nohup npx expo start --web --port 8090 >> "$LOG_DIR/web.log" 2>&1 &
    echo $! > "$LOG_DIR/web.pid"
  )
  ready=0
  for _ in $(seq 1 90); do
    if curl -sf --max-time 2 -o /dev/null http://localhost:8090; then
      ready=1
      break
    fi
    sleep 2
  done
  [[ "$ready" == "1" ]] || die "Web app did not start. See scripts/qa/logs/web.log"
fi

cat <<EOF

==> Local QA environment is ready.
    Web app:  http://localhost:8090
    API:      http://localhost:4000/api/health
    Tester:   .cursor/skills/web-app-qa
    Python:   scripts/qa/.venv

    Edit what the agent should test:  scripts/qa/agent-prompt.txt
    Then run:                          bash scripts/qa/run.sh

EOF
