#!/usr/bin/env bash
# Install and start a headless L7 Code server inside a Boat sandbox.
# Override via Settings → Boat → Bootstrap command when shipping a custom binary.
set -euo pipefail

PORT="${L7CODE_PORT:-3773}"
HOME_DIR="${L7CODE_HOME:-$HOME/.l7}"
WORKDIR="${L7_BOAT_WORKDIR:-$HOME/l7code}"
REPO_URL="${L7_BOAT_REPO:-https://github.com/lawrence-millard/l7code2.0.git}"

mkdir -p "$HOME_DIR" "$WORKDIR"
cd "$WORKDIR"

if ! command -v node >/dev/null 2>&1; then
  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update -y
    sudo apt-get install -y curl ca-certificates
  fi
  curl -fsSL https://fnm.vercel.app/install | bash
  # shellcheck disable=SC1091
  export PATH="$HOME/.local/share/fnm:$PATH"
  eval "$(fnm env)"
  fnm install 26
  fnm use 26
fi

if ! command -v pnpm >/dev/null 2>&1; then
  corepack enable || true
  corepack prepare pnpm@latest --activate || npm install -g pnpm
fi

if [ ! -d .git ]; then
  git clone --depth 1 "$REPO_URL" .
fi

pnpm install --frozen-lockfile || pnpm install
pnpm --filter l7 build:bundle || pnpm --filter l7 build || true

export L7CODE_HOME="$HOME_DIR"
export L7CODE_PORT="$PORT"
export L7CODE_HOST="127.0.0.1"

# Prefer the built CLI; fall back to tsx/dev entry.
if [ -x apps/server/dist/bin.mjs ]; then
  exec node apps/server/dist/bin.mjs serve --host 127.0.0.1 --port "$PORT"
elif command -v l7 >/dev/null 2>&1; then
  exec l7 serve --host 127.0.0.1 --port "$PORT"
else
  exec pnpm --filter l7 exec -- node --experimental-strip-types src/bin.ts serve --host 127.0.0.1 --port "$PORT"
fi
