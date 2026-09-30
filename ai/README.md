# Module 1 — AI Engine (`/ai`)

> In-browser push-up pose detection and rep counting using MediaPipe Tasks Vision (WASM).
> **No video ever leaves the user's device.** Only small structured events are emitted.

---

## Architecture

```
HTMLVideoElement (webcam)
        │
        ▼
FitDuelEngine.processVideoFrame()
        │
        ├── PoseLandmarker (MediaPipe WASM)
        │         └── analyzePose() → SideResult (pixel coords)
        │
        ├── geometry helpers
        │         ├── calculateAngle()       → elbow & back angles
        │         └── isPlankOrientation()   → plank guard
        │
        ├── Smoother (EMA × 2)              → noise-reduced angles
        │
        ├── [ALIGN phase]
        │       └── Calibrator              → personalized thresholds
        │
        └── [TRACKING phase]
                └── PushupCounter           → rep state machine
                        └── onRepEvent()    → structured event output
```

## File Map

| File | Purpose |
|------|---------|
| [`src/types.ts`](src/types.ts) | All shared types & the event contract |
| [`src/geometry.ts`](src/geometry.ts) | Pure geometry math (angle, tilt, threshold derivation) |
| [`src/smoother.ts`](src/smoother.ts) | Exponential Moving Average |
| [`src/calibrator.ts`](src/calibrator.ts) | 1.5s alignment hold → personalized thresholds |
| [`src/counter.ts`](src/counter.ts) | UP→DOWN→UP state machine with form checks |
| [`src/poseAnalyzer.ts`](src/poseAnalyzer.ts) | Bridges MediaPipe landmarks → typed SideResult |
| [`src/engine.ts`](src/engine.ts) | Top-level orchestrator, MediaPipe init |
| [`src/index.ts`](src/index.ts) | Public API barrel export |
| [`demo/index.html`](demo/index.html) | Browser demo page for manual testing |
| [`tests/`](tests/) | Vitest unit tests (no DOM / MediaPipe required) |

## Quick Start

```bash
npm install
npm run dev        # Opens demo page at localhost:5173
npm test           # Unit tests (Node, no camera needed)
npm run build      # Production library bundle
```

## Event Contract

The engine emits two types of callbacks:

### `onFrame(result: FrameResult)` — every frame
```typescript
{
  timestamp: number,          // ms since session start
  detected: boolean,          // pose visible?
  confidence: number,         // 0–1
  isPlank: boolean,           // body is horizontal
  elbowAngle: number | null,  // smoothed degrees
  backAngle: number | null,   // smoothed degrees
  appState: "ALIGN" | "TRACKING",
  calibrationProgress: number, // 0→1
  rep: { count, stage, feedback }
}
```

### `onRepEvent(event: RepEvent)` — on each rep attempt
```typescript
{
  repCompleted: boolean,
  valid: boolean,
  confidence: number,
  elbowAngle: number,
  backAngle: number,
  timestamp: number
}
```
> This is the only payload sent to the server — never video.

## Usage Example

```typescript
import { FitDuelEngine } from "@fitduel/ai-engine";

const engine = await FitDuelEngine.create({
  onFrame(result) {
    console.log(`Reps: ${result.rep.count} | ${result.rep.feedback}`);
  },
  onRepEvent(event) {
    if (event.valid) socket.send(JSON.stringify(event)); // send to server
  },
});

// In your requestAnimationFrame loop:
engine.processVideoFrame(videoElement, timestamp);

// Force re-calibration (e.g. user pressed R):
engine.realign();

// Cleanup:
engine.destroy();
```

## Rep Validity

See [`/docs/rep-validity-rules.md`](../docs/rep-validity-rules.md) for the full spec.
