# Brone GUI — setup prototype

React + TypeScript frontend; Python FastAPI backend; WebSocket connection. The SVG face is a **placeholder**, not the finalized Brone design. Animation, viseme and AI adapters are currently scaffolds.

## Prerequisites
- Node.js 20.19+ or 22.12+ (Node 24 recommended)
- Python 3.10+; npm

## Terminal 1 — backend (PowerShell)
```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e ".[dev]"
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```
Linux uses `python3 -m venv .venv` and `source .venv/bin/activate`.

## Terminal 2 — frontend
```powershell
cd frontend
npm install
Copy-Item .env.example .env
npm run dev
```
Open http://127.0.0.1:5173. The demo face cycles via WebSocket every 3 seconds. The manual buttons work without the backend. Open http://127.0.0.1:8000/health to check service.

## Checks
`cd frontend && npm run build`
`cd backend && python -m pytest`

## Notes
- WebSocket demo is intentionally unidirectional and for local development only.
- FastAPI does not yet serve the frontend build, audio, or live TTS.
- No database, Tauri or ROS2 required for this baseline.
