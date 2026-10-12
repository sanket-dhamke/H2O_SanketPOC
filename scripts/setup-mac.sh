#!/usr/bin/env bash
# GATEZO local setup for macOS (Apple Silicon M1–M5 and Intel).
# Safe to re-run. Does not upload secrets.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> GATEZO Mac setup"
echo "    arch=$(uname -m)  os=$(uname -s)"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This script is for macOS. On Linux/Windows use README.md instead."
  exit 1
fi

ensure_cmd() {
  command -v "$1" >/dev/null 2>&1
}

if ! ensure_cmd node || ! ensure_cmd npm; then
  if ensure_cmd brew; then
    echo "==> Installing Node via Homebrew"
    brew install node@22 || brew install node
  else
    echo "Node.js 20+ is required. Install from https://nodejs.org then re-run this script."
    exit 1
  fi
fi

echo "==> Node $(node -v)  npm $(npm -v)"

if [[ "$(uname -m)" == "arm64" ]] && ! ensure_cmd watchman && ensure_cmd brew; then
  echo "==> Installing watchman (Metro file watching on Apple Silicon)"
  brew install watchman || true
fi

echo "==> server npm ci/install"
cd "$ROOT/server"
if [[ -f package-lock.json ]]; then npm ci; else npm install; fi
npx prisma generate
if [[ ! -f .env && -f .env.example ]]; then
  cp .env.example .env
  echo "    created server/.env from .env.example — replace secrets before going live"
fi

echo "==> app npm ci/install"
cd "$ROOT/app"
if [[ -f package-lock.json ]]; then npm ci; else npm install; fi

echo
echo "Done. Next (only if you want a local API):"
echo "  cd server && npx prisma db push && npm start"
echo "  cd app && npx expo start"
echo "Phone/simulator: Expo Go, or iOS Simulator (Xcode), or Android emulator (ARM image on M-series)."
echo "Live API is already in app.json (https://h2o-api-5sxc.onrender.com)."
