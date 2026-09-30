# FitDuel 🏋️

> Real-time competitive push-up dueling — powered by in-browser AI pose detection.

FitDuel lets two players compete head-to-head in push-up challenges. All camera processing happens **client-side** using MediaPipe's WebAssembly Pose Landmarker — no video ever leaves your device. Only small rep-event payloads are sent to the server.

---

## Architecture

```
Browser (Camera + AI Engine) ──rep events──▶ Realtime Match Engine (WebSocket)
                                                      │
                                              Core API (FastAPI + Postgres)
                                                      │
                                    ┌─────────────────┼──────────────────┐
                                Matchmaking       Rating System       Anti-Cheat
```

## Module Map

| # | Module | Status |
|---|--------|--------|
| 1 | **AI Engine** (`/ai`) | 🚧 In Progress |
| 2 | **Web Client** (`/frontend`) | ⏳ Planned |
| 3 | **Core API** (`/backend`) | ⏳ Planned |
| 4 | **Realtime Match Engine** (`/realtime`) | ⏳ Planned |
| 5 | **Matchmaking** (`/matchmaking`) | ⏳ Planned |
| 6 | **Rating System** (`/rating`) | ⏳ Planned |
| 7 | **Anti-Cheat** (`/anti-cheat`) | ⏳ Planned |

## Quick Start

### AI Engine (Module 1)
```bash
cd ai
npm install
npm run dev        # Vite dev server with live demo page
npm test           # Run test harness
npm run build      # Production bundle
```

## Tech Stack

- **AI / Pose Detection**: `@mediapipe/tasks-vision` (WASM, runs in browser)
- **Frontend**: React + TypeScript + Vite
- **Backend**: Python FastAPI + PostgreSQL
- **Realtime**: WebSocket (Redis pub/sub)
- **Infra**: Docker + Docker Compose

## Rep Validity Rules

See [`docs/rep-validity-rules.md`](docs/rep-validity-rules.md) for the authoritative spec on what counts as a valid rep.
