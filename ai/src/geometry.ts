/**
 * geometry.ts
 * -----------
 * Pure geometry helpers — all functions are stateless and easily unit-tested.
 * Direct TypeScript port of the Python prototype's geometry utilities.
 */

import type { Point2D, PlankResult } from "./types.js";

// ---------------------------------------------------------------------------
// Joint angle
// ---------------------------------------------------------------------------

/**
 * Calculates the angle in degrees at vertex `b`, formed by the rays b→a and
 * b→c. Range: [0, 180].
 *
 * Matches the Python prototype's `calculate_angle()` exactly.
 */
export function calculateAngle(a: Point2D, b: Point2D, c: Point2D): number {
  const radians =
    Math.atan2(c[1] - b[1], c[0] - b[0]) -
    Math.atan2(a[1] - b[1], a[0] - b[0]);
  let angle = Math.abs((radians * 180) / Math.PI);
  if (angle > 180) angle = 360 - angle;
  return angle;
}

// ---------------------------------------------------------------------------
// Body orientation
// ---------------------------------------------------------------------------

/**
 * Returns the angle in degrees between the line p1→p2 and the horizontal axis.
 * 0° = perfectly horizontal, 90° = perfectly vertical.
 */
export function tiltFromHorizontal(p1: Point2D, p2: Point2D): number {
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  return (Math.atan2(Math.abs(dy), Math.abs(dx) + 1e-6) * 180) / Math.PI;
}

/** Maximum degrees from horizontal the torso/legs may be and still count as plank. */
export const MAX_BODY_TILT_DEG = 40;

/**
 * Checks whether the shoulder→hip→ankle line is lying horizontally (plank),
 * not upright (standing/kneeling). Prevents elbow-angle alone from counting
 * reps while kneeling upright.
 */
export function isPlankOrientation(
  shoulder: Point2D,
  hip: Point2D,
  ankle: Point2D,
  maxTiltDeg = MAX_BODY_TILT_DEG,
): PlankResult {
  const torsoTiltDeg = tiltFromHorizontal(shoulder, hip);
  const legTiltDeg = tiltFromHorizontal(hip, ankle);
  return {
    isPlank: torsoTiltDeg <= maxTiltDeg && legTiltDeg <= maxTiltDeg,
    torsoTiltDeg,
    legTiltDeg,
  };
}

// ---------------------------------------------------------------------------
// Threshold derivation (personalised from calibration samples)
// ---------------------------------------------------------------------------

function clamp(val: number, min: number, max: number): number {
  return Math.min(Math.max(val, min), max);
}

export interface DerivedThresholds {
  downThresh: number;
  upThresh: number;
  backStraightMin: number;
}

/**
 * Given the mean elbow and back angles observed during the calibration hold,
 * derives personalised thresholds that adapt to the user's body type and
 * camera angle — rather than assuming textbook 180°.
 */
export function deriveThresholds(
  calibratedElbow: number,
  calibratedBack: number,
): DerivedThresholds {
  const downThresh = clamp(calibratedElbow - 65, 70, 110);
  let upThresh = clamp(calibratedElbow - 15, 140, 175);
  upThresh = Math.max(upThresh, downThresh + 20); // ensure hysteresis gap
  const backStraightMin = clamp(calibratedBack - 12, 140, 170);
  return { downThresh, upThresh, backStraightMin };
}
