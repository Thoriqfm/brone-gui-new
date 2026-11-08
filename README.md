# Brone GUI

Browser-based 2D robot face built with React + TypeScript and a Python FastAPI backend. Expression rendering, transitions, and JSON command delivery through HTTP/WebSocket are implemented. Visemes and live STT/LLM/TTS inference are not implemented.

## Prerequisites

- Node.js 20.19+ or 22.12+; Node 24 recommended.
- Python 3.10+ and npm.

Run the setup and daily commands below from the repository root.

## One-time setup

Skip this step if `backend/.venv` and the application dependencies are already installed.

Windows PowerShell:

```powershell
py -m venv backend/.venv
.\backend\.venv\Scripts\python.exe -m pip install -e "./backend[dev]"
npm.cmd --prefix frontend install
```

Linux/macOS:

```bash
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install -e './backend[dev]'
npm --prefix frontend install
```

The launcher uses the virtualenv directly. Activating it or installing dependencies at the repository root is not required.

## Daily development: one command

First stop any frontend or backend servers previously started in separate terminals with **Ctrl+C**, so ports 5173 and 8000 are available.

Windows PowerShell:

```powershell
npm.cmd run dev
```

Linux/macOS:

```bash
npm run dev
```

The root command starts both services in one terminal:

| Service | Address |
| --- | --- |
| Frontend | http://127.0.0.1:5173 |
| Backend health | http://127.0.0.1:8000/health |
| Swagger API docs | http://127.0.0.1:8000/docs |

The launcher runs FastAPI with reload and Vite with hot reload, enables the local WebSocket connection automatically, and displays both services' logs in the same terminal. It sets `VITE_WS_ENABLED=true` and `VITE_WS_URL=ws://127.0.0.1:8000/ws/face` for that frontend process; it does not edit your environment files.

Use **Ctrl+C** in this terminal to stop both services, including the backend reload worker. The launcher also requests shutdown of the other service if either one fails or exits. If a port is occupied, stop the existing server and run the command again; the launcher does not select a different port automatically.

On Linux/macOS, `bash scripts/start-dev.sh` runs the same launcher.

## Try an expression command

Open the frontend and press **H** to check that the status is **Backend connected**.

Open Swagger, select `POST /api/face/expression`, click **Try it out**, and submit:

```json
{
  "type": "SET_EXPRESSION",
  "request_id": "demo-001",
  "payload": {
    "emotion": "happy"
  }
}
```

Omitted `intensity` defaults to `1`; omitted `transition_ms` defaults to `700`. Both can be overridden with valid values, including zero. Intensity is validated and stored but does not yet affect the visual expression.

Available expressions: `idle`, `happy`, `happier`, `sad`, `cry`, `shock`, `thinking`, `timeout`. The backend keeps the latest expression and sends it on frontend reconnect. State resets to idle when the backend restarts.

See [the local LLM integration demo](docs/LOCAL_LLM_DEMO.md) for PowerShell requests, reconnect checks, and the team integration contract. See [the protocol](docs/PROTOCOL.md) for message details.

## Run services separately (optional)

The root launcher is the normal development entry point. Use separate terminals only when working on one service independently.

Backend, from the repository root:

```powershell
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000 --log-config ../scripts/backend-logging.json
```

Frontend, in another terminal opened at the repository root:

```powershell
cd frontend
npm.cmd run dev
```

Standalone frontend mode has WebSocket disabled by default. To connect it to the backend, set these values in `frontend/.env.local` and restart Vite:

```dotenv
VITE_WS_ENABLED=true
VITE_WS_URL=ws://127.0.0.1:8000/ws/face
```

Manual expression controls work without a backend. On Linux/macOS, the standalone backend Python path is `./.venv/bin/python`; use `npm` instead of `npm.cmd`.

## Verification

Windows PowerShell, from the repository root:

```powershell
.\backend\.venv\Scripts\python.exe -m pytest backend/tests
npm.cmd --prefix frontend run typecheck
npm.cmd --prefix frontend run build
```

With the backend running, verify HTTP delivery through WebSocket into the frontend parser, controller, and store:

```powershell
cd frontend
node scripts/verify-live-face-integration.mjs
```

This integration check sends test commands and finishes on idle; it does not replace visual browser checks. On Linux/macOS, use `backend/.venv/bin/python` and `npm`.

## Development boundaries

- Services bind to loopback for local development. Remote access requires authentication and appropriate origin controls.
- The backend holds state in one process; do not use multiple workers for this prototype.
- FastAPI does not serve the frontend build, audio, or live TTS.
- No database, Tauri, Electron, or ROS2 is required.
