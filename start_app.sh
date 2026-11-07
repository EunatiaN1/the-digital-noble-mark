#!/bin/sh
set -eu
cd "$(dirname "$0")"
if [ -x .venv/bin/python ]; then
  PYTHON=.venv/bin/python
else
  PYTHON=python3
fi
"$PYTHON" cli.py init
API_HOST="${API_HOST:-127.0.0.1}"
API_PORT="${API_PORT:-8000}"
SPAZA_DEMO_MODE="${SPAZA_DEMO_MODE:-false}"
export SPAZA_DEMO_MODE
exec "$PYTHON" -m uvicorn api:app --host "$API_HOST" --port "$API_PORT"
