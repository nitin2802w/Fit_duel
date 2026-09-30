/**
 * types.ts
 * --------
 * Shared type definitions for the FitDuel AI Engine.
 * This is the event contract between the AI Engine and the rest of the app.
 */

// ---------------------------------------------------------------------------
// 2-D point (pixel coordinates)
// ---------------------------------------------------------------------------
export type Point2D = [number, number];

// ---------------------------------------------------------------------------
// Pose side auto-detection result
// ---------------------------------------------------------------------------
export type BodySide = "left" | "right";

export interface SideResult {
  side: BodySide;
  /** Average visibility score for the chosen side's key landmarks (0–1). */
  confidence: number;
  shoulder: Point2D;
  elbow: Point2D;
  wrist: Point2D;
  hip: Point2D;
  ankle: Point2D;
}

// ---------------------------------------------------------------------------
// Plank orientation result
// ---------------------------------------------------------------------------
export interface PlankResult {
  isPlank: boolean;
  torsoTiltDeg: number;
  legTiltDeg: number;
}

// ---------------------------------------------------------------------------
// Calibration state
// ---------------------------------------------------------------------------
export interface CalibrationThresholds {
  downThresh: number;
  upThresh: number;
  backStraightMin: number;
}

export type CalibrationStatus =
  | { calibrated: false; progress: number; thresholds: null }
  | { calibrated: true; progress: 1; thresholds: CalibrationThresholds };

// ---------------------------------------------------------------------------
// Rep state machine
// ---------------------------------------------------------------------------
export type RepStage = "up" | "down";

export type RepFeedback =
  | "Go!"
  | "Good rep!"
  | "Go lower - not full range of motion"
  | "Keep your back/hips in a straight line"
  | "Lost tracking - hold position..."
  | "Not in plank position - counting paused";

export interface RepState {
  count: number;
  stage: RepStage;
  feedback: RepFeedback;
}

// ---------------------------------------------------------------------------
// The structured event emitted to the application on each frame.
// Only small events like this are ever sent to the server — never video.
// ---------------------------------------------------------------------------
export interface FrameResult {
  /** Milliseconds since the session started. */
  timestamp: number;

  /** Whether a pose was detected with sufficient confidence. */
  detected: boolean;

  /** Landmark visibility score for the chosen side (0–1). */
  confidence: number;

  /** Body is in horizontal plank orientation. */
  isPlank: boolean;

  /** Smoothed elbow angle in degrees (null if not detected). */
  elbowAngle: number | null;

  /** Smoothed back (shoulder-hip-ankle) angle in degrees (null if not detected). */
  backAngle: number | null;

  /** Current app phase. */
  appState: "ALIGN" | "TRACKING";

  /** Calibration progress 0→1 (only meaningful in ALIGN phase). */
  calibrationProgress: number;

  /** Rep count, stage, and last feedback message. */
  rep: RepState;
}

// ---------------------------------------------------------------------------
// Rep event — emitted once per completed rep attempt (valid or invalid).
// This is the payload sent over the wire to the server.
// ---------------------------------------------------------------------------
export interface RepEvent {
  repCompleted: boolean;
  valid: boolean;
  confidence: number;
  elbowAngle: number;
  backAngle: number;
  timestamp: number;
}
