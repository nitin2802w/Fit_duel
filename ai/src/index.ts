/**
 * index.ts
 * --------
 * Public API of the @fitduel/ai-engine package.
 * Only export what consumers need; internal helpers stay private.
 */

// Main engine
export { FitDuelEngine } from "./engine.js";
export type { FitDuelEngineOptions } from "./engine.js";

// Types (event contract)
export type {
  FrameResult,
  RepEvent,
  RepState,
  RepStage,
  RepFeedback,
  CalibrationThresholds,
  CalibrationStatus,
  SideResult,
  BodySide,
  PlankResult,
  Point2D,
} from "./types.js";

// Internal classes (exported for testing and advanced usage)
export { PushupCounter } from "./counter.js";
export type { CounterOptions } from "./counter.js";
export { Calibrator } from "./calibrator.js";
export { Smoother } from "./smoother.js";

// Geometry utilities
export {
  calculateAngle,
  isPlankOrientation,
  tiltFromHorizontal,
  deriveThresholds,
  MAX_BODY_TILT_DEG,
} from "./geometry.js";
