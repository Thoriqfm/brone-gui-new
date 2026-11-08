# Brone GUI — setup prototype

React + TypeScript frontend; Python FastAPI backend; WebSocket connection. The SVG face is a **placeholder**, not the finalized Brone design. Animation, viseme and AI adapters are currently scaffolds.

## Prerequisites
- Node.js 20.19+ or 22.12+ (Node 24 recommended)
- Python 3.10+; npm

## Run both services from the root

After the one-time backend virtualenv/dependency and frontend dependency setup below:

```powershell
npm.cmd run dev
```

On Linux/macOS use `npm run dev` (or `bash scripts/start-dev.sh`). No root dependency installation is needed. The launcher uses the existing `backend/.venv` and `frontend/node_modules`, runs FastAPI with reload on 8000 and Vite on 5173, and enables the local frontend WebSocket automatically. Both listen on `127.0.0.1`. Logs appear in one terminal; Ctrl+C stops both, including the backend reload worker. If either service exits, the other is stopped too. Stop any separately running servers on these ports before starting the combined launcher.

Frontend: http://127.0.0.1:5173. API docs: http://127.0.0.1:8000/docs.

The commands below remain available for running each service separately.

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
Open http://127.0.0.1:5173. To enable backend commands, set `VITE_WS_ENABLED=true` in `frontend/.env.local` and restart Vite. The backend holds the latest expression; it no longer cycles demo expressions. The manual buttons work without the backend. Open http://127.0.0.1:8000/health to check service. Follow [the local LLM integration demo](docs/LOCAL_LLM_DEMO.md) to send JSON through HTTP or Swagger UI.

## Checks
`cd frontend && npm run build`
`cd backend && python -m pytest`

## Notes
- WebSocket display updates are unidirectional and for local development only; command ingress is `POST /api/face/expression`.
- FastAPI does not yet serve the frontend build, audio, or live TTS.
- No database, Tauri or ROS2 required for this baseline.
