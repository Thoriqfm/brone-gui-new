#!/usr/bin/env bash
set -euo pipefail
printf 'Start backend: cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --host 127.0.0.1 --port 8000\n'
printf 'Start frontend: cd frontend && npm run dev\n'
