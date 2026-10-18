#!/bin/sh
# Stream Multiview launcher for macOS / Linux.
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Stream Multiview needs Node.js installed once: https://nodejs.org/ (LTS)"
  exit 1
fi
if ! node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=12)?0:1)"; then
  echo "Stream Multiview needs Node.js 22.12 or newer (you have $(node -v)): https://nodejs.org/ (LTS)"
  exit 1
fi
if [ ! -d node_modules/electron ] || [ -f .needs-install ]; then
  echo "First launch: installing the app engine (one time, about a minute)..."
  npm install --no-audit --no-fund || exit 1
  node node_modules/electron/install.js || exit 1   # the engine itself (npm install no longer fetches it)
  rm -f .needs-install
fi
node src/main/harden.js >/dev/null 2>&1   # keep saved logins encrypted
nohup npx electron . >/dev/null 2>&1 &
