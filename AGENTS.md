# AGENTS.md — Brone GUI Agent Instructions

## Mission
Develop and test a **2D animated face for the Brone robot**, using React + TypeScript in the browser and Python + FastAPI for command delivery. Preserve the recognizability of the actual Brone design; the current SVG in the repository is a **placeholder**, not an approved face asset.

## Read before making changes
1. `docs/ARCHITECTURE.md` — system boundaries and data flow.
2. `docs/TECH_STACK.md` — approved tools, versions and exclusions.
3. `docs/PROTOCOL.md` and `shared/face-protocol.schema.json` — **actual current v0.1 protocol**.
4. `docs/ANIMATION_SPEC.md` — expression, viseme, and animation rules.
5. `docs/BENCHMARK_PLAN.md` — how to collect reproducible measurements.
6. `docs/RESEARCH_BASELINE.md` — what is and is not established by papers.
7. `docs/IMPLEMENTATION_PLAN.md` — milestones and acceptance criteria.

## Working rules
- First inspect existing code; **do not claim a feature exists because a file or directory exists**.
- Before editing, state the goal, affected files, dependencies, and verification steps in a short plan.
- Implement the smallest coherent vertical slice. Avoid broad rewrites, speculative abstractions, or adding frameworks without justification.
- Treat `frontend/` and `backend/` as separate application boundaries connected by an explicit protocol.
- Do not put STT, LLM, TTS, or inference logic into React rendering components.
- Do not use generated executable code from LLM outputs. Accept only validated, allowlisted JSON commands.
- Keep expression state separate from viseme/talking state; speaking can coexist with happy/sad/etc.
- Prevent per-frame React store updates/re-renders. High-frequency updates belong in the animation layer.
- All data received over WebSocket and HTTP is untrusted: validate at runtime, even when a TypeScript type exists.
- Keep `shared/face-protocol.schema.json`, TypeScript parser/types and Python Pydantic models synchronized when the protocol changes. Add valid and invalid fixtures/tests.
- The v0.1 backend **only broadcasts demo `SET_EXPRESSION` messages**. `RESET_FACE` is accepted by the frontend parser but not in shared schema or Python models. Do not imply playback/viseme messages work yet.
- Do not accidentally replace Brone artwork or violate facial design constraints. Before changing face geometry, consult `docs/ANIMATION_SPEC.md` and request actual design assets if not supplied.
- Never present target FPS/latency as measured results; record the device, software versions, sample size and methodology.
- Do not introduce Tauri, Electron, ROS2, Next.js, a database or real AI inference unless a task explicitly needs them.
- Avoid exposing local control endpoints externally without authentication/origin controls; default to loopback for development.

## Standard verification
Frontend: `cd frontend && npm install && npm run typecheck && npm run build`.
Backend: `cd backend && python -m pip install -e '.[dev]' && python -m pytest` (after creating/activating a virtualenv).
Manual: start FastAPI on port 8000, Vite on 5173, open the UI, verify health, WebSocket connectivity, manual expression commands and reconnect behavior. Report which checks were actually run, and any unverified items.

## Required completion report
Summarize changed files, observable behavior, protocol changes, tests with pass/fail status, limitations, and proposed next step. Never state an unrun test passed.
