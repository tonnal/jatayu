#!/usr/bin/env bash
# Start the Jatayu web product locally: FastAPI backend (:8000) + Next.js (:3000).
# Demo mode needs no API keys. Ctrl-C stops both.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

[ -d .venv ] || { echo "Create the venv first: python3 -m venv .venv && .venv/bin/pip install -r requirements.txt"; exit 1; }
[ -d web/node_modules ] || { echo "Installing web deps…"; (cd web && npm install); }

echo "→ backend  http://localhost:8000"
PYTHONPATH="$ROOT" .venv/bin/python -m uvicorn api.main:app --host 127.0.0.1 --port 8000 --reload &
BACK=$!
echo "→ frontend http://localhost:3000"
(cd web && npm run dev) &
FRONT=$!

trap "kill $BACK $FRONT 2>/dev/null" EXIT
wait
