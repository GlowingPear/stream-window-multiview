#!/bin/sh
# Stream Multiview launcher for macOS / Linux.
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Stream Multiview needs Node.js installed once: https://nodejs.org/ (LTS)"
  exit 1
fi
if [ ! -d node_modules/electron ] || [ -f .needs-install ]; then
  echo "First launch: installing the app engine (one time, about a minute)..."
  npm install --no-audit --no-fund || exit 1
  rm -f .needs-install
fi
node src/harden.js >/dev/null 2>&1   # keep saved logins encrypted
nohup npx electron . >/dev/null 2>&1 &
