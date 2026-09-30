/**
 * calibrator.test.ts
 * ------------------
 */

import { describe, it, expect, vi } from "vitest";
import { Calibrator } from "../src/calibrator.js";

describe("Calibrator", () => {
  it("returns not-calibrated with 0 progress when pose is invalid", () => {
    const cal = new Calibrator(1.5);
    const status = cal.update(120, 160, 0.8, true); // elbow too low
    expect(status.calibrated).toBe(false);
    expect(status.progress).toBe(0);
  });

  it("returns not-calibrated when not in plank", () => {
    const cal = new Calibrator(1.5);
    const status = cal.update(160, 160, 0.8, false); // plank=false
    expect(status.calibrated).toBe(false);
  });

  it("returns not-calibrated when confidence is too low", () => {
    const cal = new Calibrator(1.5);
    const status = cal.update(160, 160, 0.3, true); // confidence=0.3 < 0.5
    expect(status.calibrated).toBe(false);
  });

  it("accumulates progress over time", () => {
    const cal = new Calibrator(2.0);
    const t0 = Date.now();
    const s1 = cal.update(160, 160, 0.8, true, t0);
    const s2 = cal.update(160, 160, 0.8, true, t0 + 1000); // 1s in
    expect(s1.calibrated).toBe(false);
    expect(s2.progress).toBeCloseTo(0.5, 1);
  });

  it("returns calibrated after holdSeconds", () => {
    const cal = new Calibrator(1.5);
    const t0 = Date.now();
    // Feed enough frames to fill the hold
    cal.update(160, 165, 0.9, true, t0);
    const status = cal.update(162, 167, 0.9, true, t0 + 2000);
    expect(status.calibrated).toBe(true);
    expect(status.progress).toBe(1);
    expect(status.thresholds).not.toBeNull();
  });

  it("resets if alignment is broken mid-hold", () => {
    const cal = new Calibrator(2.0);
    const t0 = Date.now();
    cal.update(160, 160, 0.8, true, t0);
    cal.update(160, 160, 0.8, true, t0 + 500);
    // Break alignment
    cal.update(120, 160, 0.8, true, t0 + 600); // elbow too low
    const after = cal.update(160, 160, 0.8, true, t0 + 700);
    expect(after.progress).toBeCloseTo(0, 1); // should restart from ~0
  });
});
