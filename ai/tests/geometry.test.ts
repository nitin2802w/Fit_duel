/**
 * geometry.test.ts
 * ----------------
 * Unit tests for all pure geometry helpers.
 * These run in Node (no DOM / MediaPipe needed).
 */

import { describe, it, expect } from "vitest";
import {
  calculateAngle,
  tiltFromHorizontal,
  isPlankOrientation,
  deriveThresholds,
  MAX_BODY_TILT_DEG,
} from "../src/geometry.js";
import type { Point2D } from "../src/types.js";

// ---------------------------------------------------------------------------
// calculateAngle
// ---------------------------------------------------------------------------
describe("calculateAngle", () => {
  it("returns 90° for a right angle", () => {
    const a: Point2D = [0, 0];
    const b: Point2D = [1, 0];
    const c: Point2D = [1, 1];
    expect(calculateAngle(a, b, c)).toBeCloseTo(90, 1);
  });

  it("returns 180° for a straight line", () => {
    const a: Point2D = [0, 0];
    const b: Point2D = [1, 0];
    const c: Point2D = [2, 0];
    expect(calculateAngle(a, b, c)).toBeCloseTo(180, 1);
  });

  it("returns 0° when all three points coincide at b", () => {
    const a: Point2D = [0, 0];
    const b: Point2D = [0, 0];
    const c: Point2D = [0, 0];
    // degenerate — just should not throw
    expect(() => calculateAngle(a, b, c)).not.toThrow();
  });

  it("is symmetric: angle(a,b,c) == angle(c,b,a)", () => {
    const a: Point2D = [0, 0];
    const b: Point2D = [2, 1];
    const c: Point2D = [4, 0];
    expect(calculateAngle(a, b, c)).toBeCloseTo(calculateAngle(c, b, a), 5);
  });
});

// ---------------------------------------------------------------------------
// tiltFromHorizontal
// ---------------------------------------------------------------------------
describe("tiltFromHorizontal", () => {
  it("returns 0° for a perfectly horizontal line", () => {
    expect(tiltFromHorizontal([0, 5], [10, 5])).toBeCloseTo(0, 1);
  });

  it("returns ~90° for a perfectly vertical line", () => {
    expect(tiltFromHorizontal([5, 0], [5, 10])).toBeCloseTo(90, 1);
  });

  it("returns ~45° for a diagonal line", () => {
    expect(tiltFromHorizontal([0, 0], [10, 10])).toBeCloseTo(45, 1);
  });
});

// ---------------------------------------------------------------------------
// isPlankOrientation
// ---------------------------------------------------------------------------
describe("isPlankOrientation", () => {
  const flatShoulder: Point2D = [100, 200];
  const flatHip: Point2D = [300, 210]; // almost horizontal
  const flatAnkle: Point2D = [500, 220];

  it("returns true for a near-horizontal body", () => {
    const { isPlank } = isPlankOrientation(flatShoulder, flatHip, flatAnkle);
    expect(isPlank).toBe(true);
  });

  it("returns false for an upright body", () => {
    const uprightShoulder: Point2D = [200, 50];
    const uprightHip: Point2D = [200, 250];
    const uprightAnkle: Point2D = [200, 450];
    const { isPlank } = isPlankOrientation(
      uprightShoulder,
      uprightHip,
      uprightAnkle,
    );
    expect(isPlank).toBe(false);
  });

  it("respects a custom maxTiltDeg", () => {
    // 20° tilt — should fail with maxTilt=10, pass with maxTilt=30
    const shoulder: Point2D = [0, 0];
    const hip: Point2D = [100, 36]; // ~20° tilt
    const ankle: Point2D = [200, 72];
    expect(isPlankOrientation(shoulder, hip, ankle, 10).isPlank).toBe(false);
    expect(isPlankOrientation(shoulder, hip, ankle, 30).isPlank).toBe(true);
  });

  it("exposes torso and leg tilt values", () => {
    const result = isPlankOrientation(flatShoulder, flatHip, flatAnkle);
    expect(result.torsoTiltDeg).toBeLessThan(MAX_BODY_TILT_DEG);
    expect(result.legTiltDeg).toBeLessThan(MAX_BODY_TILT_DEG);
  });
});

// ---------------------------------------------------------------------------
// deriveThresholds
// ---------------------------------------------------------------------------
describe("deriveThresholds", () => {
  it("produces thresholds within expected bounds", () => {
    const { downThresh, upThresh, backStraightMin } = deriveThresholds(170, 175);
    expect(downThresh).toBeGreaterThanOrEqual(70);
    expect(downThresh).toBeLessThanOrEqual(110);
    expect(upThresh).toBeGreaterThanOrEqual(140);
    expect(upThresh).toBeLessThanOrEqual(175);
    expect(backStraightMin).toBeGreaterThanOrEqual(140);
    expect(backStraightMin).toBeLessThanOrEqual(170);
  });

  it("always keeps a hysteresis gap ≥ 20° between downThresh and upThresh", () => {
    // Test across a range of inputs
    const inputs = [150, 160, 165, 170, 175, 180];
    for (const elbow of inputs) {
      const { downThresh, upThresh } = deriveThresholds(elbow, 170);
      expect(upThresh - downThresh).toBeGreaterThanOrEqual(20);
    }
  });
});
