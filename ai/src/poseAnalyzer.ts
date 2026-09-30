/**
 * poseAnalyzer.ts
 * ---------------
 * Extracts landmark points from a MediaPipe PoseLandmarkerResult and
 * selects the best body side. Bridges MediaPipe's JS API to the rest of
 * the engine.
 */

import type { PoseLandmarkerResult } from "@mediapipe/tasks-vision";
import type { Point2D, SideResult } from "./types.js";

// MediaPipe landmark indices
const LM = {
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
} as const;

const LEFT_KEY_IDS = [
  LM.LEFT_SHOULDER,
  LM.LEFT_ELBOW,
  LM.LEFT_WRIST,
  LM.LEFT_HIP,
] as const;

const RIGHT_KEY_IDS = [
  LM.RIGHT_SHOULDER,
  LM.RIGHT_ELBOW,
  LM.RIGHT_WRIST,
  LM.RIGHT_HIP,
] as const;

/**
 * Picks the body side (left or right) that MediaPipe is most confident about,
 * and returns pixel coordinates for the five key landmarks on that side.
 *
 * @param result   Raw PoseLandmarkerResult from MediaPipe.
 * @param width    Frame width in pixels.
 * @param height   Frame height in pixels.
 * @returns null if no pose is detected.
 */
export function analyzePose(
  result: PoseLandmarkerResult,
  width: number,
  height: number,
): SideResult | null {
  if (!result.landmarks || result.landmarks.length === 0) return null;

  const lms = result.landmarks[0];
  if (!lms) return null;

  // Average visibility per side
  const leftVis =
    LEFT_KEY_IDS.reduce((s, i) => s + (lms[i]?.visibility ?? 0), 0) /
    LEFT_KEY_IDS.length;
  const rightVis =
    RIGHT_KEY_IDS.reduce((s, i) => s + (lms[i]?.visibility ?? 0), 0) /
    RIGHT_KEY_IDS.length;

  const useShoulder = leftVis >= rightVis ? LM.LEFT_SHOULDER : LM.RIGHT_SHOULDER;
  const useElbow = leftVis >= rightVis ? LM.LEFT_ELBOW : LM.RIGHT_ELBOW;
  const useWrist = leftVis >= rightVis ? LM.LEFT_WRIST : LM.RIGHT_WRIST;
  const useHip = leftVis >= rightVis ? LM.LEFT_HIP : LM.RIGHT_HIP;
  const useAnkle = leftVis >= rightVis ? LM.LEFT_ANKLE : LM.RIGHT_ANKLE;

  const toLandmark = (idx: number): Point2D => {
    const lm = lms[idx];
    if (!lm) return [0, 0];
    return [lm.x * width, lm.y * height];
  };

  return {
    side: leftVis >= rightVis ? "left" : "right",
    confidence: Math.max(leftVis, rightVis),
    shoulder: toLandmark(useShoulder),
    elbow: toLandmark(useElbow),
    wrist: toLandmark(useWrist),
    hip: toLandmark(useHip),
    ankle: toLandmark(useAnkle),
  };
}
