/**
 * engine.ts
 * ---------
 * FitDuelEngine — the main entry point for the AI Engine module.
 *
 * Orchestrates:
 *   - MediaPipe PoseLandmarker initialisation
 *   - Per-frame pose analysis
 *   - Calibration phase
 *   - Rep counting + form checking
 *   - Loss-of-tracking / re-alignment handling
 *   - Emitting FrameResult and RepEvent callbacks
 *
 * Usage:
 *   const engine = await FitDuelEngine.create({ onFrame, onRepEvent });
 *   engine.processVideoFrame(videoElement, timestampMs);
 *   engine.destroy();
 */

import {
  PoseLandmarker,
  FilesetResolver,
  type PoseLandmarkerResult,
} from "@mediapipe/tasks-vision";

import { analyzePose } from "./poseAnalyzer.js";
import { calculateAngle, isPlankOrientation } from "./geometry.js";
import { Smoother } from "./smoother.js";
import { Calibrator } from "./calibrator.js";
import { PushupCounter } from "./counter.js";

import type {
  FrameResult,
  RepEvent,
  RepState,
  RepFeedback,
} from "./types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Landmark confidence below which we don't trust the reading. */
const VISIBILITY_THRESHOLD = 0.5;

/** How long (ms) to tolerate tracking loss before returning to ALIGN. */
const LOST_LIMIT_MS = 1500;

// ---------------------------------------------------------------------------
// Engine options
// ---------------------------------------------------------------------------

export interface FitDuelEngineOptions {
  /**
   * URL or path to the MediaPipe Pose Landmarker WASM bundle.
   * Defaults to the official CDN path.
   */
  wasmLoaderUrl?: string;

  /**
   * URL or path to the pose_landmarker_lite.task model file.
   * Defaults to the official MediaPipe CDN.
   */
  modelAssetPath?: string;

  /** Called on every processed frame. */
  onFrame?: (result: FrameResult) => void;

  /** Called every time a rep attempt completes (valid or not). */
  onRepEvent?: (event: RepEvent) => void;

  /** EMA alpha for angle smoothing. Default: 0.4. */
  smootherAlpha?: number;

  /** Seconds to hold the calibration pose. Default: 1.5. */
  calibrationHoldSeconds?: number;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export class FitDuelEngine {
  private landmarker: PoseLandmarker;
  private onFrame?: (result: FrameResult) => void;
  private onRepEvent?: (event: RepEvent) => void;

  private elbowSmoother: Smoother;
  private backSmoother: Smoother;
  private calibrator: Calibrator;
  private counter: PushupCounter | null = null;

  private appState: "ALIGN" | "TRACKING" = "ALIGN";
  private lostSince: number | null = null;
  private sessionStartMs: number = Date.now();

  // Prevent direct construction — use FitDuelEngine.create()
  private constructor(
    landmarker: PoseLandmarker,
    options: FitDuelEngineOptions,
  ) {
    this.landmarker = landmarker;
    this.onFrame = options.onFrame;
    this.onRepEvent = options.onRepEvent;
    this.elbowSmoother = new Smoother(options.smootherAlpha ?? 0.4);
    this.backSmoother = new Smoother(options.smootherAlpha ?? 0.4);
    this.calibrator = new Calibrator(options.calibrationHoldSeconds ?? 1.5);
  }

  // ---------------------------------------------------------------------------
  // Factory
  // ---------------------------------------------------------------------------

  static async create(options: FitDuelEngineOptions = {}): Promise<FitDuelEngine> {
    const wasmLoaderUrl =
      options.wasmLoaderUrl ??
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";

    const modelAssetPath =
      options.modelAssetPath ??
      "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task";

    const vision = await FilesetResolver.forVisionTasks(wasmLoaderUrl);

    const landmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath,
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    return new FitDuelEngine(landmarker, options);
  }

  // ---------------------------------------------------------------------------
  // Per-frame processing
  // ---------------------------------------------------------------------------

  /**
   * Process one video frame. Call this in your requestAnimationFrame loop.
   *
   * @param video      The HTMLVideoElement capturing the webcam.
   * @param timestampMs  Monotonically increasing timestamp in ms (e.g. from rAF).
   */
  processVideoFrame(video: HTMLVideoElement, timestampMs: number): FrameResult {
    const result: PoseLandmarkerResult = this.landmarker.detectForVideo(
      video,
      timestampMs,
    );

    const width = video.videoWidth;
    const height = video.videoHeight;
    const nowMs = Date.now();
    const sessionTs = nowMs - this.sessionStartMs;

    const pose = analyzePose(result, width, height);
    const detected = pose !== null;
    const confidence = pose?.confidence ?? 0;
    const haveGoodReading = detected && confidence >= VISIBILITY_THRESHOLD;

    let elbowAngle: number | null = null;
    let backAngle: number | null = null;
    let isPlank = false;

    if (haveGoodReading && pose) {
      const rawElbow = calculateAngle(pose.shoulder, pose.elbow, pose.wrist);
      const rawBack = calculateAngle(pose.shoulder, pose.hip, pose.ankle);
      elbowAngle = this.elbowSmoother.update(rawElbow);
      backAngle = this.backSmoother.update(rawBack);
      isPlank = isPlankOrientation(pose.shoulder, pose.hip, pose.ankle).isPlank;
    }

    // --- Loss-of-tracking guard (only in TRACKING) ---
    if (this.appState === "TRACKING") {
      if (!haveGoodReading) {
        if (this.lostSince === null) {
          this.lostSince = nowMs;
        } else if (nowMs - this.lostSince > LOST_LIMIT_MS) {
          this._enterAlign();
        }
      } else {
        this.lostSince = null;
      }
    }

    // --- State behaviour ---
    let calibrationProgress = 0;
    let repState: RepState = this.counter?.state ?? {
      count: 0,
      stage: "up",
      feedback: "Go!",
    };

    if (this.appState === "ALIGN") {
      if (haveGoodReading && elbowAngle !== null && backAngle !== null) {
        const status = this.calibrator.update(
          elbowAngle,
          backAngle,
          confidence,
          isPlank,
          nowMs,
        );
        calibrationProgress = status.progress;

        if (status.calibrated) {
          const prevCount = this.counter?.count ?? 0;
          this.counter = new PushupCounter(status.thresholds, prevCount);
          this.appState = "TRACKING";
        }
      }
    } else {
      // TRACKING
      if (haveGoodReading && isPlank && elbowAngle !== null && backAngle !== null && this.counter) {
        const prev = this.counter.state;
        repState = this.counter.update(elbowAngle, backAngle);

        // Detect a completed rep attempt (stage just flipped back to "up")
        if (prev.stage === "down" && repState.stage === "up") {
          const repEvent: RepEvent = {
            repCompleted: true,
            valid: repState.feedback === "Good rep!",
            confidence,
            elbowAngle: elbowAngle,
            backAngle: backAngle,
            timestamp: sessionTs,
          };
          this.onRepEvent?.(repEvent);
        }
      } else if (this.counter) {
        // Paused — return current state with appropriate feedback
        const pauseFeedback: RepFeedback = !haveGoodReading
          ? "Lost tracking - hold position..."
          : "Not in plank position - counting paused";
        repState = {
          count: this.counter.count,
          stage: this.counter.stage,
          feedback: pauseFeedback,
        };
      }
    }

    const frameResult: FrameResult = {
      timestamp: sessionTs,
      detected,
      confidence,
      isPlank,
      elbowAngle,
      backAngle,
      appState: this.appState,
      calibrationProgress,
      rep: repState,
    };

    this.onFrame?.(frameResult);
    return frameResult;
  }

  // ---------------------------------------------------------------------------
  // Controls
  // ---------------------------------------------------------------------------

  /** Force a return to the ALIGN phase (e.g. user pressed 'R'). */
  realign(): void {
    this._enterAlign();
  }

  /** Release all MediaPipe resources. */
  destroy(): void {
    this.landmarker.close();
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private _enterAlign(): void {
    this.appState = "ALIGN";
    this.lostSince = null;
    this.calibrator.reset();
    this.elbowSmoother.reset();
    this.backSmoother.reset();
  }
}
