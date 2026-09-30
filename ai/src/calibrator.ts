/**
 * calibrator.ts
 * -------------
 * Waits for the user to hold a valid push-up starting position for
 * `holdSeconds`, then derives personalised angle thresholds for that
 * specific person/camera setup.
 *
 * Port of the Python prototype's `Calibrator` class.
 */

import { deriveThresholds } from "./geometry.js";
import type { CalibrationStatus } from "./types.js";

/** Minimum elbow angle to be considered "arms extended". */
const MIN_UP_ANGLE = 150;

/** Minimum back angle to be considered "back straight". */
const MIN_BACK_STRAIGHT = 155;

/** Minimum landmark visibility to trust a reading. */
const VISIBILITY_THRESHOLD = 0.5;

export class Calibrator {
  private holdSeconds: number;
  private holdStart: number | null = null;
  private elbowSamples: number[] = [];
  private backSamples: number[] = [];

  constructor(holdSeconds = 1.5) {
    this.holdSeconds = holdSeconds;
  }

  reset(): void {
    this.holdStart = null;
    this.elbowSamples = [];
    this.backSamples = [];
  }

  /**
   * Call once per frame during the ALIGN phase.
   *
   * @param elbowAngle  Smoothed elbow angle (degrees).
   * @param backAngle   Smoothed back (shoulder-hip-ankle) angle (degrees).
   * @param confidence  Visibility score for the detected side (0–1).
   * @param isPlank     Whether the body is in horizontal plank orientation.
   * @param nowMs       Current timestamp in milliseconds (default: Date.now()).
   */
  update(
    elbowAngle: number,
    backAngle: number,
    confidence: number,
    isPlank: boolean,
    nowMs = Date.now(),
  ): CalibrationStatus {
    const aligned =
      confidence >= VISIBILITY_THRESHOLD &&
      elbowAngle >= MIN_UP_ANGLE &&
      backAngle >= MIN_BACK_STRAIGHT &&
      isPlank;

    if (!aligned) {
      this.reset();
      return { calibrated: false, progress: 0, thresholds: null };
    }

    if (this.holdStart === null) {
      this.holdStart = nowMs;
    }

    this.elbowSamples.push(elbowAngle);
    this.backSamples.push(backAngle);

    const heldForMs = nowMs - this.holdStart;
    const progress = Math.min(heldForMs / (this.holdSeconds * 1000), 1);

    if (heldForMs < this.holdSeconds * 1000) {
      return { calibrated: false, progress, thresholds: null };
    }

    // Compute means
    const meanElbow =
      this.elbowSamples.reduce((a, b) => a + b, 0) / this.elbowSamples.length;
    const meanBack =
      this.backSamples.reduce((a, b) => a + b, 0) / this.backSamples.length;

    const thresholds = deriveThresholds(meanElbow, meanBack);

    return {
      calibrated: true,
      progress: 1,
      thresholds: {
        downThresh: thresholds.downThresh,
        upThresh: thresholds.upThresh,
        backStraightMin: thresholds.backStraightMin,
      },
    };
  }
}
